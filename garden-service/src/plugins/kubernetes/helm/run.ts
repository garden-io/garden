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
import { findServiceResource, getChartResources, getResourceContainer } from "./common"
import { PluginContext } from "../../../plugin-context"
import { LogEntry } from "../../../logger/log-entry"
import { ConfigurationError } from "../../../exceptions"

export async function runHelmModule(
  {
    ctx, module, command, ignoreError = true, interactive, runtimeContext, timeout, log,
  }: RunModuleParams<HelmModule>,
): Promise<RunResult> {
  const context = ctx.provider.config.context
  const namespace = await getAppNamespace(ctx, ctx.provider)

  if (!module.spec.serviceResource) {
    throw new ConfigurationError(
      `Helm module ${module.name} does not specify a \`serviceResource\`. ` +
      `Please configure that in order to run the module ad-hoc.`,
      { moduleName: module.name },
    )
  }

  const image = await getImage(ctx, module, log, module.spec.serviceResource)

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

export async function runHelmTask(
  { ctx, log, module, task, interactive, runtimeContext, timeout }: RunTaskParams<HelmModule>,
): Promise<RunTaskResult> {
  const context = ctx.provider.config.context
  const namespace = await getAppNamespace(ctx, ctx.provider)

  const args = task.spec.args
  const image = await getImage(ctx, module, log, task.spec.resource || module.spec.serviceResource)

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
  })

  return {
    taskName: task.name,
    ...res,
  }
}

async function getImage(ctx: PluginContext, module: HelmModule, log: LogEntry, resourceSpec: HelmResourceSpec) {
  // find the relevant resource, and from that the container image to run
  const chartResources = await getChartResources(ctx, module, log)
  const resource = await findServiceResource({ ctx, log, module, chartResources, resourceSpec })
  const container = getResourceContainer(resource)

  return container.image
}
