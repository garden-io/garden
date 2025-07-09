/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { containerHelpers } from "../../../container/helpers.js"
import { buildContainer, getContainerBuildStatus } from "../../../container/build.js"
import type { KubernetesProvider, KubernetesPluginContext } from "../../config.js"
import { loadImageToKind, getKindImageStatus } from "../../local/kind.js"
import { loadImageToMicrok8s, getMicrok8sImageStatus } from "../../local/microk8s.js"
import type { ContainerProvider } from "../../../container/container.js"
import type { BuildHandler, BuildStatusHandler, BuildStatusResult } from "./common.js"
import { getManifestInspectArgs } from "./common.js"
import type { ContainerBuildAction } from "../../../container/moduleConfig.js"
import type { BuildActionParams } from "../../../../plugin/action-types.js"
import { k8sGetContainerBuildActionOutputs } from "../handlers.js"
import { cloudBuilder } from "../../../container/cloudbuilder.js"
import { naturalList } from "../../../../util/string.js"

export const getLocalBuildStatus: BuildStatusHandler = async (params) => {
  const { ctx, action, log } = params
  const k8sCtx = ctx as KubernetesPluginContext
  const config = k8sCtx.provider.config
  const deploymentRegistry = config.deploymentRegistry

  const outputs = k8sGetContainerBuildActionOutputs({ provider: k8sCtx.provider, action, log })

  const result: BuildStatusResult = {
    state: "not-ready",
    detail: {
      runtime: cloudBuilder.getActionRuntime(ctx, await cloudBuilder.getAvailability(ctx, action)),
    },
    outputs,
  }

  if (deploymentRegistry) {
    const args = await getManifestInspectArgs(outputs.deploymentImageId, deploymentRegistry)
    const res = await containerHelpers.dockerCli({
      cwd: ctx.projectRoot,
      args,
      log,
      ctx,
      ignoreError: true,
    })

    // Non-zero exit code can both mean the manifest is not found, and any other unexpected error
    if (res.code !== 0 && !res.all.includes("no such manifest")) {
      const detail = res.all || `docker manifest inspect exited with code ${res.code}`
      log.warn(`Unable to query registry for image status: ${detail}`)
    }

    if (res.code === 0) {
      result.state = "ready"
    }
  } else if (config.clusterType === "kind") {
    const ready = await getKindImageStatus(config, outputs.localImageId, log)
    result.state = ready ? "ready" : "not-ready"
  } else if (k8sCtx.provider.config.clusterType === "microk8s") {
    const ready = await getMicrok8sImageStatus(outputs.localImageId)
    result.state = ready ? "ready" : "not-ready"
  } else {
    const res = await getContainerBuildStatus({
      ...params,
      ctx: { ...ctx, provider: ctx.provider.dependencies.container },
    })
    result.state = res.state
  }

  return result
}

export const localBuild: BuildHandler = async (params) => {
  const { ctx, action, log } = params
  const provider = ctx.provider as KubernetesProvider
  const base = params.base || buildContainer

  const outputs = k8sGetContainerBuildActionOutputs({ provider, action, log })
  const localId = outputs.localImageId
  const remoteId = outputs.deploymentImageId

  console.log("doing local build")

  const builtByCloudBuilder = await cloudBuilder.getAvailability(ctx, action)

  // TODO: Kubernetes plugin and container plugin are a little bit twisted; Container plugin has some awareness of Kubernetes, but in this
  // case it can't detect that the image needs to be pushed when using remote builder, because it can't get the Kubernetes config from ctx.
  const containerProvider: ContainerProvider =
    builtByCloudBuilder && provider.config.deploymentRegistry
      ? containerProviderWithAdditionalDockerArgs(provider, ["--tag", remoteId, "--push"])
      : // container provider will add --load when using Container Builder automatically, if --push is not present.
        provider.dependencies.container

  // TODO: How can we pass additional information like Remote Container Builder availability to the base handler?
  // In this particular case the problem is neglegible because we are using an LRU cache and the base handler is will
  // call cloudBuilder.getAvailability very soon; But that is not a beautiful solution.
  const buildResult = await base({ ...params, ctx: { ...ctx, provider: containerProvider } })

  if (!provider.config.deploymentRegistry) {
    await kubernetesContainerHelpers.loadToLocalK8s(params)
    return buildResult
  }

  // Container Builder already pushes the image.
  if (!builtByCloudBuilder) {
    const buildPath = action.getBuildPath()
    const taggedImages = [localId, remoteId]

    log.info({ msg: `→ Tagging images ${naturalList(taggedImages)}` })
    await containerHelpers.dockerCli({ cwd: buildPath, args: ["tag", localId, remoteId], log, ctx })

    log.info({ msg: `→ Pushing image ${remoteId} to remote...` })
    await containerHelpers.dockerCli({ cwd: buildPath, args: ["push", remoteId], log, ctx })
  }

  return { ...buildResult }
}

export const kubernetesContainerHelpers = {
  /**
   * Loads a built local image to a local Kubernetes instance.
   */
  async loadToLocalK8s(params: BuildActionParams<"build", ContainerBuildAction>) {
    const { ctx, log, action } = params
    const provider = ctx.provider as KubernetesProvider

    const { localImageId } = k8sGetContainerBuildActionOutputs({ provider, action, log })

    if (provider.config.clusterType === "kind") {
      await loadImageToKind(localImageId, provider.config, log)
    } else if (provider.config.clusterType === "microk8s") {
      await loadImageToMicrok8s({ action, imageId: localImageId, log, ctx })
    }
  },
}

function containerProviderWithAdditionalDockerArgs(
  provider: KubernetesProvider,
  additionalDockerArgs: string[]
): ContainerProvider {
  const containerProvider = provider.dependencies.container as ContainerProvider
  return {
    ...containerProvider,
    config: {
      ...containerProvider.config,
      dockerBuildExtraFlags: [...(containerProvider.config.dockerBuildExtraFlags || []), ...additionalDockerArgs],
    },
  }
}
