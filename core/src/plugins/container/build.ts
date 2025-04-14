/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { containerHelpers } from "./helpers.js"
import type { GardenError } from "../../exceptions.js"
import { BuildError } from "../../exceptions.js"
import { ConfigurationError, InternalError, toGardenError } from "../../exceptions.js"
import type { PrimitiveMap } from "../../config/common.js"
import split2 from "split2"
import type { BuildActionHandler } from "../../plugin/action-types.js"
import type { ContainerBuildAction, ContainerBuildActionSpec, ContainerBuildOutputs } from "./config.js"
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
import { renderTimeDurationMs, spawn, type SpawnOutput } from "../../util/util.js"
import { isSecret, type Secret } from "../../util/secrets.js"
import { tmpdir } from "os"
import { join } from "path"
import { mkdtemp, readFile } from "fs/promises"
import type { DockerBuildReport } from "../../cloud/grow/trpc.js"
import type { ActionRuntime } from "../../plugin/base.js"

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

  const progressui = ctx.tools["container.standalone-progressui"]
  const progressuiProcess = await progressui.spawn({ log })
  progressuiProcess.stdout?.on("data", (data: Buffer) => {
    data
      .toString()
      .trim()
      .split("\n")
      .forEach((line) => {
        ctx.events.emit("log", { timestamp: new Date().toISOString(), msg: line, ...logEventContext })
      })
  })
  const dockerLogs: DockerBuildReport[] = []
  const dockerErrorLogs: string[] = []
  const outputStream = split2()
  outputStream.on("data", (line: Buffer) => {
    if (progressuiProcess.stdin) {
      progressuiProcess.stdin.write(line + "\n")
    }
    try {
      dockerLogs.push(JSON.parse(line.toString()))
    } catch (_error) {
      dockerErrorLogs.push(line.toString())
    }
  })
  const timeout = action.getConfig("timeout")

  let res: { buildResult: SpawnOutput; timeSaved: number }
  const availability = await cloudBuilder.getAvailability(ctx, action)
  const runtime = cloudBuilder.getActionRuntime(ctx, availability)
  if (availability.available) {
    res = await buildContainerInCloudBuilder({
      action,
      availability,
      outputStream,
      timeout,
      log,
      ctx,
      dockerLogs,
      dockerErrorLogs,
    })
  } else {
    res = await buildxBuildContainer({
      action,
      outputStream,
      timeout,
      log,
      ctx,
      runtime,
      dockerLogs,
      dockerErrorLogs,
    })
  }

  return {
    state: "ready",
    outputs,
    detail: {
      fresh: true,
      buildLog: res.buildResult.all || "",
      outputs,
      runtime,
      details: {
        identifier,
      },
    },
  }
}

async function buildxBuildContainer({
  action,
  outputStream,
  timeout,
  log,
  ctx,
  extraDockerOpts = [],
  runtime,
  dockerLogs,
  dockerErrorLogs,
}: {
  action: Resolved<ContainerBuildAction>
  outputStream: Writable
  timeout: number
  log: ActionLog
  ctx: PluginContext<ContainerProviderConfig>
  extraDockerOpts?: string[]
  runtime: ActionRuntime
  dockerLogs: DockerBuildReport["dockerLogs"]
  dockerErrorLogs: string[]
}): Promise<{ buildResult: SpawnOutput; timeSaved: number }> {
  const spec = action.getSpec()
  const outputs = action.getOutputs()
  const buildPath = action.getBuildPath()

  log.info(`Building ${outputs.localImageId}...`)

  const dockerfilePath = joinWithPosix(buildPath, spec.dockerfile)

  const tmpDir = await mkdtemp(join(tmpdir(), `garden-build-${action.uid.slice(0, 5)}`))
  const metadataFile = join(tmpDir, "metadata-file.json")

  const internalDockerFlags = ["--progress", "rawjson", "--metadata-file", metadataFile]

  const dockerFlags = [...getDockerBuildFlags(action, ctx.provider.config), ...extraDockerOpts, ...internalDockerFlags]

  const { secretArgs, secretEnvVars } = getDockerSecrets(action.getSpec())
  dockerFlags.push(...secretArgs)
  const buildxEnvVars = { BUILDX_METADATA_PROVENANCE: "max", BUILDX_METADATA_WARNINGS: "1" }
  const dockerEnvVars = { ...secretEnvVars, ...buildxEnvVars }

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
  const startedAt = new Date()
  const cmdOpts = ["buildx", "build", ...dockerFlags, "--file", dockerfilePath]
  let res: SpawnOutput = { all: "", stdout: "", stderr: "", code: 1, proc: null }
  let dockerBuildError: GardenError | null = null
  try {
    res = await containerHelpers.dockerCli({
      cwd: buildPath,
      args: [...cmdOpts, buildPath],
      log,
      stdout: outputStream,
      stderr: outputStream,
      timeout,
      ctx,
      env: dockerEnvVars,
    })
  } catch (e) {
    dockerBuildError = toGardenError(e)
    if (dockerBuildError.message.includes("docker exporter does not currently support exporting manifest lists")) {
      dockerBuildError = new ConfigurationError({
        message: dedent`
          Your local docker image store does not support loading multi-platform images.
          If you are using Docker Desktop, you can turn on the experimental containerd image store.
          Learn more at https://docs.docker.com/go/build-multi-platform/
        `,
      })
    } else if (dockerBuildError.message.includes("Multi-platform build is not supported for the docker driver")) {
      dockerBuildError = new ConfigurationError({
        message: dedent`
          Your local docker daemon does not support building multi-platform images.
          If you are using Docker Desktop, you can turn on the experimental containerd image store.
          To build multi-platform images locally with other local docker platforms,
          you can add a custom buildx builder of type docker-container.
          Learn more at https://docs.docker.com/go/build-multi-platform/
        `,
      })
    } else if (dockerBuildError.message.includes("failed to push")) {
      dockerBuildError = new ConfigurationError({
        message: dedent`
          The Docker daemon failed to push the image to the registry.
          Please make sure that you are logged in and that you
          have sufficient permissions on this machine to push to the registry.
        `,
      })
    }
  }

  // Send build report in any case (success/failure),
  // before returning successful result or throeing an error.
  let timeSaved = 0
  // This function is fail-safe,
  // and prints a user-friendly warning if a user is not logged in.
  const output = await sendBuildReport({
    metadataFile,
    cmdOpts,
    startedAt,
    dockerLogs,
    dockerCommandResult: res,
    runtime,
    ctx,
    log,
  })
  timeSaved = output?.timeSaved || 0

  if (dockerBuildError !== null) {
    throw new BuildError({
      message: `docker build failed: ${dockerErrorLogs.join("\n") || dockerBuildError.message}`,
    })
  }

  return { buildResult: res, timeSaved }
}

async function buildContainerInCloudBuilder(params: {
  action: Resolved<ContainerBuildAction>
  availability: CloudBuilderAvailableV2
  outputStream: Writable
  timeout: number
  log: ActionLog
  ctx: PluginContext<ContainerProviderConfig>
  dockerLogs: DockerBuildReport["dockerLogs"]
  dockerErrorLogs: string[]
}) {
  const runtime = cloudBuilder.getActionRuntime(params.ctx, params.availability)

  const res = await cloudBuilder.withBuilder(params.ctx, params.availability, async (builderName) => {
    const extraDockerOpts = ["--builder", builderName]

    // we add --push in the Kubernetes local-docker handler when using the Kubernetes plugin with a deploymentRegistry setting.
    // If we have --push, no need to --load.
    if (!getDockerBuildFlags(params.action, params.ctx.provider.config).includes("--push")) {
      // This action makes sure to download the image from the Container Builder, and make it available locally.
      extraDockerOpts.push("--load")
    }

    return await buildxBuildContainer({ ...params, extraDockerOpts, runtime, dockerLogs: params.dockerLogs })
  })

  const log = params.ctx.log.createLog({
    name: `build.${params.action.name}`,
  })
  if (res.timeSaved > 0) {
    log.success(styles.bold(`Accelerated by Remote Container Builder ${renderSavedTime(res.timeSaved)}`))
  }
  return res
}

function renderSavedTime(timeMs: number): string {
  const renderedDuration = timeMs === 0 ? "" : renderTimeDurationMs(timeMs)
  return renderedDuration.length === 0 ? "" : `(saved ${renderedDuration})`
}

async function getDockerMetadata(filePath: string, log: ActionLog) {
  try {
    return JSON.parse(await readFile(filePath, { encoding: "utf-8" }))
  } catch (e: unknown) {
    log.debug(`Failed to read docker metadata file: ${e}`)
    return undefined
  }
}

function getBuilderName(dockerMetadata: DockerBuildReport["dockerMetadata"]) {
  if (dockerMetadata && typeof dockerMetadata["buildx.build.ref"] === "string") {
    return dockerMetadata["buildx.build.ref"].split("/")[0]
  }
  return "unknown"
}

export function getContainerBuildActionOutputs(action: Resolved<ContainerBuildAction>): ContainerBuildOutputs {
  return containerHelpers.getBuildActionOutputs(action, undefined)
}

export async function sendBuildReport({
  metadataFile,
  cmdOpts,
  startedAt,
  dockerLogs,
  dockerCommandResult,
  runtime,
  ctx,
  log,
}: {
  metadataFile: string
  cmdOpts: string[]
  startedAt: Date
  dockerLogs: DockerBuildReport["dockerLogs"]
  dockerCommandResult: SpawnOutput
  runtime: ActionRuntime
  log: ActionLog
  ctx: PluginContext
}) {
  try {
    const dockerMetadata = await getDockerMetadata(metadataFile, log)
    const { client, server } = await containerHelpers.getDockerVersion()

    const builderName = getBuilderName(dockerMetadata)
    const driver = await getBuildxDriver(builderName, log, ctx)
    const imageTags = getImageTags(dockerMetadata, cmdOpts)
    const dockerBuildReport: DockerBuildReport = {
      runtime: cloudBuilder.transformRuntime(runtime),
      status: dockerCommandResult.code === 0 ? "success" : "failure",
      startedAt,
      completedAt: new Date(),
      runtimeMetadata: {
        docker: {
          clientVersion: client || "unknown",
          serverVersion: server || "unknown",
        },
        builder: {
          implicitName: builderName,
          isDefault: false, //TODO
          driver,
        },
      },
      imageTags,
      platforms: await getPlatforms(cmdOpts),
      dockerLogs,
      dockerMetadata,
    }

    const growCloudApi = ctx.cloudApiV2
    if (!growCloudApi) {
      log.warn("Garden Cloud v2 not available. Are you logged in?")
      return { timeSaved: 0 }
    }

    return await growCloudApi.uploadDockerBuildReport(dockerBuildReport)
  } catch (err) {
    log.debug(`Failed to send build report to Garden Cloud: ${err}`)
    return { timeSaved: 0 }
  }
}

export function getDockerSecrets(actionSpec: ContainerBuildActionSpec): {
  secretArgs: string[]
  secretEnvVars: Record<string, Secret>
} {
  const args: string[] = []
  const env: Record<string, Secret> = {}

  for (const [secretKey, secretValue] of Object.entries(actionSpec.secrets || {})) {
    if (!secretKey.match(/^[a-zA-Z0-9\._-]+$/)) {
      throw new ConfigurationError({
        message: `Invalid secret ID '${secretKey}'. Only alphanumeric characters (a-z, A-Z, 0-9), underscores (_), dashes (-) and dots (.) are allowed.`,
      })
    }
    if (!isSecret(secretValue)) {
      throw new InternalError({
        message: "joi schema did not call makeSecret for every secret value.",
      })
    }

    // determine env var names. There can be name collisions due to the fact that we replace special characters with underscores.
    let envVarname: string
    let i = 1
    do {
      envVarname = `GARDEN_BUILD_SECRET_${secretKey.toUpperCase().replaceAll(/[-\.]/g, "_")}${i > 1 ? `_${i}` : ""}`
      i += 1
    } while (env[envVarname])

    env[envVarname] = secretValue
    args.push("--secret", `id=${secretKey},env=${envVarname}`)
  }

  return {
    secretArgs: args,
    secretEnvVars: env,
  }
}

async function getBuildxDriver(builderName: string, log: ActionLog, ctx: PluginContext): Promise<string> {
  if (builderName === "unknown") {
    return "unknown"
  }
  if (builderName.startsWith("garden-cloud-builder")) {
    return "remote"
  }

  try {
    const parsedBuilderInfo: { Name: string; Driver: string }[] = []
    const outputStream = split2()
    outputStream.on("data", (line: Buffer) => {
      parsedBuilderInfo.push(JSON.parse(line.toString()))
    })
    await containerHelpers.dockerCli({
      cwd: ".",
      stdout: outputStream,
      log,
      ctx,
      args: ["buildx", "ls", "--format", "json"],
    })
    return parsedBuilderInfo.find((builder) => builder.Name === builderName)?.Driver || "unknown"
  } catch (e) {
    throw toGardenError({
      message: `Failed to get buildx driver info: ${e}`,
    })
  }
}

export function getImageTags(dockerMetadata: DockerBuildReport["dockerMetadata"], cmdOpts: string[]) {
  const tags: string[] = []
  if (dockerMetadata && dockerMetadata["image.name"]) {
    // To be consistent we remove the prefix for the local docker image store from the image name
    const localDockerStorePrefix = /^docker.io\/library\//
    const parsedTags = dockerMetadata["image.name"].split(",").map((tag) => tag.replace(localDockerStorePrefix, ""))
    tags.push(...parsedTags)
  } else {
    for (let i = 0; i < cmdOpts.length; i++) {
      if (cmdOpts[i] === "--tag") {
        tags.push(cmdOpts[i + 1])
      }
    }
  }
  return tags
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

// Map of architecture names to Docker platform names
// see https://github.com/BretFisher/multi-platform-docker-build
const architectureMap: Record<string, string> = {
  "x86_64": "amd64",
  "x86-64": "amd64",
  "aarch64": "arm64",
  "armhf": "arm",
  "armel": "arm/v6",
  "i386": "386",
}

async function getPlatforms(cmdOpts: string[]): Promise<string[]> {
  const platforms: string[] = []
  for (let i = 0; i < cmdOpts.length; i++) {
    if (cmdOpts[i] === "--platform") {
      const platform = cmdOpts[i + 1]
      if (platform === undefined) {
        throw new ConfigurationError({
          message: "Missing platform after --platform flag",
        })
      }
      platforms.push(platform)
    }
  }
  // no platforms specified, defaults to docker server's platform
  if (platforms.length === 0) {
    const osTypeResult = await spawn("docker", ["system", "info", "--format", "{{.OSType}}"])
    const osType = osTypeResult.stdout.trim()
    const archResult = await spawn("docker", ["system", "info", "--format", "{{.Architecture}}"])
    let arch = archResult.stdout.trim()

    // docker system info does not always return the same architecure name as used for the platform flag
    // see https://github.com/BretFisher/multi-platform-docker-build
    if (!Object.values(architectureMap).includes(arch)) {
      arch = architectureMap[arch] || ""
    }
    if (arch === "") {
      throw new ConfigurationError({
        message: `Unsupported architecture ${arch}`,
      })
    }
    platforms.push(`${osType}/${arch}`)
  }
  return platforms
}
