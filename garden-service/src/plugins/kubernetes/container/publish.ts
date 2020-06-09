/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ContainerModule } from "../../container/config"
import { PublishModuleParams } from "../../../types/plugin/module/publishModule"
import { containerHelpers } from "../../container/helpers"
import { KubernetesPluginContext } from "../config"
import { publishContainerModule } from "../../container/publish"
import { getRegistryPortForward } from "./util"
import { ContainerProvider } from "../../container/container"

export async function k8sPublishContainerModule(params: PublishModuleParams<ContainerModule>) {
  const { ctx, module, log } = params
  const k8sCtx = ctx as KubernetesPluginContext
  const provider = k8sCtx.provider
  const containerProvider = provider.dependencies.container as ContainerProvider

  if (!(await containerHelpers.hasDockerfile(module))) {
    log.setState({ msg: `Nothing to publish` })
    return { published: false }
  }

  if (provider.config.buildMode !== "local-docker") {
    // First pull from the in-cluster registry, then resume standard publish flow.
    // This does mean we require a local docker as a go-between, but the upside is that we can rely on the user's
    // standard authentication setup, instead of having to re-implement or account for all the different ways the
    // user might be authenticating with their registries.
    log.setState(`Pulling from cluster container registry...`)

    const fwd = await getRegistryPortForward(k8sCtx, log)

    const imageId = await containerHelpers.getDeploymentImageId(module, ctx.provider.config.deploymentRegistry)
    const pullImageName = containerHelpers.unparseImageId({
      ...containerHelpers.parseImageId(imageId),
      // Note: using localhost directly here has issues with Docker for Mac.
      // https://github.com/docker/for-mac/issues/3611
      host: `local.app.garden:${fwd.localPort}`,
    })

    await containerHelpers.dockerCli({
      cwd: module.buildPath,
      args: ["pull", pullImageName],
      log,
      containerProvider,
    })

    // We need to tag the remote image with the local ID before we publish it
    const localId = await containerHelpers.getLocalImageId(module)
    await containerHelpers.dockerCli({
      cwd: module.buildPath,
      args: ["tag", pullImageName, localId],
      log,
      containerProvider,
    })
  }

  return publishContainerModule({ ...params, ctx: { ...ctx, provider: provider.dependencies.container } })
}
