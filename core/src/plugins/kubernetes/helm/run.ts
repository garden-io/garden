/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { HelmModule } from "./module-config"
import { PodRunner, runAndCopy } from "../run"
import { getBaseModule, getChartResources } from "./common"
import {
  getResourceContainer,
  getResourcePodSpec,
  getServiceResourceSpec,
  getTargetResource,
  makePodName,
  prepareEnvVars,
} from "../util"
import { ConfigurationError } from "../../../exceptions"
import { KubernetesPluginContext } from "../config"
import { storeRunResult } from "../run-results"
import { RunModuleParams } from "../../../types/plugin/module/runModule"
import { RunResult } from "../../../plugin/base"
import { RunTaskParams, RunTaskResult } from "../../../types/plugin/task/runTask"
import { uniqByName } from "../../../util/util"
import { KubeApi } from "../api"
import { getActionNamespaceStatus } from "../namespace"
import { DEFAULT_TASK_TIMEOUT } from "../../../constants"
import { KubernetesPod } from "../types"
import { DeployActionHandler } from "../../../plugin/action-types"
import { HelmDeployAction } from "./config"

export const runHelmDeploy: DeployActionHandler<"run", HelmDeployAction> = async (params) => {
  const {
    ctx,
    action,
    args,
    command,
    interactive,
    runtimeContext,
    timeout,
    log,
  } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const namespaceStatus = await getActionNamespaceStatus({
    ctx: k8sCtx,
    log,
    module,
    provider: k8sCtx.provider,
  })
  const baseModule = getBaseModule(module)
  const resourceSpec = getServiceResourceSpec(module, baseModule)
  const version = module.version.versionString
  const namespace = namespaceStatus.namespaceName

  if (!resourceSpec) {
    throw new ConfigurationError(
      `Helm module ${module.name} does not specify a \`serviceResource\`. ` +
        `Please configure that in order to run the module ad-hoc.`,
      { moduleName: module.name }
    )
  }

  const manifests = await getChartResources({ ctx: k8sCtx, module, devMode: false, localMode: false, log, version })
  const target = await getTargetResource({
    ctx: k8sCtx,
    log,
    provider: k8sCtx.provider,
    manifests,
    module,
    resourceSpec,
  })
  const container = getResourceContainer(target, resourceSpec.containerName)

  // Apply overrides
  const env = uniqByName([...prepareEnvVars(runtimeContext.envVars), ...(container.env || [])])

  const api = await KubeApi.factory(log, ctx, provider)

  const pod: KubernetesPod = {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: makePodName("run", module.name),
      namespace,
    },
    spec: {
      containers: [
        {
          ...container,
          ...(command && { command }),
          ...(args && { args }),
          env,
        },
      ],
    },
  }

  const runner = new PodRunner({
    ctx,
    api,
    pod,
    provider,
    namespace,
  })

  const result = await runner.runAndWait({
    log,
    remove: true,
    timeoutSec: timeout,
    events: ctx.events,
    tty: !!interactive,
  })

  return {
    ...result,
    moduleName: module.name,
    version,
    namespaceStatus,
  }
}
