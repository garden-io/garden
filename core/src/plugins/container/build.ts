/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { containerHelpers, defaultDockerfileName } from "./helpers"
import { ConfigurationError } from "../../exceptions"
import { LogLevel } from "../../logger/logger"
import { renderOutputStream } from "../../util/util"
import { PrimitiveMap } from "../../config/common"
import split2 from "split2"
import { BuildActionHandler } from "../../plugin/action-types"
import { ContainerBuildAction, ContainerBuildOutputs } from "./config"
import { joinWithPosix } from "../../util/fs"

export const getContainerBuildStatus: BuildActionHandler<"getStatus", ContainerBuildAction> = async ({
  ctx,
  action,
  log,
}) => {
  const outputs = getContainerBuildActionOutputs(action)
  const identifier = await containerHelpers.imageExistsLocally(outputs.localImageId, log, ctx)

  if (identifier) {
    log.debug({
      section: action.key(),
      msg: `Image ${identifier} already exists`,
      symbol: "info",
    })
  }

  return { status: !!identifier ? "ready" : "not-ready", outputs }
}

export const buildContainer: BuildActionHandler<"build", ContainerBuildAction> = async ({ ctx, action, log }) => {
  containerHelpers.checkDockerServerVersion(await containerHelpers.getDockerVersion())

  const buildPath = action.getBuildPath()
  const spec = action.getSpec()
  const hasDockerfile = await containerHelpers.actionHasDockerfile(action)

  // make sure we can build the thing
  if (!hasDockerfile) {
    throw new ConfigurationError(
      `Dockerfile not found at ${spec.dockerfile || defaultDockerfileName} for build ${action.name}.
      Please make sure the file exists, and is not excluded by include/exclude fields or .gardenignore files.`,
      { spec }
    )
  }

  const outputs = getContainerBuildActionOutputs(action)

  const identifier = outputs.localImageId

  // build doesn't exist, so we create it
  log.setState(`Building ${identifier}...`)

  const dockerfilePath = joinWithPosix(action.getBuildPath(), spec.dockerfile)

  const cmdOpts = ["build", "-t", identifier, ...getDockerBuildFlags(action), "--file", dockerfilePath]

  // Stream verbose log to a status line
  const outputStream = split2()
  const statusLine = log.placeholder({ level: LogLevel.verbose })

  outputStream.on("error", () => {})
  outputStream.on("data", (line: Buffer) => {
    ctx.events.emit("log", { timestamp: new Date().getTime(), data: line })
    statusLine.setState(renderOutputStream(line.toString()))
  })
  const timeout = spec.timeout
  const res = await containerHelpers.dockerCli({
    cwd: action.getBuildPath(),
    args: [...cmdOpts, buildPath],
    log,
    stdout: outputStream,
    stderr: outputStream,
    timeout,
    ctx,
  })

  return { fresh: true, buildLog: res.all || "", outputs, details: { identifier } }
}

export function getContainerBuildActionOutputs(action: ContainerBuildAction): ContainerBuildOutputs {
  const spec = action.getSpec()

  // Note: The deployment image name/ID outputs are overridden by the kubernetes provider, these defaults are
  // generally not used.
  const deploymentImageName = containerHelpers.getDeploymentImageName(action.name, spec.localId, undefined)
  const deploymentImageId = containerHelpers.getBuildDeploymentImageId(
    action.name,
    spec.localId,
    action.getFullVersion(),
    undefined
  )

  return {
    localImageName: containerHelpers.getLocalImageName(action.name, spec.localId),
    localImageId: containerHelpers.getLocalImageId(action.name, spec.localId, action.getFullVersion()),
    deploymentImageName,
    deploymentImageId,
  }
}

export function getDockerBuildFlags(action: ContainerBuildAction) {
  const args: string[] = []

  for (const arg of getDockerBuildArgs(action)) {
    args.push("--build-arg", arg)
  }

  const { targetStage, extraFlags } = action.getSpec()

  if (targetStage) {
    args.push("--target", targetStage)
  }

  args.push(...(extraFlags || []))

  return args
}

export function getDockerBuildArgs(action: ContainerBuildAction) {
  const specBuildArgs = action.getSpec("buildArgs")

  const buildArgs: PrimitiveMap = {
    GARDEN_MODULE_VERSION: action.versionString(),
    ...specBuildArgs,
  }

  return Object.entries(buildArgs).map(([key, value]) => {
    // 0 is falsy
    if (value || value === 0) {
      return `${key}=${value}`
    } else {
      // If the value of a build-arg is null, Docker pulls it from
      // the environment: https://docs.docker.com/engine/reference/commandline/build/
      return key
    }
  })
}
