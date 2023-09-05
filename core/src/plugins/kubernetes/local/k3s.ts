/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Log } from "../../../logger/log-entry"
import { KubernetesProvider } from "../config"
import { KubeApi } from "../api"
import { KubernetesResource } from "../types"
import { PluginContext } from "../../../plugin-context"

export async function isK3sFamilyCluster(ctx: PluginContext, provider: KubernetesProvider, log: Log): Promise<boolean> {
  return await isK3sFamilyClusterContext(ctx, provider, log)
}

async function isK3sFamilyClusterContext(ctx: PluginContext, provider: KubernetesProvider, log: Log): Promise<boolean> {
  const kubeApi = await KubeApi.factory(log, ctx, provider)

  const manifest: KubernetesResource = {
    apiVersion: "apiextensions.k8s.io/v1",
    kind: "CustomResourceDefinition",
    metadata: {
      name: "addons.k3s.cattle.io",
    },
  }
  try {
    await kubeApi.readBySpec({ namespace: "kube-system", manifest, log })
    return true
  } catch (err) {
    log.debug(`An attempt to get k3s addons crd failed with ${err}`)
  }

  return false
}
