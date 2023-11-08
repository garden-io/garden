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
import { checkResourceStatus, waitForResources } from "../status/status.js"
import { KubeApi } from "../api.js"
import { GardenIngressController } from "./ingress-controller.js"

const HELM_INGRESS_NGINX_REPO = "https://kubernetes.github.io/ingress-nginx"
const HELM_INGRESS_NGINX_VERSION = "4.0.13"
const HELM_INGRESS_NGINX_CHART = "ingress-nginx"
const HELM_INGRESS_NGINX_RELEASE_NAME = "garden-nginx"
const HELM_INGRESS_NGINX_DEPLOYMENT_TIMEOUT = "300s"

type _HelmValue = number | string | boolean | object | null | undefined

export abstract class HelmGardenIngressController implements GardenIngressController {
  install(ctx: KubernetesPluginContext, log: Log): Promise<void> {
    return helmNginxInstall(ctx, log, this.helmValuesGetter())
  }

  ready(ctx: KubernetesPluginContext, log: Log): Promise<boolean> {
    return helmIngressControllerReady(ctx, log, this.helmValuesGetter())
  }

  uninstall(ctx: KubernetesPluginContext, log: Log): Promise<void> {
    return helmNginxUninstall(ctx, log, this.helmValuesGetter())
  }

  abstract helmValuesGetter(): NginxHelmValuesGetter
}

interface NginxHelmValues {
  name: string
  controller: {
    kind: string
    // change this if necessary to support more update strategies
    updateStrategy: {
      type: "RollingUpdate"
      rollingUpdate: {
        maxUnavailable: number
      }
    }
    extraArgs: {
      [key: string]: string
    }
    minReadySeconds: number
    tolerations: SystemVars["system-tolerations"]
    nodeSelector: SystemVars["system-node-selector"]
    admissionWebhooks: {
      enabled: boolean
    }
    ingressClassResource: {
      name: string
      enabled: boolean
      default: boolean
    }
    replicaCount?: number
    [key: string]: _HelmValue
  }
  defaultBackend: {
    enabled: boolean
  }

  [key: string]: _HelmValue
}

export type NginxHelmValuesGetter = (systemVars: SystemVars) => NginxHelmValues

function getNginxHelmMainResource(values: NginxHelmValues) {
  return {
    apiVersion: "apps/v1",
    kind: values.controller.kind,
    metadata: {
      name: "garden-nginx-ingress-nginx-controller",
    },
  }
}

async function helmIngressControllerReady(
  ctx: KubernetesPluginContext,
  log: Log,
  nginxHelmValuesGetter: NginxHelmValuesGetter
) {
  const nginxStatus = await helmNginxStatus(ctx, log, nginxHelmValuesGetter)
  const backendStatus = await defaultBackendStatus(ctx, log)

  return nginxStatus === "ready" && backendStatus === "ready"
}

async function helmNginxStatus(
  ctx: KubernetesPluginContext,
  log: Log,
  nginxHelmValuesGetter: NginxHelmValuesGetter
): Promise<DeployState> {
  const provider = ctx.provider
  const config = provider.config
  const api = await KubeApi.factory(log, ctx, provider)
  const systemVars: SystemVars = getKubernetesSystemVariables(config)
  const values = nginxHelmValuesGetter(systemVars)

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
    const releaseStatus = statusRes.info?.status || "unknown"

    if (releaseStatus !== "deployed") {
      log.debug(chalk.yellow(`Helm release status for ${HELM_INGRESS_NGINX_RELEASE_NAME}: ${releaseStatus}`))
      return helmStatusMap[releaseStatus] || "unknown"
    }

    // we check that the deployment or daemonset is ready because the status of the helm release
    // can be "deployed" even if the deployed resource is not ready.
    const nginxHelmMainResource = getNginxHelmMainResource(values)
    const deploymentStatus = await checkResourceStatus({ api, namespace, manifest: nginxHelmMainResource, log })
    return deploymentStatus.state
  } catch (error) {
    log.debug(chalk.yellow(`Helm release ${HELM_INGRESS_NGINX_RELEASE_NAME} missing.`))
    return "missing"
  }
}

async function helmNginxInstall(ctx: KubernetesPluginContext, log: Log, nginxHelmValuesGetter: NginxHelmValuesGetter) {
  const ingressControllerReady = await helmIngressControllerReady(ctx, log, nginxHelmValuesGetter)
  if (ingressControllerReady) {
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

  const args = [
    "upgrade",
    "--install",
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

  const nginxHelmMainResource = getNginxHelmMainResource(values)
  await waitForResources({
    // setting the action name to providers is necessary to display the logs in provider-section
    actionName: "providers",
    namespace,
    ctx,
    provider,
    resources: [nginxHelmMainResource],
    log,
    timeoutSec: 60,
  })

  log.success(`nginx successfully installed in ${namespace} namespace`)
}

async function helmNginxUninstall(
  ctx: KubernetesPluginContext,
  log: Log,
  nginxHelmValuesGetter: NginxHelmValuesGetter
) {
  const status = await helmNginxStatus(ctx, log, nginxHelmValuesGetter)
  if (status === "missing") {
    return
  }

  const provider = ctx.provider
  const config = provider.config
  const namespace = config.gardenSystemNamespace

  await helm({ ctx, namespace, log, args: ["uninstall", HELM_INGRESS_NGINX_RELEASE_NAME], emitLogEvents: false })
  await defaultBackendUninstall(ctx, log)
}
