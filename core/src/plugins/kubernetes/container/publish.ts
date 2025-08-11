/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ContainerBuildAction } from "../../container/moduleConfig.js"
import type { KubernetesPluginContext } from "../config.js"
import type { BuildActionHandler } from "../../../plugin/action-types.js"
import { containerHelpers } from "../../container/helpers.js"
import { naturalList } from "../../../util/string.js"
import { cloudBuilder } from "../../container/cloudbuilder.js"

export const k8sPublishContainerBuild: BuildActionHandler<"publish", ContainerBuildAction> = async (params) => {
  const { ctx, action, log, tagOverride } = params
  const k8sCtx = ctx as KubernetesPluginContext
  const provider = k8sCtx.provider

  const cloudBuilderConfigured = cloudBuilder.isConfigured(k8sCtx)

  const localImageId = action.getOutput("localImageId")
  const deploymentRegistryImageId = action.getOutput("deploymentImageId")
  const remoteImageId = containerHelpers.getPublicImageId(action, log, tagOverride)
  const dockerBuildExtraFlags = action.getSpec("extraFlags")

  // For in-cluster building or Container Builder, use regctl to copy the image.
  // This does not require to pull the image locally.
  if (
    provider.config.buildMode !== "local-docker" ||
    cloudBuilderConfigured ||
    dockerBuildExtraFlags?.includes("--push")
  ) {
    const regctlCopyCommand = ["image", "copy", deploymentRegistryImageId, remoteImageId]
    log.info({ msg: `Publishing image ${remoteImageId}` })
    await containerHelpers.regctlCli({ cwd: action.getBuildPath(), args: regctlCopyCommand, log, ctx })
  } else {
    const taggedImages = [localImageId, remoteImageId]
    log.info({ msg: `Tagging images ${naturalList(taggedImages)}` })
    await containerHelpers.dockerCli({ cwd: action.getBuildPath(), args: ["tag", ...taggedImages], log, ctx })

    log.info({ msg: `Publishing image ${remoteImageId}...` })
    // TODO: stream output to log if at debug log level
    await containerHelpers.dockerCli({ cwd: action.getBuildPath(), args: ["push", remoteImageId], log, ctx })
  }

  return {
    state: "ready",
    detail: { published: true, message: `Published ${remoteImageId}` },
    outputs: {
      localImageId,
      remoteImageId,
    },
  }
}
