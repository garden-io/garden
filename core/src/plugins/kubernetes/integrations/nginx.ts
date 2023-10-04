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

const HELM_INGRESS_NGINX_REPO = "https://kubernetes.github.io/ingress-nginx"
const HELM_INGRESS_NGINX_VERSION = "4.0.13"
const HELM_INGRESS_NGINX_CHART = "ingress-nginx"
const HELM_INGRESS_NGINX_RELEASE_NAME = "garden-nginx"
const HELM_INGRESS_NGINX_DEPLOYMENT_TIMEOUT = "300s"

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
    log.warn(chalk.yellow(`Unable to get helm status for ${HELM_INGRESS_NGINX_RELEASE_NAME} release: ${error}`))
    return "unknown"
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
      enabled: true,
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

  const status = await helmNginxStatus(ctx, log)

  if (status === "ready") {
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

  await helm({ ctx, namespace, log, args, emitLogEvents: false })

  log.success(`nginx successfully installed in ${namespace} namespace`)
}

export async function helmNginxUninstall(ctx: KubernetesPluginContext, log: Log) {
  const provider = ctx.provider
  const config = provider.config

  const namespace = config.gardenSystemNamespace

  await helm({ ctx, namespace, log, args: ["uninstall", HELM_INGRESS_NGINX_RELEASE_NAME], emitLogEvents: false })
}
