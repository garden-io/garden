/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ContainerModule } from "../../container/config"
import { runAndCopy } from "../run"
import { containerHelpers } from "../../container/helpers"
import { KubernetesProvider } from "../config"
import { storeTaskResult } from "../task-results"
import { RunModuleParams } from "../../../types/plugin/module/runModule"
import { RunResult } from "../../../types/plugin/base"
import { RunServiceParams } from "../../../types/plugin/service/runService"
import { RunTaskParams, RunTaskResult } from "../../../types/plugin/task/runTask"

export async function runContainerModule(params: RunModuleParams<ContainerModule>): Promise<RunResult> {
  const { module, ctx } = params
  const provider = <KubernetesProvider>ctx.provider

  const image = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)

  return runAndCopy({
    ...params,
    image,
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
  const { command, args, env } = service.spec

  runtimeContext.envVars = { ...runtimeContext.envVars, ...env }

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

export async function runContainerTask(params: RunTaskParams<ContainerModule>): Promise<RunTaskResult> {
  const { ctx, log, module, task, taskVersion } = params
  const { args, command } = task.spec

  const image = await containerHelpers.getDeploymentImageId(module, ctx.provider.config.deploymentRegistry)

  const res = await runAndCopy({
    ...params,
    command,
    args,
    artifacts: task.spec.artifacts,
    envVars: task.spec.env,
    image,
    podName: `task-${module.name}-${task.name}-${Math.round(new Date().getTime())}`,
    description: `Task '${task.name}' in container module '${module.name}'`,
    timeout: task.spec.timeout || undefined,
    ignoreError: true, // to ensure results get stored when an error occurs
  })

  const result: RunTaskResult = {
    ...res,
    taskName: task.name,
    outputs: {
      log: res.log || "",
    },
  }

  return storeTaskResult({
    ctx,
    log,
    module,
    result,
    taskVersion,
    taskName: task.name,
  })
}
