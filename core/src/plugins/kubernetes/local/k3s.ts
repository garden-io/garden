/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Log } from "../../../logger/log-entry.js"
import type { KubernetesProvider } from "../config.js"
import { KubeApi } from "../api.js"
import type { KubernetesResource } from "../types.js"
import type { PluginContext } from "../../../plugin-context.js"

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
