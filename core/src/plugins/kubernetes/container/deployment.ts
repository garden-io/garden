/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { V1Container, V1Affinity, V1VolumeMount, V1PodSpec, V1Deployment, V1DaemonSet } from "@kubernetes/client-node"
import { Service } from "../../../types/service"
import { extend, find, keyBy, merge, set, omit } from "lodash"
import { ContainerModule, ContainerService, ContainerVolumeSpec, ContainerServiceConfig } from "../../container/config"
import { createIngressResources } from "./ingress"
import { createServiceResources } from "./service"
import { waitForResources, compareDeployedResources } from "../status/status"
import { apply, deleteObjectsBySelector } from "../kubectl"
import { getAppNamespace } from "../namespace"
import { PluginContext } from "../../../plugin-context"
import { KubeApi } from "../api"
import { KubernetesProvider, KubernetesPluginContext } from "../config"
import { KubernetesWorkload, KubernetesResource } from "../types"
import { ConfigurationError } from "../../../exceptions"
import { getContainerServiceStatus, ContainerServiceStatus } from "./status"
import { containerHelpers } from "../../container/helpers"
import { LogEntry } from "../../../logger/log-entry"
import { DeployServiceParams } from "../../../types/plugin/service/deployService"
import { DeleteServiceParams } from "../../../types/plugin/service/deleteService"
import { millicpuToString, kilobytesToString, prepareEnvVars, workloadTypes } from "../util"
import { gardenAnnotationKey, deline } from "../../../util/string"
import { RuntimeContext } from "../../../runtime-context"
import { resolve } from "path"
import { killPortForwards } from "../port-forward"
import { prepareImagePullSecrets } from "../secrets"
import { configureHotReload } from "../hot-reload/helpers"

export const DEFAULT_CPU_REQUEST = "10m"
export const DEFAULT_MEMORY_REQUEST = "90Mi" // This is the minimum in some clusters
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

  const { manifests } = await createContainerManifests({
    ctx: k8sCtx,
    log,
    service,
    runtimeContext,
    enableHotReload: hotReload,
    blueGreen: false,
  })

  const provider = k8sCtx.provider
  const pruneSelector = gardenAnnotationKey("service") + "=" + service.name

  await apply({ log, ctx, provider, manifests, namespace, pruneSelector })

  await waitForResources({
    namespace,
    ctx,
    provider: k8sCtx.provider,
    serviceName: service.name,
    resources: manifests,
    log,
  })

  const status = await getContainerServiceStatus(params)

  // Make sure port forwards work after redeployment
  killPortForwards(service, status.forwardablePorts || [], log)

  return status
}

export async function deployContainerServiceBlueGreen(
  params: DeployServiceParams<ContainerModule>
): Promise<ContainerServiceStatus> {
  const { ctx, service, runtimeContext, log, hotReload } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)

  // Create all the resource manifests for the Garden service which will be deployed
  const { manifests } = await createContainerManifests({
    ctx: k8sCtx,
    log,
    service,
    runtimeContext,
    enableHotReload: hotReload,
    blueGreen: true,
  })

  const provider = k8sCtx.provider
  const api = await KubeApi.factory(log, ctx, provider)

  // Retrieve the k8s service referring to the Garden service which is already deployed
  const currentService = (await api.core.listNamespacedService(namespace)).items.filter(
    (s) => s.metadata.name === service.name
  )

  // If none it means this is the first deployment
  const isServiceAlreadyDeployed = currentService.length > 0

  if (!isServiceAlreadyDeployed) {
    // No service found, no need to execute a blue-green deployment
    // Just apply all the resources for the Garden service
    await apply({ log, ctx, provider, manifests, namespace })
    await waitForResources({
      namespace,
      ctx,
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
    await apply({ log, ctx, provider, manifests: filteredManifests, namespace })
    await waitForResources({
      namespace,
      ctx,
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
    const serviceManifest = find(manifests, (manifest) => manifest.kind === "Service")
    const patchedServiceManifest = merge(serviceManifest, servicePatchBody)
    // Compare with the deployed Service
    const result = await compareDeployedResources(k8sCtx, api, namespace, [patchedServiceManifest], log)

    // If the result is outdated it means something in the Service definition itself changed
    // and we need to apply the whole Service manifest. Otherwise we just patch it.
    if (result.state === "outdated") {
      await apply({ log, ctx, provider, manifests: [patchedServiceManifest], namespace })
    } else {
      await api.core.patchNamespacedService(service.name, namespace, servicePatchBody)
    }

    await waitForResources({
      namespace,
      ctx,
      provider: k8sCtx.provider,
      serviceName: `Update service`,
      resources: [serviceManifest],
      log,
    })

    // Clenup unused deployments:
    // as a feature we delete all the deployments which don't match any deployed Service.
    log.verbose(`Cleaning up old workloads`)
    await deleteObjectsBySelector({
      ctx,
      log,
      provider,
      namespace,
      objectTypes: workloadTypes,
      // Find workloads that match this service, but have a different version
      selector: `${gardenAnnotationKey("service")}=${service.name},` + `${versionKey}!=${newVersion}`,
    })
  }

  const status = await getContainerServiceStatus(params)

  // Make sure port forwards work after redeployment
  killPortForwards(service, status.forwardablePorts || [], log)

  return status
}

export async function createContainerManifests({
  ctx,
  log,
  service,
  runtimeContext,
  enableHotReload,
  blueGreen,
}: {
  ctx: PluginContext
  log: LogEntry
  service: ContainerService
  runtimeContext: RuntimeContext
  enableHotReload: boolean
  blueGreen: boolean
}) {
  const k8sCtx = <KubernetesPluginContext>ctx
  const version = service.module.version
  const provider = k8sCtx.provider
  const { production } = ctx
  const namespace = await getAppNamespace(k8sCtx, log, provider)
  const api = await KubeApi.factory(log, ctx, provider)
  const ingresses = await createIngressResources(api, provider, namespace, service, log)
  const workload = await createWorkloadManifest({
    api,
    provider,
    service,
    runtimeContext,
    namespace,
    enableHotReload,
    log,
    production,
    blueGreen,
  })
  const kubeservices = await createServiceResources(service, namespace, blueGreen)

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
  api: KubeApi
  provider: KubernetesProvider
  service: ContainerService
  runtimeContext: RuntimeContext
  namespace: string
  enableHotReload: boolean
  log: LogEntry
  production: boolean
  blueGreen: boolean
}

export async function createWorkloadManifest({
  api,
  provider,
  service,
  runtimeContext,
  namespace,
  enableHotReload,
  log,
  production,
  blueGreen,
}: CreateDeploymentParams): Promise<KubernetesWorkload> {
  const spec = service.spec
  let configuredReplicas = service.spec.replicas || DEFAULT_MINIMUM_REPLICAS
  const workload = workloadConfig({ service, configuredReplicas, namespace, blueGreen })

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
    name: "POD_HOST_IP",
    valueFrom: { fieldRef: { fieldPath: "status.hostIP" } },
  })

  env.push({
    name: "POD_IP",
    valueFrom: { fieldRef: { fieldPath: "status.podIP" } },
  })

  env.push({
    name: "POD_NAME",
    valueFrom: { fieldRef: { fieldPath: "metadata.name" } },
  })

  env.push({
    name: "POD_NAMESPACE",
    valueFrom: { fieldRef: { fieldPath: "metadata.namespace" } },
  })

  env.push({
    name: "POD_NODE_NAME",
    valueFrom: { fieldRef: { fieldPath: "spec.nodeName" } },
  })

  env.push({
    name: "POD_SERVICE_ACCOUNT",
    valueFrom: { fieldRef: { fieldPath: "spec.serviceAccountName" } },
  })

  env.push({
    name: "POD_UID",
    valueFrom: { fieldRef: { fieldPath: "metadata.uid" } },
  })

  const registryConfig = provider.config.deploymentRegistry
  const imageId = containerHelpers.getDeploymentImageId(service.module, service.module.version, registryConfig)

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
    securityContext: {
      allowPrivilegeEscalation: false,
    },
  }

  workload.spec.template.spec!.containers = [container]

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
    configureVolumes(service.module, workload.spec.template.spec!, spec.volumes)
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
    const daemonSet = <V1DaemonSet>workload
    daemonSet.spec!.updateStrategy = {
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
    const deployment = <V1Deployment>workload
    deployment.spec!.replicas = configuredReplicas

    // Need the any cast because the library types are busted
    deployment.spec!.strategy = <any>{
      type: "RollingUpdate",
      rollingUpdate: {
        // This is optimized for fast re-deployment.
        maxUnavailable: 1,
        maxSurge: 1,
      },
    }
    workload.spec.revisionHistoryLimit = production ? REVISION_HISTORY_LIMIT_PROD : REVISION_HISTORY_LIMIT_DEFAULT
  }

  if (provider.config.imagePullSecrets.length > 0) {
    // add any configured imagePullSecrets
    workload.spec.template.spec!.imagePullSecrets = await prepareImagePullSecrets({ api, provider, namespace, log })
  }

  // this is important for status checks to work correctly, because how K8s normalizes resources
  if (!container.ports!.length) {
    delete container.ports
  }

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

    const securityContext = {
      runAsUser: 1000,
      runAsGroup: 3000,
      fsGroup: 2000,
    }

    workload.spec.template.spec!.affinity = affinity
    workload.spec.template.spec!.securityContext = securityContext
  }

  if (enableHotReload) {
    const hotReloadSpec = service.module.spec.hotReload

    if (!hotReloadSpec) {
      throw new ConfigurationError(`Service ${service.name} is not configured for hot reloading.`, {})
    }

    configureHotReload({
      target: workload,
      hotReloadSpec,
      hotReloadCommand: service.spec.hotReloadCommand,
      hotReloadArgs: service.spec.hotReloadArgs,
    })
  }

  if (!workload.spec.template.spec?.volumes?.length) {
    // this is important for status checks to work correctly
    delete workload.spec.template.spec?.volumes
  }

  return workload
}

function getDeploymentName(service: Service, blueGreen: boolean) {
  return blueGreen ? `${service.name}-${service.module.version.versionString}` : service.name
}

export function getDeploymentLabels(service: Service, blueGreen: boolean) {
  if (blueGreen) {
    return {
      [gardenAnnotationKey("module")]: service.module.name,
      [gardenAnnotationKey("service")]: service.name,
      [gardenAnnotationKey("version")]: service.module.version.versionString,
    }
  } else {
    return {
      [gardenAnnotationKey("module")]: service.module.name,
      [gardenAnnotationKey("service")]: service.name,
    }
  }
}

export function getDeploymentSelector(service: Service, blueGreen: boolean) {
  // Unfortunately we need this because matchLabels is immutable, and we had omitted the module annotation before
  // in the selector.
  return omit(getDeploymentLabels(service, blueGreen), gardenAnnotationKey("module"))
}

function workloadConfig({
  service,
  configuredReplicas,
  namespace,
  blueGreen,
}: {
  service: ContainerService
  configuredReplicas: number
  namespace: string
  blueGreen: boolean
}): KubernetesResource<V1Deployment | V1DaemonSet> {
  const labels = getDeploymentLabels(service, blueGreen)
  const selector = {
    matchLabels: getDeploymentSelector(service, blueGreen),
  }

  return {
    kind: service.spec.daemon ? "DaemonSet" : "Deployment",
    apiVersion: "apps/v1",
    metadata: {
      name: getDeploymentName(service, blueGreen),
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

function configureHealthCheck(container: V1Container, spec: ContainerServiceConfig["spec"]): void {
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

  if (spec.healthCheck?.httpGet) {
    const httpGet: any = extend({}, spec.healthCheck.httpGet)
    httpGet.port = portsByName[httpGet.port].containerPort

    container.readinessProbe.httpGet = httpGet
    container.livenessProbe.httpGet = httpGet
  } else if (spec.healthCheck?.command) {
    container.readinessProbe.exec = { command: spec.healthCheck.command.map((s) => s.toString()) }
    container.livenessProbe.exec = container.readinessProbe.exec
  } else if (spec.healthCheck?.tcpPort) {
    container.readinessProbe.tcpSocket = {
      // For some reason the field is an object type
      port: (portsByName[spec.healthCheck.tcpPort].containerPort as unknown) as object,
    }
    container.livenessProbe.tcpSocket = container.readinessProbe.tcpSocket
  } else {
    throw new Error("Must specify type of health check when configuring health check.")
  }
}

export function configureVolumes(
  module: ContainerModule,
  podSpec: V1PodSpec,
  volumeSpecs: ContainerVolumeSpec[]
): void {
  const volumes: any[] = []
  const volumeMounts: V1VolumeMount[] = []

  for (const volume of volumeSpecs) {
    const volumeName = volume.name

    if (!volumeName) {
      throw new Error("Must specify volume name")
    }

    volumeMounts.push({
      name: volumeName,
      mountPath: volume.containerPath,
    })

    if (volume.hostPath) {
      volumes.push({
        name: volumeName,
        hostPath: {
          path: resolve(module.path, volume.hostPath),
        },
      })
    } else if (volume.module) {
      // Make sure the module is a supported type
      const volumeModule = module.buildDependencies[volume.module]

      if (!volumeModule.compatibleTypes.includes("persistentvolumeclaim")) {
        throw new ConfigurationError(
          chalk.red(deline`Container module ${chalk.white(module.name)} specifies a unsupported module
          ${chalk.white(volumeModule.name)} for volume mount ${chalk.white(volumeName)}. Only persistentvolumeclaim
          modules are supported at this time.
          `),
          { volumeSpec: volume }
        )
      }

      volumes.push({
        name: volumeName,
        persistentVolumeClaim: {
          claimName: volume.module,
        },
      })
    } else {
      volumes.push({
        name: volumeName,
        emptyDir: {},
      })
    }
  }

  podSpec.volumes = volumes
  podSpec.containers[0].volumeMounts = volumeMounts
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
    ctx,
    log,
    provider,
    namespace,
    selector: `${gardenAnnotationKey("service")}=${service.name}`,
    objectTypes: ["deployment", "replicaset", "pod", "service", "ingress", "daemonset"],
    includeUninitialized: false,
  })

  return { state: "missing", detail: { remoteResources: [], workload: null } }
}
