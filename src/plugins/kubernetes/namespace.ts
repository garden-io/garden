/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginContext } from "../../plugin-context"
import {
  apiGetOrNull,
  coreApi,
} from "./api"
import { KubernetesProvider } from "./index"
import {
  GARDEN_SYSTEM_NAMESPACE,
  isSystemGarden,
} from "./system"
import { name as providerName } from "./index"
import { AuthenticationError } from "../../exceptions"

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

export async function getAppNamespace(ctx: PluginContext, provider: KubernetesProvider) {
  if (isSystemGarden(provider)) {
    return GARDEN_SYSTEM_NAMESPACE
  }

  const localConfig = await ctx.localConfigStore.get()
  const k8sConfig = localConfig.kubernetes || {}
  const { username, ["previous-usernames"]: previousUsernames } = k8sConfig

  if (!username) {
    throw new AuthenticationError(
      `User not logged into provider ${providerName}. Please run garden login.`,
      { previousUsernames, provider: providerName },
    )
  }

  return `garden--${username}--${ctx.projectName}`
}

export function getMetadataNamespace(ctx: PluginContext, provider: KubernetesProvider) {
  if (isSystemGarden(provider)) {
    return GARDEN_SYSTEM_NAMESPACE + "--metadata"
  }

  const env = ctx.getEnvironment()
  return `garden-metadata--${ctx.projectName}--${env.namespace}`
}

export async function getAllAppNamespaces(context: string): Promise<string[]> {
  const allNamespaces = await coreApi(context).namespaces.get()
  return allNamespaces.items
    .map(n => n.metadata.name)
    .filter(n => n.startsWith("garden--"))
}
