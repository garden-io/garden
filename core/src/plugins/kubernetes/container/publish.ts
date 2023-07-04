/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ContainerBuildAction } from "../../container/moduleConfig"
import { KubernetesPluginContext } from "../config"
import { pullBuild } from "../commands/pull-image"
import { BuildActionHandler } from "../../../plugin/action-types"
import { containerHelpers } from "../../container/helpers"

export const k8sPublishContainerBuild: BuildActionHandler<"publish", ContainerBuildAction> = async (params) => {
  const { ctx, action, log } = params
  const k8sCtx = ctx as KubernetesPluginContext
  const provider = k8sCtx.provider

  const localId = action.getOutput("localImageId")
  // NOTE: this may contain a custom deploymentRegistry, from the kubernetes provider config
  // We cannot combine this publish method with the container plugin's publish method, because it won't have the context
  const remoteId = action.getOutput("deploymentImageId")

  if (provider.config.buildMode !== "local-docker") {
    // First pull from the remote registry, then resume standard publish flow.
    // This does mean we require a local docker as a go-between, but the upside is that we can rely on the user's
    // standard authentication setup, instead of having to re-implement or account for all the different ways the
    // user might be authenticating with their registries.
    // We also generally prefer this because the remote cluster very likely doesn't (and shouldn't) have
    // privileges to push to production registries.
    log.info(`Pulling from remote registry...`)
    await pullBuild({ ctx: k8sCtx, action, log, localId, remoteId })
  }

  log.info({ msg: `Publishing image ${remoteId}...` })
  // TODO: stream output to log if at debug log level
  await containerHelpers.dockerCli({ cwd: action.getBuildPath(), args: ["push", remoteId], log, ctx })

  return {
    state: "ready",
    detail: { published: true, message: `Published ${remoteId}` },
    // TODO-0.13.1
    outputs: {},
  }
}
