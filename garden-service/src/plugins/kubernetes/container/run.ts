/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { includes } from "lodash"
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
import { LogEntry } from "../../../logger/log-entry"
import { getWorkloadPods, prepareEnvVars } from "../util"
import { uniqByName } from "../../../util/util"
import { V1PodSpec } from "@kubernetes/client-node"
import { KubernetesWorkload } from "../types"

export async function execInService(params: ExecInServiceParams<ContainerModule>) {
  const { ctx, log, service, command, interactive } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const status = await getContainerServiceStatus({
    ...params,
    // The runtime context doesn't matter here. We're just checking if the service is running.
    runtimeContext: {
      envVars: {},
      dependencies: [],
    },
    hotReload: false,
  })
  const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)

  // TODO: this check should probably live outside of the plugin
  if (!status.detail.workload || !includes(["ready", "outdated"], status.state)) {
    throw new DeploymentError(`Service ${service.name} is not running`, {
      name: service.name,
      state: status.state,
    })
  }

  return execInWorkload({ provider, log, namespace, workload: status.detail.workload, command, interactive })
}

export async function execInWorkload({
  provider,
  log,
  namespace,
  workload,
  command,
  interactive,
}: {
  provider: KubernetesProvider
  log: LogEntry
  namespace: string
  workload: KubernetesWorkload
  command: string[]
  interactive: boolean
}) {
  const api = await KubeApi.factory(log, provider)
  const pods = await getWorkloadPods(api, namespace, workload)

  const pod = pods[0]

  if (!pod) {
    // This should not happen because of the prior status check, but checking to be sure
    throw new DeploymentError(`Could not find running pod for ${workload.kind}/${workload.metadata.name}`, {
      workload,
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
    provider,
    namespace,
    args: kubecmd,
    ignoreError: true,
    timeout: 999999,
    tty: interactive,
  })

  return { code: res.code, output: res.output }
}

export async function runContainerModule({
  ctx,
  log,
  module,
  args,
  command,
  ignoreError = true,
  interactive,
  runtimeContext,
  timeout,
}: RunModuleParams<ContainerModule>): Promise<RunResult> {
  const provider = <KubernetesProvider>ctx.provider
  const namespace = await getAppNamespace(ctx, log, provider)

  // Apply overrides
  const image = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)
  const envVars = runtimeContext.envVars
  const env = uniqByName(prepareEnvVars(envVars))

  const spec: V1PodSpec = {
    containers: [
      {
        name: "main",
        image,
        ...(command && { command }),
        ...(args && { args }),
        env,
      },
    ],
  }

  return runPod({
    provider,
    image,
    interactive,
    ignoreError,
    log,
    module,
    namespace,
    spec,
    timeout,
  })
}

export async function runContainerService({
  ctx,
  service,
  interactive,
  runtimeContext,
  timeout,
  log,
}: RunServiceParams<ContainerModule>): Promise<RunResult> {
  const { command, args } = service.spec
  return runContainerModule({
    ctx,
    module: service.module,
    command,
    args,
    interactive,
    runtimeContext,
    timeout,
    log,
  })
}

export async function runContainerTask({
  ctx,
  log,
  module,
  task,
  taskVersion,
  interactive,
  runtimeContext,
}: RunTaskParams<ContainerModule>): Promise<RunTaskResult> {
  const provider = <KubernetesProvider>ctx.provider
  const namespace = await getAppNamespace(ctx, log, provider)

  // Apply overrides
  const { args, command } = task.spec
  const image = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)
  const envVars = { ...runtimeContext.envVars, ...task.spec.env }
  const env = uniqByName(prepareEnvVars(envVars))

  const spec: V1PodSpec = {
    containers: [
      {
        name: "main",
        image,
        ...(command && { command }),
        ...(args && { args }),
        env,
      },
    ],
  }

  const res = await runPod({
    provider,
    image,
    interactive,
    ignoreError: false,
    log,
    module,
    namespace,
    spec,
    timeout: task.spec.timeout || 9999,
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
