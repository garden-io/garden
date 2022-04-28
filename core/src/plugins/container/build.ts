/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { containerHelpers, defaultDockerfileName } from "./helpers"
import { ContainerModule } from "./moduleConfig"
import { ConfigurationError } from "../../exceptions"
import { GetBuildStatusParams } from "../../types/plugin/module/getBuildStatus"
import { BuildModuleParams } from "../../types/plugin/module/build"
import { LogLevel } from "../../logger/logger"
import { renderOutputStream } from "../../util/util"
import { PrimitiveMap } from "../../config/common"
import split2 from "split2"
import { BuildActionHandler } from "../../plugin/actionTypes"
import { ContainerBuildActionConfig } from "./config"

export async function getContainerBuildStatus({ ctx, module, log }: GetBuildStatusParams<ContainerModule>) {
  const identifier = await containerHelpers.imageExistsLocally(module, log, ctx)

  if (identifier) {
    log.debug({
      section: module.name,
      msg: `Image ${identifier} already exists`,
      symbol: "info",
    })
  }

  return { ready: !!identifier }
}

export const buildContainer: BuildActionHandler<"build", ContainerBuildActionConfig> = async ({ ctx, action, log }) => {
  containerHelpers.checkDockerServerVersion(await containerHelpers.getDockerVersion())

  const buildPath = action.buildPath
  const spec = await action.getSpec()
  const image = spec.image
  const hasDockerfile = await containerHelpers.actionHasDockerfile(action)

  // make sure we can build the thing
  if (!hasDockerfile) {
    throw new ConfigurationError(
      `Dockerfile not found at ${spec.dockerfile || defaultDockerfileName} for build ${action.name}. Please make sure the file exists, and is not excluded by include/exclude fields or .gardenignore files.`,
      { spec }
    )
  }

  const identifier = await action.getOutput("localImageId")

  // build doesn't exist, so we create it
  log.setState(`Building ${identifier}...`)

  const cmdOpts = ["build", "-t", identifier, ...getDockerBuildFlags(module)]

  if (module.spec.dockerfile) {
    cmdOpts.push("--file", containerHelpers.getDockerfileBuildPath(module))
  }

  // Stream verbose log to a status line
  const outputStream = split2()
  const statusLine = log.placeholder({ level: LogLevel.verbose })

  outputStream.on("error", () => {})
  outputStream.on("data", (line: Buffer) => {
    ctx.events.emit("log", { timestamp: new Date().getTime(), data: line })
    statusLine.setState(renderOutputStream(line.toString()))
  })
  const timeout = module.spec.build.timeout
  const res = await containerHelpers.dockerCli({
    cwd: module.buildPath,
    args: [...cmdOpts, buildPath],
    log,
    stdout: outputStream,
    stderr: outputStream,
    timeout,
    ctx,
  })

  return { fresh: true, buildLog: res.all || "", details: { identifier } }
}

export function getDockerBuildFlags(module: ContainerModule) {
  const args: string[] = []

  for (const arg of getDockerBuildArgs(module)) {
    args.push("--build-arg", arg)
  }

  if (module.spec.build.targetImage) {
    args.push("--target", module.spec.build.targetImage)
  }

  args.push(...(module.spec.extraFlags || []))

  return args
}

export function getDockerBuildArgs(module: ContainerModule) {
  const buildArgs: PrimitiveMap = {
    GARDEN_MODULE_VERSION: module.version.versionString,
    ...module.spec.buildArgs,
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
