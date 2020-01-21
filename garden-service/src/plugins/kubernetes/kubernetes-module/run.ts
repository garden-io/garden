/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { KubernetesModule } from "./config"
import { runAndCopy } from "../run"
import { findServiceResource, getResourceContainer, getServiceResourceSpec } from "../util"
import { KubernetesPluginContext } from "../config"
import { storeTaskResult } from "../task-results"
import { RunTaskParams, RunTaskResult } from "../../../types/plugin/task/runTask"
import { getManifests } from "./common"
import { getNamespace } from "../namespace"
import { KubeApi } from "../api"

export async function runKubernetesTask(params: RunTaskParams<KubernetesModule>): Promise<RunTaskResult> {
  const { ctx, log, module, task, taskVersion, timeout } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const namespace = await getNamespace({
    log,
    projectName: k8sCtx.projectName,
    provider: k8sCtx.provider,
    skipCreate: true,
  })
  const api = await KubeApi.factory(log, k8sCtx.provider)

  // Get the container spec to use for running
  const { command, args } = task.spec
  const manifests = await getManifests(api, log, module, namespace)
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
    command,
    args,
    artifacts: task.spec.artifacts,
    envVars: task.spec.env,
    image: container.image,
    podName: `task-${module.name}-${task.name}-${Math.round(new Date().getTime())}`,
    description: `Task '${task.name}' in container module '${module.name}'`,
    timeout,
    ignoreError: true, // to ensure results get stored when an error occurs
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
