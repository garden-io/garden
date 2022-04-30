/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { KubernetesModule } from "./module-config"
import { runAndCopy } from "../run"
import {
  getTargetResource,
  getResourceContainer,
  getResourcePodSpec,
  getServiceResourceSpec,
  makePodName,
} from "../util"
import { KubernetesPluginContext } from "../config"
import { storeRunResult } from "../run-results"
import { RunTaskParams, RunTaskResult } from "../../../types/plugin/task/runTask"
import { getManifests } from "./common"
import { KubeApi } from "../api"
import { getActionNamespaceStatus } from "../namespace"
import { DEFAULT_TASK_TIMEOUT } from "../../../constants"
import { RunActionHandler } from "../../../plugin/action-types"
import { KubernetesRunAction } from "./config"

export const kubernetesPodRun: RunActionHandler<"run", KubernetesRunAction> = async (params) => {
  const { ctx, log, action } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const namespaceStatus = await getActionNamespaceStatus({
    ctx: k8sCtx,
    log,
    action,
    provider: k8sCtx.provider,
  })
  const namespace = namespaceStatus.namespaceName
  const api = await KubeApi.factory(log, ctx, k8sCtx.provider)

  // Get the container spec to use for running
  const spec = action.getSpec()
  const manifests = await getManifests({ ctx, api, log, action, defaultNamespace: namespace })
  const resourceSpec = spec.target
  const target = await getTargetResource({
    ctx: k8sCtx,
    log,
    provider: k8sCtx.provider,
    manifests,
    action,
    resourceSpec,
  })
  const container = getResourceContainer(target, resourceSpec.containerName)

  const res = await runAndCopy({
    ...params,
    container,
    podSpec: getResourcePodSpec(target),
    command: spec.command,
    args: spec.args,
    artifacts: spec.artifacts,
    envVars: spec.env,
    image: container.image!,
    namespace,
    podName: makePodName("run", action.name),
    timeout: action.getConfig("timeout") || DEFAULT_TASK_TIMEOUT,
    version: action.getVersionString(),
  })

  const result = {
    ...res,
    namespaceStatus,
    taskName: action.name,
    outputs: {
      log: res.log || "",
    },
  }

  if (spec.cacheResult) {
    await storeRunResult({
      ctx,
      log,
      action,
      result,
    })
  }

  return { result, outputs: result.outputs }
}
