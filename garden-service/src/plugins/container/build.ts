/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BuildModuleParams, GetBuildStatusParams } from "../../types/plugin/params"
import { containerHelpers } from "./helpers"
import { ContainerModule } from "./config"
import { ConfigurationError } from "../../exceptions"

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
      { spec: module.spec },
    )
  }

  const identifier = await containerHelpers.getLocalImageId(module)

  // build doesn't exist, so we create it
  log.setState(`Building ${identifier}...`)

  const cmdOpts = ["build", "-t", identifier]

  for (const [key, value] of Object.entries(module.spec.buildArgs)) {
    cmdOpts.push("--build-arg", `${key}=${value}`)
  }

  if (module.spec.build.targetImage) {
    cmdOpts.push("--target", module.spec.build.targetImage)
  }

  if (module.spec.dockerfile) {
    cmdOpts.push("--file", containerHelpers.getDockerfileBuildPath(module))
  }

  // TODO: log error if it occurs
  // TODO: stream output to log if at debug log level
  await containerHelpers.dockerCli(module, [...cmdOpts, buildPath])

  return { fresh: true, details: { identifier } }
}
