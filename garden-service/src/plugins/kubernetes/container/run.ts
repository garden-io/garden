/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { includes, extend } from "lodash"
import { DeploymentError } from "../../../exceptions"
import { RunResult } from "../../../types/plugin/outputs"
import {
  ExecInServiceParams,
  RunModuleParams,
  RunServiceParams,
  RunTaskParams,
} from "../../../types/plugin/params"
import { ContainerModule } from "../../container/config"
import { KubeApi } from "../api"
import { getAppNamespace } from "../namespace"
import { kubectl } from "../kubectl"
import { getContainerServiceStatus } from "./status"
import { runPod } from "../run"
import { containerHelpers } from "../../container/helpers"

export async function execInService(params: ExecInServiceParams<ContainerModule>) {
  const { ctx, service, command, interactive } = params
  const api = new KubeApi(ctx.provider)
  const status = await getContainerServiceStatus({ ...params, hotReload: false })
  const namespace = await getAppNamespace(ctx, ctx.provider)

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
  const res = await kubectl(api.context, namespace).call(kubecmd, {
    ignoreError: true,
    timeout: 999999,
    tty: interactive,
  })

  return { code: res.code, output: res.output }
}

export async function runContainerModule(
  {
    ctx, module, command, ignoreError = true, interactive, runtimeContext, timeout,
  }: RunModuleParams<ContainerModule>,
): Promise<RunResult> {
  const context = ctx.provider.config.context
  const namespace = await getAppNamespace(ctx, ctx.provider)
  const image = await containerHelpers.getLocalImageId(module)

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
  { ctx, task, interactive, runtimeContext, log }: RunTaskParams<ContainerModule>,
) {
  extend(runtimeContext.envVars, task.spec.env || {})

  const result = await runContainerModule({
    ctx,
    interactive,
    log,
    runtimeContext,
    module: task.module,
    command: task.spec.args || [],
    ignoreError: false,
    timeout: task.spec.timeout || 9999,
  })

  return {
    ...result,
    taskName: task.name,
  }
}
