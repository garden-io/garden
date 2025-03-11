/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ContainerTestAction } from "../../container/moduleConfig.js"
import { composeCacheableTestResult, toTestActionStatus } from "../test-results.js"
import { storeTestResult } from "../test-results.js"
import { runAndCopy } from "../run.js"
import { makePodName } from "../util.js"
import { getNamespaceStatus } from "../namespace.js"
import type { KubernetesPluginContext } from "../config.js"
import type { TestActionHandler } from "../../../plugin/action-types.js"
import { getDeployedImageId } from "./util.js"

export const k8sContainerTest: TestActionHandler<"run", ContainerTestAction> = async (params) => {
  const { ctx, log, action } = params
  const { command, args, artifacts, env, cpu, memory, volumes, privileged, addCapabilities, dropCapabilities } =
    action.getSpec()

  const timeout = action.getConfig("timeout")
  const k8sCtx = ctx as KubernetesPluginContext
  const image = getDeployedImageId(action)
  const namespaceStatus = await getNamespaceStatus({ ctx: k8sCtx, log, provider: k8sCtx.provider })

  const result = await runAndCopy({
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
    volumes,
    privileged,
    addCapabilities,
    dropCapabilities,
  })

  const detail = composeCacheableTestResult({ result, action, namespaceStatus })

  if (action.getSpec("cacheResult")) {
    await storeTestResult({
      ctx,
      log,
      action,
      result: detail,
    })
  }

  return toTestActionStatus(detail)
}
