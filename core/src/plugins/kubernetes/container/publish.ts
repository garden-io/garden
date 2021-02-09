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
import { pullModule } from "../commands/pull-image"

export async function k8sPublishContainerModule(params: PublishModuleParams<ContainerModule>) {
  const { ctx, module, log } = params
  const k8sCtx = ctx as KubernetesPluginContext
  const provider = k8sCtx.provider

  if (!containerHelpers.hasDockerfile(module, module.version)) {
    log.setState({ msg: `Nothing to publish` })
    return { published: false, message: undefined }
  }

  if (provider.config.buildMode !== "local-docker") {
    // First pull from the remote registry, then resume standard publish flow.
    // This does mean we require a local docker as a go-between, but the upside is that we can rely on the user's
    // standard authentication setup, instead of having to re-implement or account for all the different ways the
    // user might be authenticating with their registries.
    // We also generally prefer this because the remote cluster very likely doesn't (and shouldn't) have
    // privileges to push to production registries.
    log.setState(`Pulling from remote registry...`)
    await pullModule(k8sCtx, module, log)
  }

  return publishContainerModule({ ...params, ctx: { ...ctx, provider: provider.dependencies.container } })
}
