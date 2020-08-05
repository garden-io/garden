/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "url"
import { getPortForward } from "../port-forward"
import { CLUSTER_REGISTRY_DEPLOYMENT_NAME, CLUSTER_REGISTRY_PORT } from "../constants"
import { LogEntry } from "../../../logger/log-entry"
import { KubernetesPluginContext } from "../config"
import { getSystemNamespace } from "../namespace"
import { got, GotOptions } from "../../../util/http"

export async function queryRegistry(ctx: KubernetesPluginContext, log: LogEntry, path: string, opts?: GotOptions) {
  const registryFwd = await getRegistryPortForward(ctx, log)
  const baseUrl = `http://localhost:${registryFwd.localPort}/v2/`
  const url = resolve(baseUrl, path)

  return got(url, opts)
}

export async function getRegistryPortForward(ctx: KubernetesPluginContext, log: LogEntry) {
  const systemNamespace = await getSystemNamespace(ctx.provider, log)

  return getPortForward({
    ctx,
    log,
    namespace: systemNamespace,
    targetResource: `Deployment/${CLUSTER_REGISTRY_DEPLOYMENT_NAME}`,
    port: CLUSTER_REGISTRY_PORT,
  })
}
