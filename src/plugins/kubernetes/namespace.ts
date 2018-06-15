/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginContext } from "../../plugin-context"
import {
  coreApi,
} from "./api"
import { KubernetesProvider } from "./kubernetes"
import {
  GARDEN_SYSTEM_NAMESPACE,
  isSystemGarden,
} from "./system"
import { name as providerName } from "./kubernetes"
import { AuthenticationError } from "../../exceptions"

export async function createNamespace(context: string, namespace: string) {
  // TODO: the types for all the create functions in the library are currently broken
  await coreApi(context).createNamespace(<any>{
    apiVersion: "v1",
    kind: "Namespace",
    metadata: {
      name: namespace,
      annotations: {
        "garden.io/generated": "true",
      },
    },
  })
}

export async function getAppNamespace(ctx: PluginContext, provider: KubernetesProvider) {
  let namespace

  if (isSystemGarden(provider)) {
    namespace = GARDEN_SYSTEM_NAMESPACE
  } else {
    const localConfig = await ctx.localConfigStore.get()
    const k8sConfig = localConfig.kubernetes || {}
    let { username, ["previous-usernames"]: previousUsernames } = k8sConfig

    if (!username) {
      username = provider.config.defaultUsername
    }

    if (!username) {
      throw new AuthenticationError(
        `User not logged into provider ${providerName}. Please specify defaultUsername in provider ` +
        `config or run garden login.`,
        { previousUsernames, provider: providerName },
      )
    }

    namespace = `garden--${username}--${ctx.projectName}`
  }

  return namespace
}

export function getMetadataNamespace(ctx: PluginContext, provider: KubernetesProvider) {
  if (isSystemGarden(provider)) {
    return GARDEN_SYSTEM_NAMESPACE + "--metadata"
  }

  const env = ctx.getEnvironment()
  return `garden-metadata--${ctx.projectName}--${env.namespace}`
}

export async function getAllGardenNamespaces(context: string): Promise<string[]> {
  const allNamespaces = await coreApi(context).listNamespace()
  return allNamespaces.body.items
    .map(n => n.metadata.name)
    .filter(n => n.startsWith("garden--"))
}
