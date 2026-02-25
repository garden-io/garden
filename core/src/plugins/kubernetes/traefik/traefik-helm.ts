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
import type { LocalKubernetesClusterType } from "../local/config.js"
import { helm } from "../helm/helm-cli.js"
import { helmStatusMap } from "../helm/status.js"
import { getKubernetesSystemVariables } from "../init.js"
import type { SystemVars } from "../init.js"
import { checkResourceStatus, waitForResources } from "../status/status.js"
import { KubeApi } from "../api.js"
import { temporaryWrite } from "tempy"
import { safeDumpYaml } from "../../../util/serialization.js"

import { GardenIngressComponent } from "../nginx/ingress-controller-base.js"
import { styles } from "../../../logger/styles.js"

const HELM_TRAEFIK_REPO = "https://traefik.github.io/charts"
const HELM_TRAEFIK_VERSION = "34.5.0"
const HELM_TRAEFIK_CHART = "traefik"
export const HELM_TRAEFIK_RELEASE_NAME = "garden-traefik"
const HELM_TRAEFIK_DEPLOYMENT_TIMEOUT = "300s"

type _HelmValue = number | string | boolean | object | null | undefined

export interface TraefikHelmValues {
  deployment: {
    kind: string
    replicas?: number
  }
  ingressClass: {
    name: string
    enabled: boolean
    isDefaultClass: boolean
  }
  providers: {
    kubernetesIngress: { enabled: boolean }
    kubernetesCRD: { enabled: boolean }
  }
  tolerations: SystemVars["system-tolerations"]
  nodeSelector: SystemVars["system-node-selector"]
  ports: {
    web: {
      port: number
      expose: { default: boolean }
      exposedPort: number
      hostPort?: number
    }
    websecure: {
      port: number
      expose: { default: boolean }
      exposedPort: number
      tls: { enabled: boolean }
      hostPort?: number
    }
  }
  service: { type: string }
  ingressRoute: { dashboard: { enabled: boolean } }
  [key: string]: _HelmValue
}

/**
 * Returns Traefik Helm values appropriate for the given cluster type.
 */
export function getTraefikHelmValues(
  clusterType: LocalKubernetesClusterType,
  systemVars: SystemVars
): TraefikHelmValues {
  const common = {
    ingressClass: { name: "traefik", enabled: true, isDefaultClass: true },
    providers: {
      kubernetesIngress: { enabled: true },
      kubernetesCRD: { enabled: false },
    },
    ingressRoute: { dashboard: { enabled: false } },
  }

  switch (clusterType) {
    // Kind runs K8s inside Docker containers. Traffic enters via Docker port mappings on the
    // node containers, so we need hostPort to bind to host ports 80/443. The "ingress-ready"
    // nodeSelector targets the specific node with port mappings. Control-plane tolerations are
    // required because single-node Kind clusters taint the only node as control-plane/master.
    case "kind":
      return {
        ...common,
        deployment: { kind: "Deployment", replicas: 1 },
        tolerations: [
          ...systemVars["system-tolerations"],
          { key: "node-role.kubernetes.io/master", operator: "Equal", effect: "NoSchedule" },
          { key: "node-role.kubernetes.io/control-plane", operator: "Equal", effect: "NoSchedule" },
        ],
        nodeSelector: {
          ...systemVars["system-node-selector"],
          "ingress-ready": "true",
          "kubernetes.io/os": "linux",
        },
        ports: {
          web: { port: 8000, expose: { default: true }, exposedPort: 80, hostPort: 80 },
          websecure: { port: 8443, expose: { default: true }, exposedPort: 443, tls: { enabled: true }, hostPort: 443 },
        },
        service: { type: "NodePort" },
      }

    // K3s ships with Klipper, a built-in service load balancer that handles port exposure for
    // LoadBalancer-type services. No hostPort needed — Klipper creates its own DaemonSet that
    // binds to node ports and forwards to the service.
    case "k3s":
      return {
        ...common,
        deployment: { kind: "Deployment", replicas: 1 },
        tolerations: systemVars["system-tolerations"],
        nodeSelector: systemVars["system-node-selector"],
        ports: {
          web: { port: 8000, expose: { default: true }, exposedPort: systemVars["ingress-http-port"] },
          websecure: {
            port: 8443,
            expose: { default: true },
            exposedPort: systemVars["ingress-https-port"],
            tls: { enabled: true },
          },
        },
        service: { type: "LoadBalancer" },
      }

    // Minikube runs as a single VM/container with its own IP. Services are accessed via
    // `minikube service` or `minikube tunnel`, so NodePort is the natural service type.
    // No hostPort needed — users access <minikube-ip>:<nodePort>.
    case "minikube":
      return {
        ...common,
        deployment: { kind: "Deployment", replicas: 1 },
        tolerations: systemVars["system-tolerations"],
        nodeSelector: systemVars["system-node-selector"],
        ports: {
          web: { port: 8000, expose: { default: true }, exposedPort: systemVars["ingress-http-port"] },
          websecure: {
            port: 8443,
            expose: { default: true },
            exposedPort: systemVars["ingress-https-port"],
            tls: { enabled: true },
          },
        },
        service: { type: "NodePort" },
      }

    // Microk8s can run multi-node and has no built-in LoadBalancer provider. DaemonSet ensures
    // a pod on every node; hostPort binds directly to node ports since there's no LB to route
    // traffic. ClusterIP service is sufficient because hostPort handles external access.
    case "microk8s":
      return {
        ...common,
        deployment: { kind: "DaemonSet" },
        tolerations: systemVars["system-tolerations"],
        nodeSelector: systemVars["system-node-selector"],
        ports: {
          web: {
            port: 8000,
            expose: { default: true },
            exposedPort: systemVars["ingress-http-port"],
            hostPort: systemVars["ingress-http-port"],
          },
          websecure: {
            port: 8443,
            expose: { default: true },
            exposedPort: systemVars["ingress-https-port"],
            tls: { enabled: true },
            hostPort: systemVars["ingress-https-port"],
          },
        },
        service: { type: "ClusterIP" },
      }

    // Catch-all for unrecognized local clusters (Docker Desktop, Colima, Rancher Desktop, etc.).
    // DaemonSet + hostPort is the safest default: it works regardless of whether the cluster
    // has a LoadBalancer provider or any special networking setup.
    case "generic":
      return {
        ...common,
        deployment: { kind: "DaemonSet" },
        tolerations: systemVars["system-tolerations"],
        nodeSelector: systemVars["system-node-selector"],
        ports: {
          web: {
            port: 8000,
            expose: { default: true },
            exposedPort: systemVars["ingress-http-port"],
            hostPort: systemVars["ingress-http-port"],
          },
          websecure: {
            port: 8443,
            expose: { default: true },
            exposedPort: systemVars["ingress-https-port"],
            tls: { enabled: true },
            hostPort: systemVars["ingress-https-port"],
          },
        },
        service: { type: "ClusterIP" },
      }

    default:
      return clusterType satisfies never
  }
}

export class HelmGardenTraefikController extends GardenIngressComponent {
  constructor(private readonly clusterType: LocalKubernetesClusterType) {
    super()
  }

  private getValues(ctx: KubernetesPluginContext): TraefikHelmValues {
    const systemVars = getKubernetesSystemVariables(ctx.provider.config)
    return getTraefikHelmValues(this.clusterType, systemVars)
  }

  override async ensure(ctx: KubernetesPluginContext, log: Log): Promise<void> {
    const provider = ctx.provider
    const namespace = provider.config.gardenSystemNamespace

    const ingressControllerReady = await this.ready(ctx, log)
    if (ingressControllerReady) {
      return
    }

    const values = this.getValues(ctx)
    const valuesPath = await temporaryWrite(safeDumpYaml(values))

    const args = [
      "upgrade",
      "--install",
      HELM_TRAEFIK_RELEASE_NAME,
      HELM_TRAEFIK_CHART,
      "--version",
      HELM_TRAEFIK_VERSION,
      "--repo",
      HELM_TRAEFIK_REPO,
      "--timeout",
      HELM_TRAEFIK_DEPLOYMENT_TIMEOUT,
      "--create-namespace",
      "--values",
      valuesPath,
    ]

    log.info(`Installing ${styles.highlight("Traefik")} in ${styles.highlight(namespace)} namespace...`)
    await helm({ ctx, namespace, log, args, emitLogEvents: false })

    const traefikHelmMainResource = getTraefikHelmMainResource(values)
    await waitForResources({
      // setting the action name to providers is necessary to display the logs in provider-section
      logContext: "providers",
      namespace,
      waitForJobs: false,
      ctx,
      provider,
      resources: [traefikHelmMainResource],
      log,
      timeoutSec: 300,
    })

    log.info(styles.success(`Traefik successfully installed in ${namespace} namespace`))
  }

  override async getStatus(ctx: KubernetesPluginContext, log: Log): Promise<DeployState> {
    const provider = ctx.provider
    const config = provider.config
    const api = await KubeApi.factory(log, ctx, provider)
    const values = this.getValues(ctx)

    const namespace = config.gardenSystemNamespace
    try {
      const statusRes = JSON.parse(
        await helm({
          ctx,
          log,
          namespace,
          args: ["status", HELM_TRAEFIK_RELEASE_NAME, "--output", "json"],
          // do not send JSON output to Garden Cloud or CLI verbose log
          emitLogEvents: false,
        })
      )
      const releaseStatus = statusRes.info?.status || "unknown"

      if (releaseStatus !== "deployed") {
        log.debug(`Helm release status for ${HELM_TRAEFIK_RELEASE_NAME}: ${releaseStatus}`)
        return helmStatusMap[releaseStatus] || "unknown"
      }

      // we check that the deployment or daemonset is ready because the status of the helm release
      // can be "deployed" even if the deployed resource is not ready.
      const traefikHelmMainResource = getTraefikHelmMainResource(values)
      const deploymentStatus = await checkResourceStatus({
        api,
        namespace,
        waitForJobs: false,
        manifest: traefikHelmMainResource,
        log,
      })
      return deploymentStatus.state
    } catch (error) {
      log.debug(`Helm release ${HELM_TRAEFIK_RELEASE_NAME} missing.`)
      return "missing"
    }
  }

  override async uninstall(ctx: KubernetesPluginContext, log: Log): Promise<void> {
    const status = await this.getStatus(ctx, log)
    if (status === "missing") {
      return
    }

    const provider = ctx.provider
    const config = provider.config
    const namespace = config.gardenSystemNamespace

    await helm({ ctx, namespace, log, args: ["uninstall", HELM_TRAEFIK_RELEASE_NAME], emitLogEvents: false })
  }
}

function getTraefikHelmMainResource(values: TraefikHelmValues) {
  return {
    apiVersion: "apps/v1",
    kind: values.deployment.kind,
    metadata: {
      name: HELM_TRAEFIK_RELEASE_NAME,
    },
  }
}
