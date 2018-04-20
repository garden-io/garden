/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginContext } from "../../plugin-context"
import { Environment } from "../../types/common"
import {
  apiGetOrNull,
  coreApi,
} from "./api"
import {
  GARDEN_SYSTEM_NAMESPACE,
  isSystemGarden,
} from "./system"

export async function namespaceReady(context: string, namespace: string) {
  /**
   * This is an issue with kubernetes-client where it fetches all namespaces instead of the requested one.
   * Is fixed in v4.0.0. See https://github.com/godaddy/kubernetes-client/issues/187 and
   * https://github.com/godaddy/kubernetes-client/pull/190
   */
  const allNamespaces = await apiGetOrNull(coreApi(context).namespaces, namespace)
  const ns = allNamespaces.items.find(n => n.metadata.name === namespace)
  return ns && ns.status.phase === "Active"
}

export async function createNamespace(context: string, namespace: string) {
  await coreApi(context).namespaces.post({
    body: {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: {
        name: namespace,
        annotations: {
          "garden.io/generated": "true",
        },
      },
    },
  })
}

export function getAppNamespace(ctx: PluginContext, env: Environment) {
  if (isSystemGarden(ctx)) {
    return GARDEN_SYSTEM_NAMESPACE
  }

  const currentEnv = env || ctx.getEnvironment()

  return `garden--${ctx.projectName}--${currentEnv.namespace}`
}

export function getMetadataNamespace(ctx: PluginContext) {
  if (isSystemGarden(ctx)) {
    return GARDEN_SYSTEM_NAMESPACE + "--metadata"
  }

  const env = ctx.getEnvironment()
  return `garden-metadata--${ctx.projectName}--${env.namespace}`
}
