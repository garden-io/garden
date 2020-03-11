/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
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
import { KubernetesPluginContext, KubernetesProvider } from "../config"
import { ExecInServiceParams } from "../../../types/plugin/service/execInService"
import { LogEntry } from "../../../logger/log-entry"
import { getCurrentWorkloadPods } from "../util"
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
  const pods = await getCurrentWorkloadPods(api, namespace, workload)

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
  const res = await kubectl(provider).spawnAndWait({
    log,
    namespace,
    args: kubecmd,
    ignoreError: true,
    timeout: 999999,
    tty: interactive,
  })

  return { code: res.code, output: res.all }
}
