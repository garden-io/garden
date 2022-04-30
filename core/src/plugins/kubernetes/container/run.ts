/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ContainerBuildAction, ContainerDeployAction, ContainerRunAction } from "../../container/moduleConfig"
import { runAndCopy } from "../run"
import { KubernetesProvider, KubernetesPluginContext } from "../config"
import { storeRunResult } from "../run-results"
import { makePodName } from "../util"
import { getAppNamespaceStatus } from "../namespace"
import { BuildActionHandler, DeployActionHandler, RunActionHandler } from "../../../plugin/action-types"
import { getDeploymentImageId } from "./util"

export const k8sRunContainerBuild: BuildActionHandler<"run", ContainerBuildAction> = async (params) => {
  const { action, ctx, log } = params
  const provider = <KubernetesProvider>ctx.provider

  const image = action.getOutput("deploymentImageId")
  const namespaceStatus = await getAppNamespaceStatus(ctx, log, provider)

  const result = await runAndCopy({
    ...params,
    image,
    namespace: namespaceStatus.namespaceName,
    version: action.getVersionString(),
  })

  return {
    ...result,
    namespaceStatus,
  }
}

export const k8sRunContainerDeploy: DeployActionHandler<"run", ContainerDeployAction> = async (params) => {
  const { action, ctx, log, runtimeContext, interactive, timeout } = params
  const { command, args, env, privileged, addCapabilities, dropCapabilities } = action.getSpec()

  runtimeContext.envVars = { ...runtimeContext.envVars, ...env }

  const provider = <KubernetesProvider>ctx.provider

  const image = action.getOutput("deployedImageId")
  const namespaceStatus = await getAppNamespaceStatus(ctx, log, provider)

  const result = await runAndCopy({
    ...params,
    args,
    command,
    timeout,
    image,
    interactive,
    runtimeContext,
    namespace: namespaceStatus.namespaceName,
    version: action.getVersionString(),
    privileged,
    addCapabilities,
    dropCapabilities,
  })

  return {
    ...result,
    namespaceStatus,
  }
}

export const k8sContainerRun: RunActionHandler<"run", ContainerRunAction> = async (params) => {
  const { ctx, log, action } = params
  const {
    args,
    command,
    cacheResult,
    artifacts,
    env,
    cpu,
    memory,
    volumes,
    privileged,
    addCapabilities,
    dropCapabilities,
  } = action.getSpec()

  const image = getDeploymentImageId(action)
  const k8sCtx = ctx as KubernetesPluginContext
  const namespaceStatus = await getAppNamespaceStatus(k8sCtx, log, k8sCtx.provider)

  const runResult = await runAndCopy({
    ...params,
    command,
    args,
    artifacts,
    envVars: env,
    resources: { cpu, memory },
    image,
    namespace: namespaceStatus.namespaceName,
    podName: makePodName("Run", action.name),
    timeout: action.getConfig("timeout"),
    volumes,
    version: action.getVersionString(),
    privileged,
    addCapabilities,
    dropCapabilities,
  })

  if (cacheResult) {
    await storeRunResult({
      ctx,
      log,
      action,
      result: runResult,
    })
  }

  return {
    result: { ...runResult, namespaceStatus },
    outputs: { log: runResult.log },
  }
}
