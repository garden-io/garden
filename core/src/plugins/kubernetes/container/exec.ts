/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
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
import { getContainerServiceStatus } from "./status"
import { KubernetesPluginContext, KubernetesProvider } from "../config"
import { ExecInServiceParams } from "../../../types/plugin/service/execInService"
import { LogEntry } from "../../../logger/log-entry"
import { getCurrentWorkloadPods } from "../util"
import { KubernetesWorkload } from "../types"
import { PluginContext } from "../../../plugin-context"
import { PodRunner } from "../run"

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

  return execInWorkload({ ctx, provider, log, namespace, workload: status.detail.workload, command, interactive })
}

export async function execInWorkload({
  ctx,
  provider,
  log,
  namespace,
  workload,
  command,
  interactive,
}: {
  ctx: PluginContext
  provider: KubernetesProvider
  log: LogEntry
  namespace: string
  workload: KubernetesWorkload
  command: string[]
  interactive: boolean
}) {
  const api = await KubeApi.factory(log, ctx, provider)
  const pods = await getCurrentWorkloadPods(api, namespace, workload)

  const pod = pods[0]

  if (!pod) {
    // This should not happen because of the prior status check, but checking to be sure
    throw new DeploymentError(`Could not find running pod for ${workload.kind}/${workload.metadata.name}`, {
      workload,
    })
  }

  const runner = new PodRunner({
    api,
    ctx,
    provider,
    namespace,
    pod,
  })

  const res = await runner.exec({
    log,
    command,
    timeoutSec: 999999,
    tty: interactive,
  })

  return { code: res.exitCode, output: res.log }
}
