/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Log } from "../../../logger/log-entry.js"
import type { DeployState } from "../../../types/service.js"
import type { KubernetesPluginContext } from "../config.js"
import { helm } from "../helm/helm-cli.js"
import { helmStatusMap } from "../helm/status.js"
import { getKubernetesSystemVariables } from "../init.js"
import type { SystemVars } from "../init.js"
import { GardenDefaultBackend } from "./default-backend.js"
import { checkResourceStatus, waitForResources } from "../status/status.js"
import { KubeApi } from "../api.js"

import { GardenIngressComponent } from "./ingress-controller-base.js"
import { styles } from "../../../logger/styles.js"

const HELM_INGRESS_NGINX_REPO = "https://kubernetes.github.io/ingress-nginx"
const HELM_INGRESS_NGINX_VERSION = "4.12.1"
const HELM_INGRESS_NGINX_CHART = "ingress-nginx"
const HELM_INGRESS_NGINX_RELEASE_NAME = "garden-nginx"
const HELM_INGRESS_NGINX_DEPLOYMENT_TIMEOUT = "300s"

type _HelmValue = number | string | boolean | object | null | undefined

export abstract class HelmGardenIngressController extends GardenIngressComponent {
  private readonly defaultBackend = new GardenDefaultBackend()

  override async ensure(ctx: KubernetesPluginContext, log: Log): Promise<void> {
    const ingressControllerReady = await this.ready(ctx, log)
    if (ingressControllerReady) {
      return
    }

    const provider = ctx.provider
    const config = provider.config
    const namespace = config.gardenSystemNamespace
    const systemVars: SystemVars = getKubernetesSystemVariables(config)
    const values = this.getNginxHelmValues(systemVars)

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

    log.info(`Installing ${styles.highlight("nginx")} in ${styles.highlight(namespace)} namespace...`)
    await this.defaultBackend.ensure(ctx, log)
    await helm({ ctx, namespace, log, args, emitLogEvents: false })

    const nginxHelmMainResource = getNginxHelmMainResource(values)
    await waitForResources({
      // setting the action name to providers is necessary to display the logs in provider-section
      logContext: "providers",
      namespace,
      waitForJobs: false,
      ctx,
      provider,
      resources: [nginxHelmMainResource],
      log,
      timeoutSec: 60,
    })

    log.info(styles.success(`nginx successfully installed in ${namespace} namespace`))
  }

  override async getStatus(ctx: KubernetesPluginContext, log: Log): Promise<DeployState> {
    const provider = ctx.provider
    const config = provider.config
    const api = await KubeApi.factory(log, ctx, provider)
    const systemVars: SystemVars = getKubernetesSystemVariables(config)
    const values = this.getNginxHelmValues(systemVars)

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
        log.debug(`Helm release status for ${HELM_INGRESS_NGINX_RELEASE_NAME}: ${releaseStatus}`)
        return helmStatusMap[releaseStatus] || "unknown"
      }

      // we check that the deployment or daemonset is ready because the status of the helm release
      // can be "deployed" even if the deployed resource is not ready.
      const nginxHelmMainResource = getNginxHelmMainResource(values)
      const deploymentStatus = await checkResourceStatus({
        api,
        namespace,
        waitForJobs: false,
        manifest: nginxHelmMainResource,
        log,
      })
      return deploymentStatus.state
    } catch (error) {
      log.debug(`Helm release ${HELM_INGRESS_NGINX_RELEASE_NAME} missing.`)
      return "missing"
    }
  }

  override async ready(ctx: KubernetesPluginContext, log: Log): Promise<boolean> {
    const nginxStatus = await this.getStatus(ctx, log)
    const backendStatus = await this.defaultBackend.getStatus(ctx, log)

    return nginxStatus === "ready" && backendStatus === "ready"
  }

  override async uninstall(ctx: KubernetesPluginContext, log: Log): Promise<void> {
    const status = await this.getStatus(ctx, log)
    if (status === "missing") {
      return
    }

    const provider = ctx.provider
    const config = provider.config
    const namespace = config.gardenSystemNamespace

    await helm({ ctx, namespace, log, args: ["uninstall", HELM_INGRESS_NGINX_RELEASE_NAME], emitLogEvents: false })
    await this.defaultBackend.uninstall(ctx, log)
  }

  abstract getNginxHelmValues(systemVars: SystemVars): NginxHelmValues
}

export interface NginxHelmValues {
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

function getNginxHelmMainResource(values: NginxHelmValues) {
  return {
    apiVersion: "apps/v1",
    kind: values.controller.kind,
    metadata: {
      name: "garden-nginx-ingress-nginx-controller",
    },
  }
}
