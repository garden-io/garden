/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { containerHelpers } from "./helpers.js"
import { ConfigurationError, toGardenError } from "../../exceptions.js"
import type { PrimitiveMap } from "../../config/common.js"
import split2 from "split2"
import type { BuildActionHandler } from "../../plugin/action-types.js"
import type { ContainerBuildAction, ContainerBuildOutputs } from "./config.js"
import { defaultDockerfileName } from "./config.js"
import { joinWithPosix } from "../../util/fs.js"
import type { Resolved } from "../../actions/types.js"
import dedent from "dedent"
import {
  CONTAINER_BUILD_CONCURRENCY_LIMIT_CLOUD_BUILDER,
  CONTAINER_BUILD_CONCURRENCY_LIMIT_LOCAL,
  CONTAINER_STATUS_CONCURRENCY_LIMIT,
  type ContainerProviderConfig,
} from "./container.js"
import type { Writable } from "stream"
import type { ActionLog } from "../../logger/log-entry.js"
import type { PluginContext } from "../../plugin-context.js"
import { cloudBuilder } from "./cloudbuilder.js"
import { styles } from "../../logger/styles.js"
import type { CloudBuilderAvailableV2 } from "../../cloud/api.js"
import type { SpawnOutput } from "../../util/util.js"

export const validateContainerBuild: BuildActionHandler<"validate", ContainerBuildAction> = async ({ action }) => {
  // configure concurrency limit for build status task nodes.
  action.statusConcurrencyLimit = CONTAINER_STATUS_CONCURRENCY_LIMIT

  return {}
}

export const getContainerBuildStatus: BuildActionHandler<"getStatus", ContainerBuildAction> = async ({
  ctx,
  action,
  log,
}) => {
  // configure concurrency limit for build execute task nodes.
  const availability = await cloudBuilder.getAvailability(ctx, action)
  if (availability.available) {
    action.executeConcurrencyLimit = CONTAINER_BUILD_CONCURRENCY_LIMIT_CLOUD_BUILDER
  } else {
    action.executeConcurrencyLimit = CONTAINER_BUILD_CONCURRENCY_LIMIT_LOCAL
  }

  const outputs = action.getOutputs()
  const { identifier } = (await containerHelpers.getLocalImageInfo(outputs.localImageId, log, ctx)) || {}

  if (identifier) {
    log.debug(`Image ${identifier} already exists`)
  }

  const state = !!identifier ? "ready" : "not-ready"

  return {
    state,
    detail: {
      runtime: cloudBuilder.getActionRuntime(ctx, availability),
    },
    outputs,
  }
}

export const buildContainer: BuildActionHandler<"build", ContainerBuildAction> = async ({ ctx, action, log }) => {
  containerHelpers.checkDockerServerVersion(await containerHelpers.getDockerVersion(), log)

  const outputs = action.getOutputs()
  const identifier = outputs.localImageId

  const hasDockerfile = await containerHelpers.actionHasDockerfile(action)

  // make sure we can build the thing
  if (!hasDockerfile) {
    throw new ConfigurationError({
      message: dedent`
      Dockerfile not found at ${action.getSpec().dockerfile || defaultDockerfileName} for build ${action.name}.
      Please make sure the file exists, and is not excluded by include/exclude fields or .gardenignore files.
    `,
    })
  }

  const logEventContext = {
    origin: "docker build",
    level: "verbose" as const,
  }

  const outputStream = split2()
  outputStream.on("error", () => {})
  outputStream.on("data", (line: Buffer) => {
    ctx.events.emit("log", { timestamp: new Date().toISOString(), msg: line.toString(), ...logEventContext })
  })
  const timeout = action.getConfig("timeout")

  let res: SpawnOutput

  const availability = await cloudBuilder.getAvailability(ctx, action)
  if (availability.available) {
    res = await buildContainerInCloudBuilder({ action, availability, outputStream, timeout, log, ctx })
  } else {
    res = await buildContainerLocally({
      action,
      outputStream,
      timeout,
      log,
      ctx,
    })
  }

  return {
    state: "ready",
    outputs,
    detail: {
      fresh: true,
      buildLog: res.all || "",
      outputs,
      runtime: cloudBuilder.getActionRuntime(ctx, availability),
      details: {
        identifier,
      },
    },
  }
}

async function buildContainerLocally({
  action,
  outputStream,
  timeout,
  log,
  ctx,
  extraDockerOpts = [],
}: {
  action: Resolved<ContainerBuildAction>
  outputStream: Writable
  timeout: number
  log: ActionLog
  ctx: PluginContext<ContainerProviderConfig>
  extraDockerOpts?: string[]
}) {
  const spec = action.getSpec()
  const outputs = action.getOutputs()
  const buildPath = action.getBuildPath()

  log.info(`Building ${outputs.localImageId}...`)

  const dockerfilePath = joinWithPosix(buildPath, spec.dockerfile)

  const dockerFlags = [...getDockerBuildFlags(action, ctx.provider.config), ...extraDockerOpts]

  // If there already is a --tag flag, another plugin like the Kubernetes plugin already decided how to tag the image.
  // In this case, we don't want to add another local tag.
  // TODO: it would be nice to find a better way to become aware of the parent plugin's concerns in the container plugin.
  if (!dockerFlags.includes("--tag")) {
    dockerFlags.push(...["--tag", outputs.localImageId])

    // if deploymentImageId is different from localImageId, tag the image with deploymentImageId as well.
    if (outputs.deploymentImageId && outputs.localImageId !== outputs.deploymentImageId) {
      dockerFlags.push(...["--tag", outputs.deploymentImageId])
    }
  }

  const cmdOpts = ["build", ...dockerFlags, "--file", dockerfilePath]
  try {
    return await containerHelpers.dockerCli({
      cwd: buildPath,
      args: [...cmdOpts, buildPath],
      log,
      stdout: outputStream,
      stderr: outputStream,
      timeout,
      ctx,
    })
  } catch (e) {
    const error = toGardenError(e)
    if (error.message.includes("docker exporter does not currently support exporting manifest lists")) {
      throw new ConfigurationError({
        message: dedent`
          Your local docker image store does not support loading multi-platform images.
          If you are using Docker Desktop, you can turn on the experimental containerd image store.
          Learn more at https://docs.docker.com/go/build-multi-platform/
        `,
      })
    } else if (error.message.includes("Multi-platform build is not supported for the docker driver")) {
      throw new ConfigurationError({
        message: dedent`
          Your local docker daemon does not support building multi-platform images.
          If you are using Docker Desktop, you can turn on the experimental containerd image store.
          To build multi-platform images locally with other local docker platforms,
          you can add a custom buildx builder of type docker-container.
          Learn more at https://docs.docker.com/go/build-multi-platform/
        `,
      })
    } else if (error.message.includes("failed to push")) {
      throw new ConfigurationError({
        message: dedent`
          The Docker daemon failed to push the image to the registry.
          Please make sure that you are logged in and that you
          have sufficient permissions on this machine to push to the registry.
        `,
      })
    }
    throw error
  }
}

const BUILDKIT_LAYER_REGEX = /^#[0-9]+ \[[^ ]+ +[0-9]+\/[0-9]+\] [^F][^R][^O][^M]/
const BUILDKIT_LAYER_CACHED_REGEX = /^#[0-9]+ CACHED/

async function buildContainerInCloudBuilder(params: {
  action: Resolved<ContainerBuildAction>
  availability: CloudBuilderAvailableV2
  outputStream: Writable
  timeout: number
  log: ActionLog
  ctx: PluginContext<ContainerProviderConfig>
}) {
  const cloudbuilderStats = {
    totalLayers: 0,
    layersCached: 0,
  }

  // get basic buildkit stats
  params.outputStream.on("data", (line: Buffer) => {
    const logLine = line.toString()
    if (BUILDKIT_LAYER_REGEX.test(logLine)) {
      cloudbuilderStats.totalLayers++
    } else if (BUILDKIT_LAYER_CACHED_REGEX.test(logLine)) {
      cloudbuilderStats.layersCached++
    }
  })

  const res = await cloudBuilder.withBuilder(params.ctx, params.availability, async (builderName) => {
    const extraDockerOpts = ["--builder", builderName]

    // we add --push in the Kubernetes local-docker handler when using the Kubernetes plugin with a deploymentRegistry setting.
    // If we have --push, no need to --load.
    if (!getDockerBuildFlags(params.action, params.ctx.provider.config).includes("--push")) {
      // This action makes sure to download the image from the cloud builder, and make it available locally.
      extraDockerOpts.push("--load")
    }

    return await buildContainerLocally({ ...params, extraDockerOpts })
  })

  const log = params.ctx.log.createLog({
    name: `build.${params.action.name}`,
  })
  log.success(
    `${styles.bold("Accelerated by Garden Cloud Builder")} (${cloudbuilderStats.layersCached}/${cloudbuilderStats.totalLayers} layers cached)`
  )

  return res
}

export function getContainerBuildActionOutputs(action: Resolved<ContainerBuildAction>): ContainerBuildOutputs {
  return containerHelpers.getBuildActionOutputs(action, undefined)
}

export function getDockerBuildFlags(
  action: Resolved<ContainerBuildAction>,
  containerProviderConfig: ContainerProviderConfig
) {
  const args: string[] = []

  const { targetStage, extraFlags, buildArgs, platforms } = action.getSpec()

  for (const arg of getDockerBuildArgs(action.versionString(), buildArgs)) {
    args.push("--build-arg", arg)
  }

  if (targetStage) {
    args.push("--target", targetStage)
  }
  for (const platform of platforms || []) {
    args.push("--platform", platform)
  }

  args.push(...(extraFlags || []))
  args.push(...(containerProviderConfig.dockerBuildExtraFlags || []))

  return args
}

export function getDockerBuildArgs(version: string, specBuildArgs: PrimitiveMap) {
  const buildArgs: PrimitiveMap = {
    GARDEN_MODULE_VERSION: version,
    GARDEN_ACTION_VERSION: version,
    ...specBuildArgs,
  }

  return Object.entries(buildArgs)
    .map(([key, value]) => {
      // If the value is empty, we simply don't pass it to docker
      if (value === "") {
        return undefined
      }

      // 0 is falsy
      if (value || value === 0) {
        return `${key}=${value}`
      } else {
        // If the value of a build-arg is null, Docker pulls it from
        // the environment: https://docs.docker.com/engine/reference/commandline/build/
        return key
      }
    })
    .filter((x): x is string => !!x)
}
