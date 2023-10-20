/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Log } from "../../../logger/log-entry.js"
import type { KubernetesPluginContext } from "../config.js"
import { KubeApi } from "../api.js"
import { kindNginxInstall, kindNginxStatus, kindNginxUninstall } from "../local/kind.js"
import { microk8sNginxInstall, microk8sNginxStatus, microk8sNginxUninstall } from "../local/microk8s.js"
import { apply } from "../kubectl.js"
import { minikubeNginxInstall, minikubeNginxStatus, minikubeNginxUninstall } from "../local/minikube.js"
import { defaultBackendStatus } from "./default-backend.js"
import { getGenericNginxHelmValues } from "./nginx-helm-generic.js"
import { helmNginxInstall, helmNginxStatus, helmNginxUninstall } from "./nginx-helm.js"
import { getK3sNginxHelmValues } from "./nginx-helm-k3s.js"

export async function ingressControllerReady(ctx: KubernetesPluginContext, log: Log): Promise<boolean> {
  const clusterType = ctx.provider.config.clusterType
  if (clusterType === undefined) {
    return false
  }

  if (clusterType === "kind") {
    return (await kindNginxStatus(ctx, log)) === "ready"
  } else if (clusterType === "microk8s") {
    return (await microk8sNginxStatus(log)) === "ready"
  } else if (clusterType === "minikube") {
    return (await minikubeNginxStatus(log)) === "ready"
  } else if (clusterType === "k3s" || clusterType === "generic") {
    const nginxStatus = await helmNginxStatus(ctx, log)
    const backendStatus = await defaultBackendStatus(ctx, log)
    return nginxStatus === "ready" && backendStatus === "ready"
  } else {
    return clusterType satisfies never
  }
}

export async function ingressControllerInstall(ctx: KubernetesPluginContext, log: Log) {
  const clusterType = ctx.provider.config.clusterType
  if (clusterType === undefined) {
    return
  }

  if (clusterType === "kind") {
    await kindNginxInstall(ctx, log)
  } else if (clusterType === "microk8s") {
    await microk8sNginxInstall(ctx, log)
  } else if (clusterType === "minikube") {
    await minikubeNginxInstall(log)
  } else if (clusterType === "k3s") {
    await helmNginxInstall(ctx, log, getK3sNginxHelmValues)
  } else if (clusterType === "generic") {
    await helmNginxInstall(ctx, log, getGenericNginxHelmValues)
  } else {
    return clusterType satisfies never
  }
}

export async function ingressControllerUninstall(ctx: KubernetesPluginContext, log: Log) {
  const clusterType = ctx.provider.config.clusterType
  if (clusterType === undefined) {
    return
  }

  if (clusterType === "kind") {
    await kindNginxUninstall(ctx, log)
  } else if (clusterType === "microk8s") {
    await microk8sNginxUninstall(ctx, log)
  } else if (clusterType === "minikube") {
    await minikubeNginxUninstall(log)
  } else if (clusterType === "k3s" || clusterType === "generic") {
    await helmNginxUninstall(ctx, log)
  } else {
    return clusterType satisfies never
  }
}

export async function ingressClassCreate(ctx: KubernetesPluginContext, log: Log) {
  const provider = ctx.provider
  const config = provider.config

  const namespace = config.gardenSystemNamespace
  const api = await KubeApi.factory(log, ctx, provider)
  const ingressClass = {
    apiVersion: "networking.k8s.io/v1",
    kind: "IngressClass",
    metadata: {
      name: "nginx",
    },
    spec: {
      controller: "kubernetes.io/ingress-nginx",
    },
  }
  await apply({ log, ctx, api, provider, manifests: [ingressClass], namespace })
}
