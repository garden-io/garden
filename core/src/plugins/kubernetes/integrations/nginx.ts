/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { Log } from "../../../logger/log-entry"
import { DeployState } from "../../../types/service"
import { KubernetesPluginContext } from "../config"
import { helm } from "../helm/helm-cli"
import { helmStatusMap } from "../helm/status"
import { getKubernetesSystemVariables, SystemVars } from "../init"
import { KubeApi } from "../api"
import { KubernetesDeployment, KubernetesService } from "../types"
import { checkResourceStatus, waitForResources } from "../status/status"

const HELM_INGRESS_NGINX_REPO = "https://kubernetes.github.io/ingress-nginx"
const HELM_INGRESS_NGINX_VERSION = "4.0.13"
const HELM_INGRESS_NGINX_CHART = "ingress-nginx"
const HELM_INGRESS_NGINX_RELEASE_NAME = "garden-nginx"
const HELM_INGRESS_NGINX_DEPLOYMENT_TIMEOUT = "300s"

export async function ingressControllerReady(ctx: KubernetesPluginContext, log: Log): Promise<boolean> {
  const nginxStatus = await helmNginxStatus(ctx, log)
  const backendStatus = await defaultBackendStatus(ctx, log)
  return nginxStatus === "ready" && backendStatus === "ready"
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
  nginxHelmValuesGetter: NginxHelmValuesGetter = getGenericNginxHelmValues
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

async function defaultBackendStatus(ctx: KubernetesPluginContext, log: Log): Promise<DeployState> {
  const provider = ctx.provider
  const config = provider.config
  const namespace = config.gardenSystemNamespace
  const api = await KubeApi.factory(log, ctx, provider)
  const { deployment } = defaultBackendGetManifests(ctx)

  const deploymentStatus = await checkResourceStatus({ api, namespace, manifest: deployment, log })
  log.debug(chalk.yellow(`Status of ingress controller default-backend: ${deploymentStatus}`))
  return deploymentStatus.state
}

function defaultBackendGetManifests(ctx: KubernetesPluginContext): {
  deployment: KubernetesDeployment
  service: KubernetesService
} {
  const provider = ctx.provider
  const config = provider.config
  const namespace = config.gardenSystemNamespace

  const deployment: KubernetesDeployment = {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: {
      labels: {
        app: "default-backend",
      },
      name: "default-backend",
      namespace,
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: {
          app: "default-backend",
        },
      },
      strategy: {
        rollingUpdate: {
          maxSurge: 1,
          maxUnavailable: 1,
        },
        type: "RollingUpdate",
      },
      template: {
        metadata: {
          labels: {
            app: "default-backend",
          },
        },
        spec: {
          containers: [
            {
              image:
                "gardendev/default-backend:v0.1@sha256:1b02920425eea569c6be53bb2e3d2c1182243212de229be375da7a93594498cf",
              imagePullPolicy: "IfNotPresent",
              name: "default-backend",
              ports: [
                {
                  containerPort: 80,
                  name: "http",
                  protocol: "TCP",
                },
              ],
              resources: {
                limits: {
                  cpu: "100m",
                  memory: "200Mi",
                },
                requests: {
                  cpu: "10m",
                  memory: "90Mi",
                },
              },
              securityContext: {
                allowPrivilegeEscalation: false,
              },
            },
          ],
        },
      },
    },
  }

  const service: KubernetesService = {
    apiVersion: "v1",
    kind: "Service",
    metadata: {
      labels: {
        app: "default-backend",
      },
      name: "default-backend",
      namespace,
    },
    spec: {
      type: "ClusterIP",
      ports: [
        {
          name: "http",
          port: 80,
          protocol: "TCP",
          targetPort: 80,
        },
      ],
      selector: {
        app: "default-backend",
      },
    },
  }
  return { deployment, service }
}

async function defaultBackendInstall(ctx: KubernetesPluginContext, log: Log) {
  const provider = ctx.provider
  const config = provider.config
  const namespace = config.gardenSystemNamespace
  const { deployment, service } = defaultBackendGetManifests(ctx)
  const status = await defaultBackendStatus(ctx, log)
  if (status === "ready") {
    return
  }

  const api = await KubeApi.factory(log, ctx, provider)
  await api.upsert({ kind: "Service", namespace, log, obj: service })
  await api.upsert({ kind: "Deployment", namespace, log, obj: deployment })
  await waitForResources({ namespace, ctx, provider, resources: [deployment], log, timeoutSec: 20 })
}

async function defaultBackendUninstall(ctx: KubernetesPluginContext, log: Log) {
  const provider = ctx.provider
  const config = provider.config
  const namespace = config.gardenSystemNamespace
  const { deployment, service } = defaultBackendGetManifests(ctx)
  const status = await defaultBackendStatus(ctx, log)
  if (status === "missing") {
    return
  }

  const api = await KubeApi.factory(log, ctx, provider)
  await api.deleteBySpec({ namespace, manifest: service, log })
  await api.deleteBySpec({ namespace, manifest: deployment, log })
}
