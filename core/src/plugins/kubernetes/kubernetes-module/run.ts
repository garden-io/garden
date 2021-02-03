/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { KubernetesModule } from "./config"
import { runAndCopy } from "../run"
import {
  findServiceResource,
  getResourceContainer,
  getResourcePodSpec,
  getServiceResourceSpec,
  makePodName,
} from "../util"
import { KubernetesPluginContext } from "../config"
import { storeTaskResult } from "../task-results"
import { RunTaskParams, RunTaskResult } from "../../../types/plugin/task/runTask"
import { getManifests } from "./common"
import { KubeApi } from "../api"
import { getModuleNamespace } from "../namespace"
import { DEFAULT_TASK_TIMEOUT } from "../../../constants"

export async function runKubernetesTask(params: RunTaskParams<KubernetesModule>): Promise<RunTaskResult> {
  const { ctx, log, module, task, taskVersion } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const namespace = await getModuleNamespace({
    ctx: k8sCtx,
    log,
    module,
    provider: k8sCtx.provider,
  })
  const api = await KubeApi.factory(log, ctx, k8sCtx.provider)

  // Get the container spec to use for running
  const { command, args } = task.spec
  const manifests = await getManifests({ api, log, module, defaultNamespace: namespace })
  const resourceSpec = task.spec.resource || getServiceResourceSpec(module, undefined)
  const target = await findServiceResource({
    ctx: k8sCtx,
    log,
    manifests,
    module,
    baseModule: undefined,
    resourceSpec,
  })
  const container = getResourceContainer(target, resourceSpec.containerName)

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
  })

  const result = {
    ...res,
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
      taskVersion,
      taskName: task.name,
    })
  }

  return result
}
