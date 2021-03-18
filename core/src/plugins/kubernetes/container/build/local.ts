/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { containerHelpers } from "../../../container/helpers"
import { buildContainerModule, getContainerBuildStatus } from "../../../container/build"
import { KubernetesProvider, KubernetesPluginContext } from "../../config"
import { loadImageToKind, getKindImageStatus } from "../../local/kind"
import chalk = require("chalk")
import { loadImageToMicrok8s, getMicrok8sImageStatus } from "../../local/microk8s"
import { ContainerProvider } from "../../../container/container"
import { BuildHandler, BuildStatusHandler, getManifestInspectArgs } from "./common"

export const getLocalBuildStatus: BuildStatusHandler = async (params) => {
  const { ctx, module, log } = params
  const k8sCtx = ctx as KubernetesPluginContext
  const config = k8sCtx.provider.config
  const deploymentRegistry = config.deploymentRegistry

  if (deploymentRegistry) {
    const args = await getManifestInspectArgs(module, deploymentRegistry)
    const res = await containerHelpers.dockerCli({
      cwd: module.buildPath,
      args,
      log,
      ctx,
      ignoreError: true,
    })

    // Non-zero exit code can both mean the manifest is not found, and any other unexpected error
    if (res.code !== 0 && !res.all.includes("no such manifest")) {
      const detail = res.all || `docker manifest inspect exited with code ${res.code}`
      log.warn(chalk.yellow(`Unable to query registry for image status: ${detail}`))
    }

    return { ready: res.code === 0 }
  } else if (config.clusterType === "kind") {
    const localId = containerHelpers.getLocalImageId(module, module.version)
    return getKindImageStatus(config, localId, log)
  } else if (k8sCtx.provider.config.clusterType === "microk8s") {
    const localId = containerHelpers.getLocalImageId(module, module.version)
    return getMicrok8sImageStatus(localId)
  } else {
    return getContainerBuildStatus({ ...params, ctx: { ...ctx, provider: ctx.provider.dependencies.container } })
  }
}

export const localBuild: BuildHandler = async (params) => {
  const { ctx, module, log } = params
  const provider = ctx.provider as KubernetesProvider
  const containerProvider = provider.dependencies.container as ContainerProvider
  const buildResult = await buildContainerModule({ ...params, ctx: { ...ctx, provider: containerProvider } })

  if (!provider.config.deploymentRegistry) {
    if (provider.config.clusterType === "kind") {
      await loadImageToKind(buildResult, provider.config, log)
    } else if (provider.config.clusterType === "microk8s") {
      const imageId = containerHelpers.getLocalImageId(module, module.version)
      await loadImageToMicrok8s({ module, imageId, log, ctx })
    }
    return buildResult
  }

  if (!containerHelpers.hasDockerfile(module, module.version)) {
    return buildResult
  }

  const localId = containerHelpers.getLocalImageId(module, module.version)
  const remoteId = containerHelpers.getDeploymentImageId(module, module.version, ctx.provider.config.deploymentRegistry)

  log.setState({ msg: `Pushing image ${remoteId} to cluster...` })

  await containerHelpers.dockerCli({ cwd: module.buildPath, args: ["tag", localId, remoteId], log, ctx })
  await containerHelpers.dockerCli({ cwd: module.buildPath, args: ["push", remoteId], log, ctx })

  return buildResult
}
