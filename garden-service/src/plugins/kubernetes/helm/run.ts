/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { HelmModule } from "./config"
import { getAppNamespace } from "../namespace"
import { runPod } from "../run"
import { findServiceResource, getChartResources, getResourceContainer, getServiceResourceSpec } from "./common"
import { ConfigurationError } from "../../../exceptions"
import { KubernetesPluginContext } from "../config"
import { storeTaskResult } from "../task-results"
import { RunModuleParams } from "../../../types/plugin/module/runModule"
import { RunResult } from "../../../types/plugin/base"
import { RunTaskParams, RunTaskResult } from "../../../types/plugin/task/runTask"
import { uniqByName } from "../../../util/util"
import { prepareEnvVars } from "../util"
import { V1PodSpec } from "@kubernetes/client-node"

export async function runHelmModule({
  ctx,
  module,
  args,
  command,
  ignoreError = true,
  interactive,
  runtimeContext,
  timeout,
  log,
}: RunModuleParams<HelmModule>): Promise<RunResult> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const namespace = await getAppNamespace(k8sCtx, log, provider)
  const resourceSpec = getServiceResourceSpec(module)

  if (!resourceSpec) {
    throw new ConfigurationError(
      `Helm module ${module.name} does not specify a \`serviceResource\`. ` +
        `Please configure that in order to run the module ad-hoc.`,
      { moduleName: module.name }
    )
  }

  const chartResources = await getChartResources(k8sCtx, module, log)
  const target = await findServiceResource({
    ctx: k8sCtx,
    log,
    chartResources,
    module,
    resourceSpec,
  })
  const container = getResourceContainer(target, resourceSpec.containerName)

  // Apply overrides
  const env = uniqByName([...prepareEnvVars(runtimeContext.envVars), ...(container.env || [])])

  const spec: V1PodSpec = {
    containers: [
      {
        ...container,
        ...(command && { command }),
        ...(args && { args }),
        env,
      },
    ],
  }

  return runPod({
    provider,
    image: container.image,
    interactive,
    ignoreError,
    log,
    module,
    namespace,
    spec,
    timeout,
  })
}

export async function runHelmTask({
  ctx,
  log,
  module,
  task,
  taskVersion,
  interactive,
  timeout,
}: RunTaskParams<HelmModule>): Promise<RunTaskResult> {
  // TODO: deduplicate this from testHelmModule
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)

  const { command, args } = task.spec
  const chartResources = await getChartResources(k8sCtx, module, log)
  const resourceSpec = task.spec.resource || getServiceResourceSpec(module)
  const target = await findServiceResource({
    ctx: k8sCtx,
    log,
    chartResources,
    module,
    resourceSpec,
  })
  const container = getResourceContainer(target, resourceSpec.containerName)

  // Apply overrides
  const env = uniqByName([...prepareEnvVars(task.spec.env), ...(container.env || [])])

  const spec: V1PodSpec = {
    containers: [
      {
        ...container,
        ...(command && { command }),
        ...(args && { args }),
        env,
        // TODO: consider supporting volume mounts in ad-hoc runs (would need specific logic and testing)
        volumeMounts: [],
      },
    ],
  }

  const res = await runPod({
    provider,
    image: container.image,
    interactive,
    ignoreError: false,
    log,
    module,
    namespace,
    spec,
    timeout,
  })

  const result = {
    ...res,
    taskName: task.name,
    outputs: {
      log: res.output || "",
    },
  }

  await storeTaskResult({
    ctx,
    log,
    module,
    result,
    taskVersion,
    taskName: task.name,
  })

  return result
}
