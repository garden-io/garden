/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { includes, extend } from "lodash"
import { DeploymentError } from "../../../exceptions"
import { ContainerModule } from "../../container/config"
import { KubeApi } from "../api"
import { getAppNamespace } from "../namespace"
import { kubectl } from "../kubectl"
import { getContainerServiceStatus } from "./status"
import { runPod } from "../run"
import { containerHelpers } from "../../container/helpers"
import { KubernetesPluginContext, KubernetesProvider } from "../config"
import { storeTaskResult } from "../task-results"
import { ExecInServiceParams } from "../../../types/plugin/service/execInService"
import { RunModuleParams } from "../../../types/plugin/module/runModule"
import { RunResult } from "../../../types/plugin/base"
import { RunServiceParams } from "../../../types/plugin/service/runService"
import { RunTaskParams, RunTaskResult } from "../../../types/plugin/task/runTask"

export async function execInService(params: ExecInServiceParams<ContainerModule>) {
  const { ctx, log, service, command, interactive } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const api = await KubeApi.factory(log, provider.config.context)
  const status = await getContainerServiceStatus({ ...params, hotReload: false })
  const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)

  // TODO: this check should probably live outside of the plugin
  if (!includes(["ready", "outdated"], status.state)) {
    throw new DeploymentError(`Service ${service.name} is not running`, {
      name: service.name,
      state: status.state,
    })
  }

  // get a running pod
  // NOTE: the awkward function signature called out here: https://github.com/kubernetes-client/javascript/issues/53
  const podsRes = await api.core.listNamespacedPod(
    namespace,
    undefined,
    undefined,
    undefined,
    undefined,
    `service=${service.name}`,
  )
  const pod = podsRes.body.items[0]

  if (!pod) {
    // This should not happen because of the prior status check, but checking to be sure
    throw new DeploymentError(`Could not find running pod for ${service.name}`, {
      serviceName: service.name,
    })
  }

  // exec in the pod via kubectl
  const opts: string[] = []

  if (interactive) {
    opts.push("-it")
  }

  const kubecmd = ["exec", ...opts, pod.metadata.name, "--", ...command]
  const res = await kubectl.spawnAndWait({
    log,
    context: api.context,
    namespace,
    args: kubecmd,
    ignoreError: true,
    timeout: 999999,
    tty: interactive,
  })

  return { code: res.code, output: res.output }
}

export async function runContainerModule(
  {
    ctx, log, module, command, ignoreError = true, interactive, runtimeContext, timeout,
  }: RunModuleParams<ContainerModule>,
): Promise<RunResult> {
  const provider = <KubernetesProvider>ctx.provider
  const context = provider.config.context
  const namespace = await getAppNamespace(ctx, log, provider)
  const image = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)

  return runPod({
    context,
    namespace,
    module,
    envVars: runtimeContext.envVars,
    // TODO: get rid of this (see https://github.com/garden-io/garden/issues/401)
    args: ["/bin/sh", "-c", command.join(" ")],
    image,
    interactive,
    ignoreError,
    timeout,
    log,
  })
}

export async function runContainerService(
  { ctx, service, interactive, runtimeContext, timeout, log }: RunServiceParams<ContainerModule>,
) {
  return runContainerModule({
    ctx,
    module: service.module,
    command: service.spec.args || [],
    interactive,
    runtimeContext,
    timeout,
    log,
  })
}

export async function runContainerTask(
  { ctx, log, module, task, taskVersion, interactive, runtimeContext }: RunTaskParams<ContainerModule>,
): Promise<RunTaskResult> {
  extend(runtimeContext.envVars, task.spec.env || {})

  const provider = <KubernetesProvider>ctx.provider
  const context = provider.config.context
  const namespace = await getAppNamespace(ctx, log, provider)
  const image = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)
  const args = task.spec.args || []

  const res = await runPod({
    context,
    namespace,
    module,
    envVars: runtimeContext.envVars,
    // TODO: get rid of this (see https://github.com/garden-io/garden/issues/401)
    args: ["/bin/sh", "-c", args.join(" ")],
    image,
    interactive,
    ignoreError: false,
    timeout: task.spec.timeout || 9999,
    // Workaround to make sure sidecars are not injected, due to https://github.com/kubernetes/kubernetes/issues/25908
    overrides: { metadata: { annotations: { "sidecar.istio.io/inject": "false" } } },
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
