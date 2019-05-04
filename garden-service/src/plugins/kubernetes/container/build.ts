/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BuildModuleParams, GetBuildStatusParams } from "../../../types/plugin/params"
import { ContainerModule } from "../../container/config"
import { containerHelpers } from "../../container/helpers"
import { buildContainerModule, getContainerBuildStatus } from "../../container/build"

export async function getBuildStatus(params: GetBuildStatusParams<ContainerModule>) {
  const status = await getContainerBuildStatus(params)

  const { ctx } = params

  if (ctx.provider.config.deploymentRegistry) {
    // TODO: Check if the image exists in the remote registry
  }

  return status
}

export async function buildModule(params: BuildModuleParams<ContainerModule>) {
  const buildResult = await buildContainerModule(params)

  const { ctx, module, log } = params

  if (!ctx.provider.config.deploymentRegistry) {
    return buildResult
  }

  if (!(await containerHelpers.hasDockerfile(module))) {
    return buildResult
  }

  const localId = await containerHelpers.getLocalImageId(module)
  const remoteId = await containerHelpers.getDeploymentImageId(module, ctx.provider.config.deploymentRegistry)

  log.setState({ msg: `Pushing image ${remoteId} to cluster...` })

  await containerHelpers.dockerCli(module, ["tag", localId, remoteId])
  await containerHelpers.dockerCli(module, ["push", remoteId])

  return buildResult
}
