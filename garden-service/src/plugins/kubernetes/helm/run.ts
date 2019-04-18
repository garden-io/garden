/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { RunTaskParams, RunModuleParams } from "../../../types/plugin/params"
import { HelmModule, HelmResourceSpec } from "./config"
import { RunTaskResult, RunResult } from "../../../types/plugin/outputs"
import { getAppNamespace } from "../namespace"
import { runPod } from "../run"
import { findServiceResource, getChartResources, getResourceContainer, getServiceResourceSpec } from "./common"
import { PluginContext } from "../../../plugin-context"
import { LogEntry } from "../../../logger/log-entry"
import { ConfigurationError } from "../../../exceptions"
import { KubernetesPluginContext } from "../kubernetes"
import { storeTaskResult } from "../task-results"

export async function runHelmModule(
  {
    ctx, module, command, ignoreError = true, interactive, runtimeContext, timeout, log,
  }: RunModuleParams<HelmModule>,
): Promise<RunResult> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const context = k8sCtx.provider.config.context
  const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)
  const serviceResourceSpec = getServiceResourceSpec(module)

  if (!serviceResourceSpec) {
    throw new ConfigurationError(
      `Helm module ${module.name} does not specify a \`serviceResource\`. ` +
      `Please configure that in order to run the module ad-hoc.`,
      { moduleName: module.name },
    )
  }

  const image = await getImage(k8sCtx, module, log, serviceResourceSpec)

  return runPod({
    context,
    namespace,
    module,
    envVars: runtimeContext.envVars,
    args: command,
    image,
    interactive,
    ignoreError,
    timeout,
    log,
  })
}

export async function runHelmTask(
  { ctx, log, module, task, taskVersion, interactive, runtimeContext, timeout }: RunTaskParams<HelmModule>,
): Promise<RunTaskResult> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const context = k8sCtx.provider.config.context
  const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)

  const args = task.spec.args
  const image = await getImage(k8sCtx, module, log, task.spec.resource || getServiceResourceSpec(module))

  const res = await runPod({
    context,
    namespace,
    module,
    envVars: { ...runtimeContext.envVars, ...task.spec.env },
    args,
    image,
    interactive,
    ignoreError: false,
    timeout,
    log,
  })

  const result = { ...res, taskName: task.name }

  await storeTaskResult({
    ctx,
    log,
    result,
    taskVersion,
    taskName: task.name,
  })

  return result
}

async function getImage(ctx: PluginContext, module: HelmModule, log: LogEntry, resourceSpec: HelmResourceSpec) {
  // find the relevant resource, and from that the container image to run
  const chartResources = await getChartResources(ctx, module, log)
  const resource = await findServiceResource({ ctx, log, module, chartResources, resourceSpec })
  const container = getResourceContainer(resource)

  return container.image
}
