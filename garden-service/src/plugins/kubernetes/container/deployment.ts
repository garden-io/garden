/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { V1Container, V1Affinity } from "@kubernetes/client-node"
import { Service } from "../../../types/service"
import { extend, find, keyBy, merge, set } from "lodash"
import { ContainerModule, ContainerService } from "../../container/config"
import { createIngressResources } from "./ingress"
import { createServiceResources } from "./service"
import { waitForResources, compareDeployedResources } from "../status/status"
import { apply, deleteObjectsBySelector } from "../kubectl"
import { getAppNamespace } from "../namespace"
import { PluginContext } from "../../../plugin-context"
import { KubeApi } from "../api"
import { KubernetesProvider, KubernetesPluginContext } from "../config"
import { configureHotReload } from "../hot-reload"
import { KubernetesWorkload } from "../types"
import { ConfigurationError } from "../../../exceptions"
import { getContainerServiceStatus, ContainerServiceStatus } from "./status"
import { containerHelpers } from "../../container/helpers"
import { LogEntry } from "../../../logger/log-entry"
import { DeployServiceParams } from "../../../types/plugin/service/deployService"
import { DeleteServiceParams } from "../../../types/plugin/service/deleteService"
import { millicpuToString, kilobytesToString, prepareEnvVars, workloadTypes } from "../util"
import { gardenAnnotationKey } from "../../../util/string"
import { RuntimeContext } from "../../../runtime-context"
import { resolve } from "path"

export const DEFAULT_CPU_REQUEST = "10m"
export const DEFAULT_MEMORY_REQUEST = "64Mi"
export const REVISION_HISTORY_LIMIT_PROD = 10
export const REVISION_HISTORY_LIMIT_DEFAULT = 3
export const DEFAULT_MINIMUM_REPLICAS = 1
export const PRODUCTION_MINIMUM_REPLICAS = 3

export async function deployContainerService(
  params: DeployServiceParams<ContainerModule>
): Promise<ContainerServiceStatus> {
  const { deploymentStrategy } = params.ctx.provider.config

  if (deploymentStrategy === "blue-green") {
    return deployContainerServiceBlueGreen(params)
  } else {
    return deployContainerServiceRolling(params)
  }
}

export async function deployContainerServiceRolling(
  params: DeployServiceParams<ContainerModule>
): Promise<ContainerServiceStatus> {
  const { ctx, service, runtimeContext, log, hotReload } = params
  const k8sCtx = <KubernetesPluginContext>ctx

  const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)

  const { manifests } = await createContainerManifests(k8sCtx, log, service, runtimeContext, hotReload)

  const provider = k8sCtx.provider
  const pruneSelector = gardenAnnotationKey("service") + "=" + service.name

  await apply({ log, provider, manifests, namespace, pruneSelector })

  await waitForResources({
    ctx: k8sCtx,
    provider: k8sCtx.provider,
    serviceName: service.name,
    resources: manifests,
    log,
  })

  return getContainerServiceStatus(params)
}

export async function deployContainerServiceBlueGreen(
  params: DeployServiceParams<ContainerModule>
): Promise<ContainerServiceStatus> {
  const { ctx, service, runtimeContext, log, hotReload } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)

  // Create all the resource manifests for the Garden service which will be deployed
  const { manifests } = await createContainerManifests(k8sCtx, log, service, runtimeContext, hotReload)

  const provider = k8sCtx.provider
  const api = await KubeApi.factory(log, provider)

  // Retrieve the k8s service referring to the Garden service which is already deployed
  const currentService = (await api.core.listNamespacedService(namespace)).items.filter(
    (s) => s.metadata.name === service.name
  )

  // If none it means this is the first deployment
  const isServiceAlreadyDeployed = currentService.length > 0

  if (!isServiceAlreadyDeployed) {
    // No service found, no need to execute a blue-green deployment
    // Just apply all the resources for the Garden service
    await apply({ log, provider, manifests, namespace })
    await waitForResources({
      ctx: k8sCtx,
      provider: k8sCtx.provider,
      serviceName: service.name,
      resources: manifests,
      log,
    })
  } else {
    // A k8s service matching the current Garden service exist in the cluster.
    // Proceeding with blue-green deployment
    const newVersion = service.module.version.versionString
    const versionKey = gardenAnnotationKey("version")

    // Remove Service manifest from generated resources
    const filteredManifests = manifests.filter((manifest) => manifest.kind !== "Service")

    // Apply new Deployment manifest (deploy the Green version)
    await apply({ log, provider, manifests: filteredManifests, namespace })
    await waitForResources({
      ctx: k8sCtx,
      provider: k8sCtx.provider,
      serviceName: `Deploy ${service.name}`,
      resources: filteredManifests,
      log,
    })

    // Patch for the current service to point to the new Deployment
    const servicePatchBody = {
      metadata: {
        annotations: {
          [versionKey]: newVersion,
        },
      },
      spec: {
        selector: {
          [versionKey]: newVersion,
        },
      },
    }

    // Update service (divert traffic from Blue to Green)

    // First patch the generated service to point to the new version of the deployment
    const serviceManifest = find(manifests, (manifest) => manifest.kind == "Service")
    const patchedServiceManifest = merge(serviceManifest, servicePatchBody)
    // Compare with the deployed Service
    const result = await compareDeployedResources(k8sCtx, api, namespace, [patchedServiceManifest], log)

    // If the result is outdated it means something in the Service definition itself changed
    // and we need to apply the whole Service manifest. Otherwise we just patch it.
    if (result.state === "outdated") {
      await apply({ log, provider, manifests: [patchedServiceManifest], namespace })
    } else {
      await api.core.patchNamespacedService(service.name, namespace, servicePatchBody)
    }

    await waitForResources({
      ctx: k8sCtx,
      provider: k8sCtx.provider,
      serviceName: `Update service`,
      resources: [serviceManifest],
      log,
    })

    // Clenup unused deployments:
    // as a feature we delete all the deployments which don't match any deployed Service.
    log.verbose(`Cleaning up old workloads`)
    await deleteObjectsBySelector({
      log,
      provider,
      namespace,
      objectTypes: workloadTypes,
      // Find workloads that match this service, but have a different version
      selector: `${gardenAnnotationKey("service")}=${service.name},` + `${versionKey}!=${newVersion}`,
    })
  }
  return getContainerServiceStatus(params)
}

export async function createContainerManifests(
  ctx: PluginContext,
  log: LogEntry,
  service: ContainerService,
  runtimeContext: RuntimeContext,
  enableHotReload: boolean
) {
  const k8sCtx = <KubernetesPluginContext>ctx
  const version = service.module.version
  const provider = k8sCtx.provider
  const { production } = ctx
  const namespace = await getAppNamespace(k8sCtx, log, provider)
  const api = await KubeApi.factory(log, provider)
  const ingresses = await createIngressResources(api, provider, namespace, service)
  const workload = await createWorkloadResource({
    provider,
    service,
    runtimeContext,
    namespace,
    enableHotReload,
    log,
    production,
  })
  const kubeservices = await createServiceResources(service, namespace)

  const manifests = [workload, ...kubeservices, ...ingresses]

  for (const obj of manifests) {
    set(obj, ["metadata", "labels", gardenAnnotationKey("module")], service.module.name)
    set(obj, ["metadata", "labels", gardenAnnotationKey("service")], service.name)
    set(obj, ["metadata", "annotations", gardenAnnotationKey("generated")], "true")
    set(obj, ["metadata", "annotations", gardenAnnotationKey("version")], version.versionString)
  }

  return { workload, manifests }
}

interface CreateDeploymentParams {
  provider: KubernetesProvider
  service: ContainerService
  runtimeContext: RuntimeContext
  namespace: string
  enableHotReload: boolean
  log: LogEntry
  production: boolean
}

export async function createWorkloadResource({
  provider,
  service,
  runtimeContext,
  namespace,
  enableHotReload,
  log,
  production,
}: CreateDeploymentParams): Promise<KubernetesWorkload> {
  const spec = service.spec
  let configuredReplicas = service.spec.replicas || DEFAULT_MINIMUM_REPLICAS
  const deployment: any = deploymentConfig(service, configuredReplicas, namespace)

  if (production && !service.spec.replicas) {
    configuredReplicas = PRODUCTION_MINIMUM_REPLICAS
  }

  if (enableHotReload && configuredReplicas > 1) {
    log.warn({
      msg: chalk.yellow(`Ignoring replicas config on container service ${service.name} while in hot-reload mode`),
      symbol: "warning",
    })
    configuredReplicas = 1
  }

  const env = prepareEnvVars({ ...runtimeContext.envVars, ...service.spec.env })

  // expose some metadata to the container
  env.push({
    name: "POD_NAME",
    valueFrom: { fieldRef: { fieldPath: "metadata.name" } },
  })

  env.push({
    name: "POD_NAMESPACE",
    valueFrom: { fieldRef: { fieldPath: "metadata.namespace" } },
  })

  env.push({
    name: "POD_IP",
    valueFrom: { fieldRef: { fieldPath: "status.podIP" } },
  })

  env.push({
    name: "POD_SERVICE_ACCOUNT",
    valueFrom: { fieldRef: { fieldPath: "spec.serviceAccountName" } },
  })

  const registryConfig = provider.config.deploymentRegistry
  const imageId = await containerHelpers.getDeploymentImageId(service.module, registryConfig)

  const container: V1Container = {
    name: service.name,
    image: imageId,
    env,
    ports: [],
    // TODO: make these configurable
    resources: {
      requests: {
        cpu: DEFAULT_CPU_REQUEST,
        memory: DEFAULT_MEMORY_REQUEST,
      },
      limits: {
        cpu: millicpuToString(spec.limits.cpu),
        memory: kilobytesToString(spec.limits.memory * 1024),
      },
    },
    imagePullPolicy: "IfNotPresent",
  }

  if (service.spec.command && service.spec.command.length > 0) {
    container.command = service.spec.command
  }

  if (service.spec.args && service.spec.args.length > 0) {
    container.args = service.spec.args
  }

  if (spec.healthCheck) {
    configureHealthCheck(container, spec)
  }

  if (spec.volumes && spec.volumes.length) {
    configureVolumes(service.module, deployment, container, spec)
  }

  const ports = spec.ports

  for (const port of ports) {
    container.ports!.push({
      name: port.name,
      protocol: port.protocol,
      containerPort: port.containerPort,
    })
  }

  if (spec.daemon) {
    // this runs a pod on every node
    deployment.kind = "DaemonSet"
    deployment.spec.updateStrategy = {
      type: "RollingUpdate",
    }

    for (const port of ports.filter((p) => p.hostPort)) {
      // For daemons we can expose host ports directly on the Pod, as opposed to only via the Service resource.
      // This allows us to choose any port.
      // TODO: validate that conflicting ports are not defined.
      container.ports!.push({
        protocol: port.protocol,
        containerPort: port.containerPort,
        hostPort: port.hostPort,
      })
    }
  } else {
    deployment.spec.replicas = configuredReplicas

    deployment.spec.strategy = {
      type: "RollingUpdate",
      rollingUpdate: {
        // This is optimized for fast re-deployment.
        maxUnavailable: 1,
        maxSurge: 1,
      },
    }
    deployment.spec.revisionHistoryLimit = production ? REVISION_HISTORY_LIMIT_PROD : REVISION_HISTORY_LIMIT_DEFAULT
  }

  if (provider.config.imagePullSecrets.length > 0) {
    // add any configured imagePullSecrets
    deployment.spec.template.spec.imagePullSecrets = provider.config.imagePullSecrets.map((s) => ({ name: s.name }))
  }

  // this is important for status checks to work correctly, because how K8s normalizes resources
  if (!container.ports!.length) {
    delete container.ports
  }

  deployment.spec.template.spec.containers = [container]

  if (production) {
    const affinity: V1Affinity = {
      podAntiAffinity: {
        preferredDuringSchedulingIgnoredDuringExecution: [
          {
            weight: 100,
            podAffinityTerm: {
              labelSelector: {
                matchExpressions: [
                  {
                    key: gardenAnnotationKey("module"),
                    operator: "In",
                    values: [service.module.name],
                  },
                  {
                    key: gardenAnnotationKey("service"),
                    operator: "In",
                    values: [service.name],
                  },
                ],
              },
              topologyKey: "kubernetes.io/hostname",
            },
          },
        ],
      },
    }

    deployment.spec.template.spec.affinity = affinity
  }

  if (enableHotReload) {
    const hotReloadSpec = service.module.spec.hotReload

    if (!hotReloadSpec) {
      throw new ConfigurationError(`Service ${service.name} is not configured for hot reloading.`, {})
    }

    configureHotReload({
      target: deployment,
      hotReloadSpec,
      hotReloadCommand: service.spec.hotReloadCommand,
      hotReloadArgs: service.spec.hotReloadArgs,
    })
  }

  if (!deployment.spec.template.spec.volumes.length) {
    // this is important for status checks to work correctly
    delete deployment.spec.template.spec.volumes
  }

  return deployment
}

function getDeploymentName(service: Service) {
  return `${service.name}-${service.module.version.versionString}`
}

function deploymentConfig(service: Service, configuredReplicas: number, namespace: string): object {
  const labels = {
    [gardenAnnotationKey("module")]: service.module.name,
    [gardenAnnotationKey("service")]: service.name,
    [gardenAnnotationKey("version")]: service.module.version.versionString,
  }

  let selector = {
    matchLabels: {
      [gardenAnnotationKey("service")]: service.name,
      [gardenAnnotationKey("version")]: service.module.version.versionString,
    },
  }

  // TODO: moar type-safety
  return {
    kind: "Deployment",
    apiVersion: "apps/v1",
    metadata: {
      name: getDeploymentName(service),
      annotations: {
        // we can use this to avoid overriding the replica count if it has been manually scaled
        "garden.io/configured.replicas": configuredReplicas.toString(),
      },
      namespace,
      labels,
    },
    spec: {
      selector,
      template: {
        metadata: {
          labels,
        },
        spec: {
          // TODO: set this for non-system pods
          // automountServiceAccountToken: false,  // this prevents the pod from accessing the kubernetes API
          containers: [],
          // TODO: make restartPolicy configurable
          restartPolicy: "Always",
          terminationGracePeriodSeconds: 5,
          dnsPolicy: "ClusterFirst",
          volumes: [],
        },
      },
    },
  }
}

function configureHealthCheck(container, spec): void {
  const readinessPeriodSeconds = 1
  const readinessFailureThreshold = 90

  container.readinessProbe = {
    initialDelaySeconds: 2,
    periodSeconds: readinessPeriodSeconds,
    timeoutSeconds: 3,
    successThreshold: 2,
    failureThreshold: readinessFailureThreshold,
  }

  /*
   * We wait for the effective failure duration (period * threshold) of the readiness probe before starting the
   * liveness probe.
   */
  container.livenessProbe = {
    initialDelaySeconds: readinessPeriodSeconds * readinessFailureThreshold,
    periodSeconds: 5,
    timeoutSeconds: 3,
    successThreshold: 1,
    failureThreshold: 3,
  }

  const portsByName = keyBy(spec.ports, "name")

  if (spec.healthCheck.httpGet) {
    const httpGet: any = extend({}, spec.healthCheck.httpGet)
    httpGet.port = portsByName[httpGet.port].containerPort

    container.readinessProbe.httpGet = httpGet
    container.livenessProbe.httpGet = httpGet
  } else if (spec.healthCheck.command) {
    container.readinessProbe.exec = { command: spec.healthCheck.command.map((s) => s.toString()) }
    container.livenessProbe.exec = container.readinessProbe.exec
  } else if (spec.healthCheck.tcpPort) {
    container.readinessProbe.tcpSocket = {
      port: portsByName[spec.healthCheck.tcpPort].containerPort,
    }
    container.livenessProbe.tcpSocket = container.readinessProbe.tcpSocket
  } else {
    throw new Error("Must specify type of health check when configuring health check.")
  }
}

function configureVolumes(module: ContainerModule, deployment, container, spec): void {
  const volumes: any[] = []
  const volumeMounts: any[] = []

  for (const volume of spec.volumes) {
    const volumeName = volume.name
    const volumeType = !!volume.hostPath ? "hostPath" : "emptyDir"

    if (!volumeName) {
      throw new Error("Must specify volume name")
    }

    if (volumeType === "emptyDir") {
      volumes.push({
        name: volumeName,
        emptyDir: {},
      })
      volumeMounts.push({
        name: volumeName,
        mountPath: volume.containerPath,
      })
    } else if (volumeType === "hostPath") {
      volumes.push({
        name: volumeName,
        hostPath: {
          path: resolve(module.path, volume.hostPath),
        },
      })
      volumeMounts.push({
        name: volumeName,
        mountPath: volume.containerPath,
      })
    } else {
      throw new Error("Unsupported volume type: " + volumeType)
    }
  }

  deployment.spec.template.spec.volumes = volumes
  container.volumeMounts = volumeMounts
}

/**
 * Removes leading slash, and ensures there's exactly one trailing slash.
 *
 * converts /src/foo into src/foo/
 */
export function rsyncTargetPath(path: string) {
  return path.replace(/^\/*/, "").replace(/\/*$/, "/")
}

export async function deleteService(params: DeleteServiceParams): Promise<ContainerServiceStatus> {
  const { ctx, log, service } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)
  const provider = k8sCtx.provider

  await deleteObjectsBySelector({
    log,
    provider,
    namespace,
    selector: `${gardenAnnotationKey("service")}=${service.name}`,
    objectTypes: ["deployment", "replicaset", "pod", "service", "ingress", "daemonset"],
    includeUninitialized: false,
  })

  return { state: "missing", detail: { remoteResources: [], workload: null } }
}
