/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ContainerRunAction } from "../../container/moduleConfig"
import { runAndCopy } from "../run"
import { KubernetesPluginContext } from "../config"
import { storeRunResult } from "../run-results"
import { makePodName } from "../util"
import { getAppNamespaceStatus } from "../namespace"
import { RunActionHandler } from "../../../plugin/action-types"
import { getDeployedImageId } from "./util"
import { runResultToActionState } from "../../../actions/base"

export const k8sContainerRun: RunActionHandler<"run", ContainerRunAction> = async (params) => {
  const { ctx, log, action } = params
  const {
    args,
    command,
    cacheResult,
    artifacts,
    env,
    cpu,
    memory,
    volumes,
    privileged,
    addCapabilities,
    dropCapabilities,
  } = action.getSpec()

  const k8sCtx = ctx as KubernetesPluginContext
  const image = getDeployedImageId(action, k8sCtx.provider)
  const namespaceStatus = await getAppNamespaceStatus(k8sCtx, log, k8sCtx.provider)

  const runResult = await runAndCopy({
    ...params,
    command,
    args,
    artifacts,
    envVars: env,
    resources: { cpu, memory },
    image,
    namespace: namespaceStatus.namespaceName,
    podName: makePodName("Run", action.name),
    timeout: action.getConfig("timeout"),
    volumes,
    version: action.versionString(),
    privileged,
    addCapabilities,
    dropCapabilities,
  })

  if (cacheResult) {
    await storeRunResult({
      ctx,
      log,
      action,
      result: runResult,
    })
  }

  return {
    state: runResultToActionState(runResult),
    detail: { ...runResult, namespaceStatus },
    outputs: { log: runResult.log },
  }
}
