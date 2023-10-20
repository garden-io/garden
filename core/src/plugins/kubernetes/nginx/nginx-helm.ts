/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import type { Log } from "../../../logger/log-entry.js"
import type { DeployState } from "../../../types/service.js"
import type { KubernetesPluginContext } from "../config.js"
import { helm } from "../helm/helm-cli.js"
import { helmStatusMap } from "../helm/status.js"
import { getKubernetesSystemVariables } from "../init.js"
import type { SystemVars } from "../init.js"
import { defaultBackendInstall, defaultBackendStatus, defaultBackendUninstall } from "./default-backend.js"

const HELM_INGRESS_NGINX_REPO = "https://kubernetes.github.io/ingress-nginx"
const HELM_INGRESS_NGINX_VERSION = "4.0.13"
const HELM_INGRESS_NGINX_CHART = "ingress-nginx"
const HELM_INGRESS_NGINX_RELEASE_NAME = "garden-nginx"
const HELM_INGRESS_NGINX_DEPLOYMENT_TIMEOUT = "300s"

// TODO: consider using some specific return type here, maybe something from helm SDK?
export type NginxHelmValuesGetter = (systemVars: SystemVars) => object

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

export async function helmNginxInstall(
  ctx: KubernetesPluginContext,
  log: Log,
  nginxHelmValuesGetter: NginxHelmValuesGetter
) {
  const nginxStatus = await helmNginxStatus(ctx, log)
  const backendStatus = await defaultBackendStatus(ctx, log)

  if (nginxStatus === "ready" && backendStatus === "ready") {
    return
  }

  const provider = ctx.provider
  const config = provider.config
  const namespace = config.gardenSystemNamespace
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
  // uninstall default-backend first
  await defaultBackendUninstall(ctx, log)

  const status = await helmNginxStatus(ctx, log)
  if (status === "missing") {
    return
  }

  const provider = ctx.provider
  const config = provider.config
  const namespace = config.gardenSystemNamespace

  await helm({ ctx, namespace, log, args: ["uninstall", HELM_INGRESS_NGINX_RELEASE_NAME], emitLogEvents: false })
}
