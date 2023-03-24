/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DeployActionHandler } from "../../../plugin/action-types"
import { KubeApi } from "../api"
import { KubernetesPluginContext } from "../config"
import { getActionNamespace } from "../namespace"
import { startSyncs } from "../sync"
import { getManifests } from "./common"
import { KubernetesDeployAction } from "./config"

export const kubernetesStartSync: DeployActionHandler<"startSync", KubernetesDeployAction> = async (params) => {
  const { ctx, log, action } = params

  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const spec = action.getSpec()

  if (!spec.sync?.paths?.length) {
    return {}
  }

  const api = await KubeApi.factory(log, k8sCtx, provider)

  const namespace = await getActionNamespace({
    ctx: k8sCtx,
    log,
    action,
    provider,
  })

  const manifests = await getManifests({ ctx, api, log, action, defaultNamespace: namespace })

  await startSyncs({
    ctx: k8sCtx,
    log,
    action,
    actionDefaults: spec.sync.defaults || {},
    defaultTarget: spec.defaultTarget,
    basePath: action.basePath(),
    defaultNamespace: namespace,
    manifests,
    syncs: spec.sync.paths,
  })

  return {}
}
