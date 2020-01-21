/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
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

export async function getContainerBuildStatus({ module, log }: GetBuildStatusParams<ContainerModule>) {
  const identifier = await containerHelpers.imageExistsLocally(module)

  if (identifier) {
    log.debug({
      section: module.name,
      msg: `Image ${identifier} already exists`,
      symbol: "info",
    })
  }

  return { ready: !!identifier }
}

export async function buildContainerModule({ module, log }: BuildModuleParams<ContainerModule>) {
  const buildPath = module.buildPath
  const image = module.spec.image
  const hasDockerfile = await containerHelpers.hasDockerfile(module)

  if (!!image && !hasDockerfile) {
    if (await containerHelpers.imageExistsLocally(module)) {
      return { fresh: false }
    }
    log.setState(`Pulling image ${image}...`)
    await containerHelpers.pullImage(module)
    return { fetched: true }
  }

  // make sure we can build the thing
  if (!hasDockerfile) {
    throw new ConfigurationError(
      `Dockerfile not found at ${module.spec.dockerfile || "Dockerfile"} for module ${module.name}`,
      { spec: module.spec }
    )
  }

  const identifier = await containerHelpers.getLocalImageId(module)

  // build doesn't exist, so we create it
  log.setState(`Building ${identifier}...`)

  const cmdOpts = ["build", "-t", identifier, ...getDockerBuildFlags(module)]

  cmdOpts.push(...(module.spec.extraFlags || []))

  if (module.spec.dockerfile) {
    cmdOpts.push("--file", containerHelpers.getDockerfileBuildPath(module))
  }

  // Stream log to a status line
  const outputStream = createOutputStream(log.placeholder(LogLevel.info))
  const timeout = module.spec.build.timeout
  const buildLog = await containerHelpers.dockerCli(module, [...cmdOpts, buildPath], { outputStream, timeout })

  return { fresh: true, buildLog, details: { identifier } }
}

export function getDockerBuildFlags(module: ContainerModule) {
  const args: string[] = []

  for (const [key, value] of Object.entries(module.spec.buildArgs)) {
    // 0 is falsy
    if (value || value === 0) {
      args.push("--build-arg", `${key}=${value}`)
    } else {
      // If the value of a build-arg is null, Docker pulls it from
      // the environment: https://docs.docker.com/engine/reference/commandline/build/
      args.push("--build-arg", `${key}`)
    }
  }

  if (module.spec.build.targetImage) {
    args.push("--target", module.spec.build.targetImage)
  }

  return args
}
