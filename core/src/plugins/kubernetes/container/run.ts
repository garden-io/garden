/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ContainerRunAction } from "../../container/moduleConfig.js"
import { runAndCopy } from "../run.js"
import type { KubernetesPluginContext } from "../config.js"
import { makePodName, toActionStatus } from "../util.js"
import { getNamespaceStatus } from "../namespace.js"
import type { RunActionHandler } from "../../../plugin/action-types.js"
import { getDeployedImageId } from "./util.js"
import { composeKubernetesCacheEntry } from "../results-cache-base.js"
import { getRunResultCache } from "../results-cache.js"

export const k8sContainerRun: RunActionHandler<"run", ContainerRunAction> = async (params) => {
  const { ctx, log, action } = params
  const { command, args, artifacts, env, cpu, memory, volumes, privileged, addCapabilities, dropCapabilities } =
    action.getSpec()

  const timeout = action.getConfig("timeout")
  const k8sCtx = ctx as KubernetesPluginContext
  const image = getDeployedImageId(action)
  let namespaceStatus = await getNamespaceStatus({ ctx: k8sCtx, log, provider: k8sCtx.provider })
  if (namespaceStatus.state === "missing") {
    // return { state: "not-ready", detail: null, outputs: { log: "" } }
  }

  const result = await runAndCopy({
    ...params,
    command,
    args,
    artifacts,
    envVars: env,
    resources: { cpu, memory },
    image,
    namespace: namespaceStatus.namespaceName,
    podName: makePodName("run", action.name),
    timeout,
    volumes,
    privileged,
    addCapabilities,
    dropCapabilities,
  })

  namespaceStatus = await getNamespaceStatus({ ctx: k8sCtx, log, provider: k8sCtx.provider })

  const detail = composeKubernetesCacheEntry({ result, namespaceStatus })

  if (action.getSpec("cacheResult")) {
    const runResultCache = getRunResultCache(ctx.gardenDirPath)
    await runResultCache.store({
      ctx,
      log,
      action,
      keyData: { namespaceUid: namespaceStatus.namespaceUid! },
      result: detail,
    })
  }

  return toActionStatus(detail)
}
