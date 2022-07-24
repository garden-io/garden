/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ContainerTestAction } from "../../container/moduleConfig"
import { DEFAULT_TEST_TIMEOUT } from "../../../constants"
import { storeTestResult } from "../test-results"
import { runAndCopy } from "../run"
import { makePodName } from "../util"
import { getAppNamespaceStatus } from "../namespace"
import { KubernetesPluginContext } from "../config"
import { TestActionHandler } from "../../../plugin/action-types"
import { getDeployedImageId } from "./util"
import { runResultToActionState } from "../../../actions/base"

export const k8sContainerTest: TestActionHandler<"run", ContainerTestAction> = async (params) => {
  const { ctx, action, log } = params
  const {
    command,
    args,
    artifacts,
    env,
    cpu,
    memory,
    volumes,
    privileged,
    addCapabilities,
    dropCapabilities,
  } = action.getSpec()
  const timeout = action.getConfig("timeout") || DEFAULT_TEST_TIMEOUT
  const k8sCtx = ctx as KubernetesPluginContext

  const image = getDeployedImageId(action, k8sCtx.provider)
  const namespaceStatus = await getAppNamespaceStatus(k8sCtx, log, k8sCtx.provider)

  const res = await runAndCopy({
    ...params,
    command,
    args,
    artifacts,
    envVars: env,
    resources: { cpu, memory },
    image,
    namespace: namespaceStatus.namespaceName,
    podName: makePodName("test", action.name),
    timeout,
    version: action.versionString(),
    volumes,
    privileged,
    addCapabilities,
    dropCapabilities,
  })

  const result = {
    testName: action.name,
    namespaceStatus,
    ...res,
  }

  await storeTestResult({
    ctx,
    log,
    action,
    result,
  })

  return { state: runResultToActionState(result), detail: result, outputs: { log: res.log } }
}
