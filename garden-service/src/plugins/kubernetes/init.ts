/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  PrepareEnvironmentParams,
  CleanupEnvironmentParams,
  GetEnvironmentStatusParams,
} from "../../types/plugin/params"
import { KubeApi } from "./api"
import { getAppNamespace, prepareNamespaces, deleteNamespaces } from "./namespace"
import { KubernetesProvider, KubernetesPluginContext } from "./kubernetes"
import { checkTillerStatus, installTiller } from "./helm/tiller"
import { isSystemGarden, prepareSystemServices, getSystemServicesStatus } from "./system"
import { PrimitiveMap } from "../../config/common"

interface GetK8sEnvironmentStatusParams extends GetEnvironmentStatusParams {
  variables?: PrimitiveMap
}

export async function getEnvironmentStatus({ ctx, log, variables }: GetK8sEnvironmentStatusParams) {
  await prepareNamespaces({ ctx, log })

  const provider = <KubernetesProvider>ctx.provider

  if (!isSystemGarden(provider)) {
    const k8sCtx = <KubernetesPluginContext>ctx
    const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)
    const serviceNames = k8sCtx.provider.config._systemServices
    return getSystemServicesStatus({
      ctx: k8sCtx,
      log,
      namespace,
      serviceNames,
      variables: variables || {},
    })
  } else {
    const ready = (await checkTillerStatus(ctx, provider, log)) === "ready"

    return {
      ready,
      dashboardPages: [],
      detail: {},
    }
  }
}

interface PrepareK8sEnvironmentParams extends PrepareEnvironmentParams {
  variables?: PrimitiveMap
}

export async function prepareEnvironment({ ctx, log, variables }: PrepareK8sEnvironmentParams) {
  const k8sCtx = <KubernetesPluginContext>ctx

  if (!isSystemGarden(k8sCtx.provider)) {
    const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)
    const serviceNames = k8sCtx.provider.config._systemServices
    await prepareSystemServices({
      ctx: k8sCtx,
      log,
      namespace,
      serviceNames,
      variables: variables || {},
    })
  } else {
    await installTiller(k8sCtx, k8sCtx.provider, log)
  }

  return {}
}

export async function cleanupEnvironment({ ctx, log }: CleanupEnvironmentParams) {
  const k8sCtx = <KubernetesPluginContext>ctx
  const api = await KubeApi.factory(log, k8sCtx.provider.config.context)
  const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)
  const entry = log.info({
    section: "kubernetes",
    msg: `Deleting namespace ${namespace} (this may take a while)`,
    status: "active",
  })

  await deleteNamespaces([namespace], api, entry)

  return {}
}
