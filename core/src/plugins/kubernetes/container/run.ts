/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ContainerModule } from "../../container/config"
import { runAndCopy } from "../run"
import { containerHelpers } from "../../container/helpers"
import { KubernetesProvider, KubernetesPluginContext } from "../config"
import { storeTaskResult } from "../task-results"
import { RunModuleParams } from "../../../types/plugin/module/runModule"
import { RunResult } from "../../../types/plugin/base"
import { RunServiceParams } from "../../../types/plugin/service/runService"
import { RunTaskParams, RunTaskResult } from "../../../types/plugin/task/runTask"
import { makePodName } from "../util"
import { getAppNamespaceStatus } from "../namespace"

export async function runContainerModule(params: RunModuleParams<ContainerModule>): Promise<RunResult> {
  const { module, ctx, log } = params
  const provider = <KubernetesProvider>ctx.provider

  const image = containerHelpers.getDeploymentImageId(module, module.version, provider.config.deploymentRegistry)
  const namespaceStatus = await getAppNamespaceStatus(ctx, log, provider)

  const result = await runAndCopy({
    ...params,
    image,
    namespace: namespaceStatus.namespaceName,
    version: module.version.versionString,
  })

  return {
    ...result,
    namespaceStatus,
  }
}

export async function runContainerService(params: RunServiceParams<ContainerModule>): Promise<RunResult> {
  const { module, ctx, log, service, runtimeContext, interactive, timeout } = params
  const { command, args, env } = service.spec

  runtimeContext.envVars = { ...runtimeContext.envVars, ...env }

  const provider = <KubernetesProvider>ctx.provider

  const image = containerHelpers.getDeploymentImageId(module, module.version, provider.config.deploymentRegistry)
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
    version: service.version,
  })

  return {
    ...result,
    namespaceStatus,
  }
}

export async function runContainerTask(params: RunTaskParams<ContainerModule>): Promise<RunTaskResult> {
  const { ctx, log, module, task } = params
  const { args, command, artifacts, env, cpu, memory, timeout, volumes } = task.spec

  const image = containerHelpers.getDeploymentImageId(module, module.version, ctx.provider.config.deploymentRegistry)
  const k8sCtx = ctx as KubernetesPluginContext
  const namespaceStatus = await getAppNamespaceStatus(k8sCtx, log, k8sCtx.provider)

  const res = await runAndCopy({
    ...params,
    command,
    args,
    artifacts,
    envVars: env,
    resources: { cpu, memory },
    image,
    namespace: namespaceStatus.namespaceName,
    podName: makePodName("task", module.name, task.name),
    description: `Task '${task.name}' in container module '${module.name}'`,
    timeout: timeout || undefined,
    volumes,
    version: task.version,
  })

  const result: RunTaskResult = {
    ...res,
    namespaceStatus,
    taskName: task.name,
    outputs: {
      log: res.log || "",
    },
  }

  if (task.config.cacheResult) {
    await storeTaskResult({
      ctx,
      log,
      module,
      result,
      task,
    })
  }

  return result
}
