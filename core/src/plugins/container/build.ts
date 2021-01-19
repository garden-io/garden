/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { containerHelpers } from "./helpers"
import { ContainerModule } from "./config"
import { ConfigurationError } from "../../exceptions"
import { GetBuildStatusParams } from "../../types/plugin/module/getBuildStatus"
import { BuildModuleParams } from "../../types/plugin/module/build"
import { LogLevel } from "../../logger/log-node"
import { createOutputStream } from "../../util/util"
import { PrimitiveMap } from "../../config/common"

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

export async function buildContainerModule({ ctx, module, log }: BuildModuleParams<ContainerModule>) {
  containerHelpers.checkDockerServerVersion(await containerHelpers.getDockerVersion())

  const buildPath = module.buildPath
  const image = module.spec.image
  const hasDockerfile = containerHelpers.hasDockerfile(module, module.version)

  if (!!image && !hasDockerfile) {
    if (await containerHelpers.imageExistsLocally(module, log, ctx)) {
      return { fresh: false }
    }
    log.setState(`Pulling image ${image}...`)
    await containerHelpers.pullImage(module, log, ctx)
    return { fetched: true }
  }

  // make sure we can build the thing
  if (!hasDockerfile) {
    throw new ConfigurationError(
      `Dockerfile not found at ${module.spec.dockerfile || "Dockerfile"} for module ${module.name}`,
      { spec: module.spec }
    )
  }

  const identifier = containerHelpers.getLocalImageId(module, module.version)

  // build doesn't exist, so we create it
  log.setState(`Building ${identifier}...`)

  const cmdOpts = ["build", "-t", identifier, ...getDockerBuildFlags(module)]

  if (module.spec.dockerfile) {
    cmdOpts.push("--file", containerHelpers.getDockerfileBuildPath(module))
  }

  // Stream log to a status line
  const outputStream = createOutputStream(log.placeholder({ level: LogLevel.verbose }))
  const timeout = module.spec.build.timeout
  const res = await containerHelpers.dockerCli({
    cwd: module.buildPath,
    args: [...cmdOpts, buildPath],
    log,
    outputStream,
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
