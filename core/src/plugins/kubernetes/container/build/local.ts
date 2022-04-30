/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { containerHelpers } from "../../../container/helpers"
import { buildContainer, getContainerBuildStatus } from "../../../container/build"
import { KubernetesProvider, KubernetesPluginContext } from "../../config"
import { loadImageToKind, getKindImageStatus } from "../../local/kind"
import chalk = require("chalk")
import { loadImageToMicrok8s, getMicrok8sImageStatus } from "../../local/microk8s"
import { ContainerProvider } from "../../../container/container"
import { BuildHandler, BuildStatusHandler, BuildStatusResult, getManifestInspectArgs } from "./common"
import { ContainerBuildAction } from "../../../container/moduleConfig"
import { BuildActionParams } from "../../../../plugin/action-types"
import { k8sGetContainerBuildActionOutputs } from "../handlers"

export const getLocalBuildStatus: BuildStatusHandler = async (params) => {
  const { ctx, action, log } = params
  const k8sCtx = ctx as KubernetesPluginContext
  const config = k8sCtx.provider.config
  const deploymentRegistry = config.deploymentRegistry

  const outputs = k8sGetContainerBuildActionOutputs({ provider: k8sCtx.provider, action })

  const result: BuildStatusResult = { ready: false, outputs }

  if (deploymentRegistry) {
    const args = await getManifestInspectArgs(outputs.deploymentImageId, deploymentRegistry)
    const res = await containerHelpers.dockerCli({
      cwd: action.getBuildPath(),
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

    result.ready = res.code === 0
  } else if (config.clusterType === "kind") {
    result.ready = await getKindImageStatus(config, outputs.localImageId, log)
  } else if (k8sCtx.provider.config.clusterType === "microk8s") {
    result.ready = await getMicrok8sImageStatus(outputs.localImageId)
  } else {
    const res = await getContainerBuildStatus({
      ...params,
      ctx: { ...ctx, provider: ctx.provider.dependencies.container },
    })
    result.ready = res.ready
  }

  return result
}

export const localBuild: BuildHandler = async (params) => {
  const { ctx, action, log } = params
  const provider = ctx.provider as KubernetesProvider
  const containerProvider = provider.dependencies.container as ContainerProvider
  const base = params.base || buildContainer

  const buildResult = await base!({ ...params, ctx: { ...ctx, provider: containerProvider } })

  if (!provider.config.deploymentRegistry) {
    await loadToLocalK8s(params)
    return buildResult
  }

  const outputs = k8sGetContainerBuildActionOutputs({ provider, action })

  const localId = outputs.localImageId
  const remoteId = outputs.deploymentImageId
  const buildPath = action.getBuildPath()

  log.info({ msg: `→ Pushing image ${remoteId} to remote...` })

  await containerHelpers.dockerCli({ cwd: buildPath, args: ["tag", localId, remoteId], log, ctx })
  await containerHelpers.dockerCli({ cwd: buildPath, args: ["push", remoteId], log, ctx })

  return buildResult
}

/**
 * Loads a built local image to a local Kubernetes instance
 */
export async function loadToLocalK8s(params: BuildActionParams<"build", ContainerBuildAction>) {
  const { ctx, log, action } = params
  const provider = ctx.provider as KubernetesProvider

  const { localImageId } = k8sGetContainerBuildActionOutputs({ provider, action })

  if (provider.config.clusterType === "kind") {
    await loadImageToKind(localImageId, provider.config, log)
  } else if (provider.config.clusterType === "microk8s") {
    await loadImageToMicrok8s({ action, imageId: localImageId, log, ctx })
  }
}
