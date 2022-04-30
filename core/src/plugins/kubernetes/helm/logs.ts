/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { streamK8sLogs } from "../logs"
import { KubernetesPluginContext } from "../config"
import { getReleaseName } from "./common"
import { getActionNamespace } from "../namespace"
import { getRenderedResources } from "./status"
import { sleep } from "../../../util/util"
import { DeployActionHandler } from "../../../plugin/action-types"
import { HelmDeployAction } from "./config"

export const getHelmDeployLogs: DeployActionHandler<"getLogs", HelmDeployAction> = async (params) => {
  const { ctx, action, log } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const releaseName = getReleaseName(action)
  const namespace = await getActionNamespace({
    ctx: k8sCtx,
    log,
    action,
    provider,
  })

  let resources: any[]
  if (params.follow) {
    // Then we wait indefinitely for the resources for this service to come up before passing them to
    // `streamK8sLogs` below. This will end in one of two ways:
    // 1. The resources are eventually found and passed to `streamK8sLogs`, which then takes care of streaming
    //    and retrying e.g. if the resources are deleted while logs are being streamed.
    // 2. The resources aren't found (e.g. because they were never deployed during the execution of a `garden logs`
    //    command which called `getServiceLogs` for this Helm service), and control flow here is simply
    //    terminated when the command exits.
    while (true) {
      try {
        resources = await getRenderedResources({ ctx: k8sCtx, action, releaseName, log })
        break
      } catch (err) {
        log.debug(`Failed getting deployed resources. Retrying...`)
        log.silly(err.message)
      }
      await sleep(2000)
    }
  } else {
    resources = await getRenderedResources({ ctx: k8sCtx, action, releaseName, log })
  }
  return streamK8sLogs({
    ...params,
    provider,
    defaultNamespace: namespace,
    resources: resources!,
    actionName: action.name,
  })
}
