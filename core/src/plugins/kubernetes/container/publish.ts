/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ContainerBuildAction } from "../../container/moduleConfig.js"
import type { KubernetesPluginContext } from "../config.js"
import { pullBuild } from "../commands/pull-image.js"
import type { BuildActionHandler } from "../../../plugin/action-types.js"
import { containerHelpers } from "../../container/helpers.js"
import { naturalList } from "../../../util/string.js"

export const k8sPublishContainerBuild: BuildActionHandler<"publish", ContainerBuildAction> = async (params) => {
  const { ctx, action, log, tagOverride } = params
  const k8sCtx = ctx as KubernetesPluginContext
  const provider = k8sCtx.provider

  const localImageId = action.getOutput("localImageId")

  if (provider.config.buildMode !== "local-docker") {
    // NOTE: this may contain a custom deploymentRegistry, from the kubernetes provider config
    const deploymentRegistryImageId = action.getOutput("deploymentImageId")

    // First pull from the deployment registry, then resume standard publish flow.
    // This does mean we require a local docker as a go-between, but the upside is that we can rely on the user's
    // standard authentication setup, instead of having to re-implement or account for all the different ways the
    // user might be authenticating with their registries.
    // We also generally prefer this because the remote cluster very likely doesn't (and shouldn't) have
    // privileges to push to production registries.
    log.info(`Pulling from deployment registry...`)
    await pullBuild({ ctx: k8sCtx, action, log, localId: localImageId, remoteId: deploymentRegistryImageId })
  }

  const remoteImageId = containerHelpers.getPublicImageId(action, tagOverride)

  const taggedImages = [localImageId, remoteImageId]
  log.info({ msg: `Tagging images ${naturalList(taggedImages)}` })
  await containerHelpers.dockerCli({ cwd: action.getBuildPath(), args: ["tag", ...taggedImages], log, ctx })

  log.info({ msg: `Publishing image ${remoteImageId}...` })
  // TODO: stream output to log if at debug log level
  await containerHelpers.dockerCli({ cwd: action.getBuildPath(), args: ["push", remoteImageId], log, ctx })

  return {
    state: "ready",
    detail: { published: true, message: `Published ${remoteImageId}` },
    outputs: {
      localImageId,
      remoteImageId,
    },
  }
}
