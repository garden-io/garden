/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { containerHelpers } from "./helpers.js"
import { ConfigurationError } from "../../exceptions.js"
import type { PrimitiveMap } from "../../config/common.js"
import split2 from "split2"
import type { BuildActionHandler } from "../../plugin/action-types.js"
import type { ContainerBuildAction, ContainerBuildOutputs } from "./config.js"
import { defaultDockerfileName } from "./config.js"
import { joinWithPosix } from "../../util/fs.js"
import type { Resolved } from "../../actions/types.js"
import dedent from "dedent"
import { splitFirst } from "../../util/string.js"
import type { ContainerProviderConfig } from "./container.js"

export const getContainerBuildStatus: BuildActionHandler<"getStatus", ContainerBuildAction> = async ({
  ctx,
  action,
  log,
}) => {
  const outputs = action.getOutputs()
  const { identifier } = (await containerHelpers.getLocalImageInfo(outputs.localImageId, log, ctx)) || {}

  if (identifier) {
    log.debug(`Image ${identifier} already exists`)
  }

  const state = !!identifier ? "ready" : "not-ready"

  return { state, detail: {}, outputs }
}

export const buildContainer: BuildActionHandler<"build", ContainerBuildAction> = async ({ ctx, action, log }) => {
  containerHelpers.checkDockerServerVersion(await containerHelpers.getDockerVersion(), log)

  const buildPath = action.getBuildPath()
  const spec = action.getSpec()
  const hasDockerfile = await containerHelpers.actionHasDockerfile(action)

  // make sure we can build the thing
  if (!hasDockerfile) {
    throw new ConfigurationError({
      message: dedent`
      Dockerfile not found at ${spec.dockerfile || defaultDockerfileName} for build ${action.name}.
      Please make sure the file exists, and is not excluded by include/exclude fields or .gardenignore files.
    `,
    })
  }

  const outputs = action.getOutputs()

  const identifier = outputs.localImageId

  // build doesn't exist, so we create it
  log.info(`Building ${identifier}...`)

  const dockerfilePath = joinWithPosix(action.getBuildPath(), spec.dockerfile)

  const cmdOpts = [
    "build",
    "-t",
    identifier,
    ...getDockerBuildFlags(action, ctx.provider.config),
    "--file",
    dockerfilePath,
  ]

  // if deploymentImageId is different from localImageId, tag the image with deploymentImageId as well.
  if (outputs.deploymentImageId && identifier !== outputs.deploymentImageId) {
    cmdOpts.push(...["-t", outputs.deploymentImageId])
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
  const res = await containerHelpers.dockerCli({
    cwd: action.getBuildPath(),
    args: [...cmdOpts, buildPath],
    log,
    stdout: outputStream,
    stderr: outputStream,
    timeout,
    ctx,
  })

  return {
    state: "ready",
    outputs,
    detail: { fresh: true, buildLog: res.all || "", outputs, details: { identifier } },
  }
}

export function getContainerBuildActionOutputs(action: Resolved<ContainerBuildAction>): ContainerBuildOutputs {
  const buildName = action.name
  const localId = action.getSpec("localId")
  const explicitImage = action.getSpec("publishId")
  let imageId = localId
  if (explicitImage) {
    // override imageId if publishId is set
    const imageTag = splitFirst(explicitImage, ":")[1]
    const parsedImage = containerHelpers.parseImageId(explicitImage)
    const tag = imageTag || action.versionString()
    imageId = containerHelpers.unparseImageId({ ...parsedImage, tag })
  }
  const version = action.moduleVersion()

  const localImageName = containerHelpers.getLocalImageName(buildName, localId)
  const localImageId = containerHelpers.getLocalImageId(buildName, localId, version)

  // Note: The deployment image name/ID outputs are overridden by the kubernetes provider, these defaults are
  // generally not used.
  const deploymentImageName = containerHelpers.getDeploymentImageName(buildName, imageId, undefined)
  const deploymentImageId = containerHelpers.getBuildDeploymentImageId(buildName, imageId, version, undefined)

  return {
    localImageName,
    localImageId,
    deploymentImageName,
    deploymentImageId,
    "local-image-name": localImageName,
    "local-image-id": localImageId,
    "deployment-image-name": deploymentImageName,
    "deployment-image-id": deploymentImageId,
  }
}

export function getDockerBuildFlags(
  action: Resolved<ContainerBuildAction>,
  containerProviderConfig: ContainerProviderConfig
) {
  const args: string[] = []

  const { targetStage, extraFlags, buildArgs } = action.getSpec()

  for (const arg of getDockerBuildArgs(action.versionString(), buildArgs)) {
    args.push("--build-arg", arg)
  }

  if (targetStage) {
    args.push("--target", targetStage)
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
