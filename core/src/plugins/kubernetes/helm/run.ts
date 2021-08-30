/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { HelmModule } from "./config"
import { PodRunner, runAndCopy } from "../run"
import { getChartResources, getBaseModule } from "./common"
import {
  getServiceResource,
  getResourceContainer,
  getResourcePodSpec,
  getServiceResourceSpec,
  makePodName,
} from "../util"
import { ConfigurationError } from "../../../exceptions"
import { KubernetesPluginContext } from "../config"
import { storeTaskResult } from "../task-results"
import { RunModuleParams } from "../../../types/plugin/module/runModule"
import { RunResult } from "../../../types/plugin/base"
import { RunTaskParams, RunTaskResult } from "../../../types/plugin/task/runTask"
import { uniqByName } from "../../../util/util"
import { prepareEnvVars } from "../util"
import { KubeApi } from "../api"
import { getModuleNamespaceStatus } from "../namespace"
import { DEFAULT_TASK_TIMEOUT } from "../../../constants"
import { KubernetesPod } from "../types"

export async function runHelmModule({
  ctx,
  module,
  args,
  command,
  interactive,
  runtimeContext,
  timeout,
  log,
}: RunModuleParams<HelmModule>): Promise<RunResult> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const namespaceStatus = await getModuleNamespaceStatus({
    ctx: k8sCtx,
    log,
    module,
    provider: k8sCtx.provider,
  })
  const baseModule = getBaseModule(module)
  const resourceSpec = getServiceResourceSpec(module, baseModule)
  const version = module.version.versionString
  const namespace = namespaceStatus.namespaceName

  if (!resourceSpec) {
    throw new ConfigurationError(
      `Helm module ${module.name} does not specify a \`serviceResource\`. ` +
        `Please configure that in order to run the module ad-hoc.`,
      { moduleName: module.name }
    )
  }

  const manifests = await getChartResources({ ctx: k8sCtx, module, devMode: false, hotReload: false, log, version })
  const target = await getServiceResource({
    ctx: k8sCtx,
    log,
    provider: k8sCtx.provider,
    manifests,
    module,
    resourceSpec,
  })
  const container = getResourceContainer(target, resourceSpec.containerName)

  // Apply overrides
  const env = uniqByName([...prepareEnvVars(runtimeContext.envVars), ...(container.env || [])])

  const api = await KubeApi.factory(log, ctx, provider)

  const pod: KubernetesPod = {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: makePodName("run", module.name),
      namespace,
    },
    spec: {
      containers: [
        {
          ...container,
          ...(command && { command }),
          ...(args && { args }),
          env,
        },
      ],
    },
  }

  const runner = new PodRunner({
    ctx,
    api,
    pod,
    provider,
    namespace,
  })

  const result = await runner.runAndWait({
    log,
    remove: true,
    timeoutSec: timeout,
    tty: !!interactive,
  })

  return {
    ...result,
    moduleName: module.name,
    version,
    namespaceStatus,
  }
}

export async function runHelmTask(params: RunTaskParams<HelmModule>): Promise<RunTaskResult> {
  const { ctx, log, module, task } = params
  // TODO: deduplicate this from testHelmModule
  const k8sCtx = <KubernetesPluginContext>ctx

  const { command, args } = task.spec
  const manifests = await getChartResources({
    ctx: k8sCtx,
    module,
    devMode: false,
    hotReload: false,
    log,
    version: module.version.versionString,
  })
  const baseModule = getBaseModule(module)
  const resourceSpec = task.spec.resource || getServiceResourceSpec(module, baseModule)
  const target = await getServiceResource({
    ctx: k8sCtx,
    log,
    provider: k8sCtx.provider,
    manifests,
    module,
    resourceSpec,
  })
  const container = getResourceContainer(target, resourceSpec.containerName)
  const namespaceStatus = await getModuleNamespaceStatus({
    ctx: k8sCtx,
    log,
    module,
    provider: k8sCtx.provider,
  })
  const namespace = namespaceStatus.namespaceName

  const res = await runAndCopy({
    ...params,
    container,
    podSpec: getResourcePodSpec(target),
    command,
    args,
    artifacts: task.spec.artifacts,
    envVars: task.spec.env,
    image: container.image!,
    namespace,
    podName: makePodName("task", module.name, task.name),
    description: `Task '${task.name}' in container module '${module.name}'`,
    timeout: task.config.timeout || DEFAULT_TASK_TIMEOUT,
    version: task.version,
  })

  const result: RunTaskResult = {
    ...res,
    taskName: task.name,
    namespaceStatus,
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
