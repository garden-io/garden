/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { Log } from "../../../logger/log-entry.js"
import { DeployState } from "../../../types/service.js"
import { KubernetesPluginContext } from "../config.js"
import { helm } from "../helm/helm-cli.js"
import { helmStatusMap } from "../helm/status.js"
import { getKubernetesSystemVariables, SystemVars } from "../init.js"
import { KubeApi } from "../api.js"
import { kindNginxInstall, kindNginxStatus, kindNginxUninstall } from "../local/kind.js"
import { microk8sNginxInstall, microk8sNginxStatus, microk8sNginxUninstall } from "../local/microk8s.js"
import { apply } from "../kubectl.js"
import { minikubeNginxInstall, minikubeNginxStatus, minikubeNginxUninstall } from "../local/minikube.js"
import { defaultBackendInstall, defaultBackendStatus, defaultBackendUninstall } from "./default-backend.js"
import { getK3sNginxHelmValues } from "../local/k3s.js"

const HELM_INGRESS_NGINX_REPO = "https://kubernetes.github.io/ingress-nginx"
const HELM_INGRESS_NGINX_VERSION = "4.0.13"
const HELM_INGRESS_NGINX_CHART = "ingress-nginx"
const HELM_INGRESS_NGINX_RELEASE_NAME = "garden-nginx"
const HELM_INGRESS_NGINX_DEPLOYMENT_TIMEOUT = "300s"

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
    await defaultBackendInstall(ctx, log)
  } else if (clusterType === "generic") {
    await helmNginxInstall(ctx, log, getGenericNginxHelmValues)
    await defaultBackendInstall(ctx, log)
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
    await defaultBackendUninstall(ctx, log)
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

export async function helmNginxStatus(ctx: KubernetesPluginContext, log: Log): Promise<DeployState> {
  const provider = ctx.provider
  const config = provider.config

  const namespace = config.gardenSystemNamespace
  try {
    const statusRes = JSON.parse(
      await helm({
        ctx,
        log,
        namespace,
        args: ["status", HELM_INGRESS_NGINX_RELEASE_NAME, "--output", "json"],
        // do not send JSON output to Garden Cloud or CLI verbose log
        emitLogEvents: false,
      })
    )
    const status = statusRes.info?.status || "unknown"
    log.debug(chalk.yellow(`Helm release status for ${HELM_INGRESS_NGINX_RELEASE_NAME}: ${status}`))
    return helmStatusMap[status] || "unknown"
  } catch (error) {
    log.debug(chalk.yellow(`Helm release ${HELM_INGRESS_NGINX_RELEASE_NAME} missing.`))
    return "missing"
  }
}

// TODO: consider using some specific return type here, maybe something from helm SDK?
export type NginxHelmValuesGetter = (systemVars: SystemVars) => object

export const getGenericNginxHelmValues: NginxHelmValuesGetter = (systemVars: SystemVars) => {
  return {
    name: "ingress-controller",
    controller: {
      kind: "DaemonSet",
      updateStrategy: {
        type: "RollingUpdate",
        rollingUpdate: {
          maxUnavailable: 1,
        },
      },
      extraArgs: {
        "default-backend-service": `${systemVars.namespace}/default-backend`,
      },
      hostPort: {
        enabled: true,
        ports: {
          http: systemVars["ingress-http-port"],
          https: systemVars["ingress-https-port"],
        },
      },
      minReadySeconds: 1,
      tolerations: systemVars["system-tolerations"],
      nodeSelector: systemVars["system-node-selector"],
      admissionWebhooks: {
        enabled: false,
      },
      ingressClassResource: {
        name: "nginx",
        enabled: true,
        default: true,
      },
    },
    defaultBackend: {
      enabled: false,
    },
  }
}

export async function helmNginxInstall(
  ctx: KubernetesPluginContext,
  log: Log,
  nginxHelmValuesGetter: NginxHelmValuesGetter
) {
  const provider = ctx.provider
  const config = provider.config

  const namespace = config.gardenSystemNamespace

  const nginxStatus = await helmNginxStatus(ctx, log)
  const backendStatus = await defaultBackendStatus(ctx, log)

  if (nginxStatus === "ready" && backendStatus === "ready") {
    return
  }

  const systemVars: SystemVars = getKubernetesSystemVariables(config)
  const values = nginxHelmValuesGetter(systemVars)

  const valueArgs: string[] = []
  for (const key in values) {
    if (values.hasOwnProperty(key)) {
      valueArgs.push(`${key}=${JSON.stringify(values[key])}`)
    }
  }

  // TODO-G2: update the nginx version
  const args = [
    "install",
    HELM_INGRESS_NGINX_RELEASE_NAME,
    HELM_INGRESS_NGINX_CHART,
    "--version",
    HELM_INGRESS_NGINX_VERSION,
    "--repo",
    HELM_INGRESS_NGINX_REPO,
    "--timeout",
    HELM_INGRESS_NGINX_DEPLOYMENT_TIMEOUT,
    "--set-json",
    `${valueArgs.join(",")}`,
  ]

  log.info(`Installing nginx in ${namespace} namespace...`)
  await defaultBackendInstall(ctx, log)
  await helm({ ctx, namespace, log, args, emitLogEvents: false })

  log.success(`nginx successfully installed in ${namespace} namespace`)
}

export async function helmNginxUninstall(ctx: KubernetesPluginContext, log: Log) {
  const provider = ctx.provider
  const config = provider.config

  const namespace = config.gardenSystemNamespace
  const status = await helmNginxStatus(ctx, log)

  await defaultBackendUninstall(ctx, log)
  if (status === "missing") {
    return
  }
  await helm({ ctx, namespace, log, args: ["uninstall", HELM_INGRESS_NGINX_RELEASE_NAME], emitLogEvents: false })
}
