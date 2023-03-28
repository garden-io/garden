/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DeployActionHandler } from "../../../plugin/action-types"
import { KubernetesPluginContext } from "../config"
import { getActionNamespace } from "../namespace"
import { startSyncs } from "../sync"
import { getReleaseName } from "./common"
import { HelmDeployAction } from "./config"
import { getRenderedResources } from "./status"

export const helmStartSync: DeployActionHandler<"startSync", HelmDeployAction> = async (params) => {
  const { ctx, log, action } = params

  const k8sCtx = <KubernetesPluginContext>ctx
  const spec = action.getSpec()

  if (!spec.sync?.paths?.length) {
    return {}
  }

  const releaseName = getReleaseName(action)

  const namespace = await getActionNamespace({
    ctx: k8sCtx,
    log,
    action,
    provider: k8sCtx.provider,
  })

  const resources = await getRenderedResources({ ctx: k8sCtx, action, releaseName, log })

  await startSyncs({
    ctx: k8sCtx,
    log,
    action,
    actionDefaults: spec.sync.defaults || {},
    defaultTarget: spec.defaultTarget,
    basePath: action.basePath(), // TODO-G2: double check if this holds up
    defaultNamespace: namespace,
    manifests: resources,
    syncs: spec.sync.paths,
  })

  return {}
}
