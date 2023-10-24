/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Log } from "../../../logger/log-entry.js"
import type { KubernetesPluginContext } from "../config.js"
import { helmIngressControllerReady, helmNginxInstall, helmNginxUninstall } from "./nginx-helm.js"
import { getGenericNginxHelmValues } from "./nginx-helm-generic.js"
import { getK3sNginxHelmValues } from "./nginx-helm-k3s.js"
import { microk8sNginxInstall, microk8sNginxStatus, microk8sNginxUninstall } from "./nginx-microk8s.js"
import { minikubeNginxInstall, minikubeNginxStatus, minikubeNginxUninstall } from "./nginx-minikube.js"
import { kindNginxInstall, kindNginxStatus, kindNginxUninstall } from "./nginx-kind.js"
import { getEphemeralNginxHelmValues } from "./nginx-helm-ephemeral.js"

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
  } else if (clusterType === "k3s" || clusterType === "generic" || clusterType === "ephemeral") {
    return await helmIngressControllerReady(ctx, log)
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
  } else if (clusterType === "ephemeral") {
    await helmNginxInstall(ctx, log, getEphemeralNginxHelmValues)
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
  } else if (clusterType === "k3s" || clusterType === "generic" || clusterType === "ephemeral") {
    await helmNginxUninstall(ctx, log)
  } else {
    return clusterType satisfies never
  }
}
