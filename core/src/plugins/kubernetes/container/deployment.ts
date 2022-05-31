/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { V1Affinity, V1Container, V1DaemonSet, V1Deployment, V1PodSpec, V1VolumeMount } from "@kubernetes/client-node"
import { GardenService } from "../../../types/service"
import { extend, find, keyBy, omit, set } from "lodash"
import { ContainerModule, ContainerService, ContainerServiceConfig, ContainerVolumeSpec } from "../../container/config"
import { createIngressResources } from "./ingress"
import { createServiceResources } from "./service"
import { compareDeployedResources, waitForResources } from "../status/status"
import { apply, deleteObjectsBySelector, KUBECTL_DEFAULT_TIMEOUT } from "../kubectl"
import { getAppNamespace, getAppNamespaceStatus } from "../namespace"
import { PluginContext } from "../../../plugin-context"
import { KubeApi } from "../api"
import { KubernetesPluginContext, KubernetesProvider } from "../config"
import { KubernetesResource, KubernetesWorkload } from "../types"
import { ConfigurationError } from "../../../exceptions"
import { ContainerServiceStatus, getContainerServiceStatus } from "./status"
import { LogEntry } from "../../../logger/log-entry"
import { DeployServiceParams } from "../../../types/plugin/service/deployService"
import { DeleteServiceParams } from "../../../types/plugin/service/deleteService"
import { prepareEnvVars, workloadTypes } from "../util"
import { deline, gardenAnnotationKey } from "../../../util/string"
import { RuntimeContext } from "../../../runtime-context"
import { resolve } from "path"
import { killPortForwards } from "../port-forward"
import { prepareSecrets } from "../secrets"
import { configureHotReload } from "../hot-reload/helpers"
import { configureDevMode, startDevModeSync } from "../dev-mode"
import { hotReloadableKinds, HotReloadableResource } from "../hot-reload/hot-reload"
import { getResourceRequirements, getSecurityContext } from "./util"
import { configureLocalMode, startServiceInLocalMode } from "../local-mode"

export const DEFAULT_CPU_REQUEST = "10m"
export const DEFAULT_MEMORY_REQUEST = "90Mi" // This is the minimum in some clusters
export const REVISION_HISTORY_LIMIT_PROD = 10
export const REVISION_HISTORY_LIMIT_DEFAULT = 3
export const DEFAULT_MINIMUM_REPLICAS = 1
export const PRODUCTION_MINIMUM_REPLICAS = 3

export async function deployContainerService(
  params: DeployServiceParams<ContainerModule>
): Promise<ContainerServiceStatus> {
  const { ctx, service, log, devMode, localMode } = params
  const deployWithDevMode = devMode && !!service.spec.devMode
  const { deploymentStrategy } = params.ctx.provider.config
  const k8sCtx = <KubernetesPluginContext>ctx
  const api = await KubeApi.factory(log, k8sCtx, k8sCtx.provider)

  if (deploymentStrategy === "blue-green") {
    await deployContainerServiceBlueGreen({ ...params, devMode: deployWithDevMode, api })
  } else {
    await deployContainerServiceRolling({ ...params, devMode: deployWithDevMode, api })
  }

  const status = await getContainerServiceStatus(params)

  // Make sure port forwards work after redeployment
  killPortForwards(service, status.forwardablePorts || [], log)

  if (devMode) {
    await startContainerDevSync({
      ctx: k8sCtx,
      log,
      status,
      service,
    })
  }

  if (localMode) {
    await startLocalMode({
      ctx: k8sCtx,
      log,
      status,
      service,
    })
  }

  return status
}

export async function startContainerDevSync({
  ctx,
  log,
  status,
  service,
}: {
  ctx: KubernetesPluginContext
  status: ContainerServiceStatus
  log: LogEntry
  service: ContainerService
}) {
  if (!service.spec.devMode) {
    return
  }

  log.info({
    section: service.name,
    msg: chalk.grey(`Starting dev mode syncing for the service "${service.name}"`),
  })

  const namespace = await getAppNamespace(ctx, log, ctx.provider)
  const target = status.detail.remoteResources.find((r) =>
    hotReloadableKinds.includes(r.kind)
  )! as HotReloadableResource

  await startDevModeSync({
    ctx,
    log,
    moduleRoot: service.module.path,
    namespace,
    target,
    spec: service.spec.devMode,
    serviceName: service.name,
  })
}

export async function startLocalMode({
  ctx,
  log,
  status,
  service,
}: {
  ctx: KubernetesPluginContext
  status: ContainerServiceStatus
  log: LogEntry
  service: ContainerService
}) {
  if (!service.spec.localMode) {
    return
  }

  log.warn({
    section: service.name,
    msg: chalk.grey(`Starting local mode for the service "${service.name}"`),
  })

  const namespace = await getAppNamespace(ctx, log, ctx.provider)
  const target = status.detail.remoteResources.find((r) =>
    hotReloadableKinds.includes(r.kind)
  )! as HotReloadableResource

  await startServiceInLocalMode({
    target,
    service,
    spec: service.spec.localMode,
    log,
    ctx,
    namespace,
  })
}

export async function deployContainerServiceRolling(params: DeployServiceParams<ContainerModule> & { api: KubeApi }) {
  const { ctx, api, service, runtimeContext, log, devMode, hotReload, localMode } = params
  const k8sCtx = <KubernetesPluginContext>ctx

  const namespaceStatus = await getAppNamespaceStatus(k8sCtx, log, k8sCtx.provider)
  const namespace = namespaceStatus.namespaceName

  const { manifests } = await createContainerManifests({
    ctx: k8sCtx,
    api,
    log,
    service,
    runtimeContext,
    enableDevMode: devMode,
    enableHotReload: hotReload,
    enableLocalMode: localMode,
    blueGreen: false,
  })

  const provider = k8sCtx.provider
  const pruneLabels = { [gardenAnnotationKey("service")]: service.name }

  await apply({ log, ctx, api, provider, manifests, namespace, pruneLabels })

  await waitForResources({
    namespace,
    ctx,
    provider,
    serviceName: service.name,
    resources: manifests,
    log,
    timeoutSec: service.spec.timeout || KUBECTL_DEFAULT_TIMEOUT,
  })
}

export async function deployContainerServiceBlueGreen(params: DeployServiceParams<ContainerModule> & { api: KubeApi }) {
  const { ctx, api, service, runtimeContext, log, devMode, hotReload, localMode } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const namespaceStatus = await getAppNamespaceStatus(k8sCtx, log, k8sCtx.provider)
  const namespace = namespaceStatus.namespaceName

  // Create all the resource manifests for the Garden service which will be deployed
  const { manifests } = await createContainerManifests({
    ctx: k8sCtx,
    api,
    log,
    service,
    runtimeContext,
    enableDevMode: devMode,
    enableHotReload: hotReload,
    enableLocalMode: localMode,
    blueGreen: true,
  })

  const provider = k8sCtx.provider

  // Retrieve the k8s service referring to the Garden service which is already deployed
  const currentService = (await api.core.listNamespacedService(namespace)).items.filter(
    (s) => s.metadata.name === service.name
  )

  // If none it means this is the first deployment
  const isServiceAlreadyDeployed = currentService.length > 0

  if (!isServiceAlreadyDeployed) {
    // No service found, no need to execute a blue-green deployment
    // Just apply all the resources for the Garden service
    await apply({ log, ctx, api, provider, manifests, namespace })
    await waitForResources({
      namespace,
      ctx,
      provider: k8sCtx.provider,
      serviceName: service.name,
      resources: manifests,
      log,
      timeoutSec: KUBECTL_DEFAULT_TIMEOUT,
    })
  } else {
    // A k8s service matching the current Garden service exist in the cluster.
    // Proceeding with blue-green deployment
    const newVersion = service.version
    const versionKey = gardenAnnotationKey("version")

    // Remove Service manifest from generated resources
    const filteredManifests = manifests.filter((manifest) => manifest.kind !== "Service")

    // Apply new Deployment manifest (deploy the Green version)
    await apply({ log, ctx, api, provider, manifests: filteredManifests, namespace })
    await waitForResources({
      namespace,
      ctx,
      provider: k8sCtx.provider,
      serviceName: `Deploy ${service.name}`,
      resources: filteredManifests,
      log,
      timeoutSec: KUBECTL_DEFAULT_TIMEOUT,
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
    const patchedServiceManifest = { ...serviceManifest, ...servicePatchBody }
    // Compare with the deployed Service
    const result = await compareDeployedResources(k8sCtx, api, namespace, [patchedServiceManifest], log)

    // If the result is outdated it means something in the Service definition itself changed
    // and we need to apply the whole Service manifest. Otherwise we just patch it.
    if (result.state === "outdated") {
      await apply({ log, ctx, api, provider, manifests: [patchedServiceManifest], namespace })
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
      timeoutSec: KUBECTL_DEFAULT_TIMEOUT,
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
}

export async function createContainerManifests({
  ctx,
  api,
  log,
  service,
  runtimeContext,
  enableDevMode,
  enableHotReload,
  enableLocalMode,
  blueGreen,
}: {
  ctx: PluginContext
  api: KubeApi
  log: LogEntry
  service: ContainerService
  runtimeContext: RuntimeContext
  enableDevMode: boolean
  enableHotReload: boolean
  enableLocalMode: boolean
  blueGreen: boolean
}) {
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const { production } = ctx
  const namespace = await getAppNamespace(k8sCtx, log, provider)
  const ingresses = await createIngressResources(api, provider, namespace, service, log)
  const workload = await createWorkloadManifest({
    api,
    provider,
    service,
    runtimeContext,
    namespace,
    enableDevMode,
    enableHotReload,
    enableLocalMode,
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
    set(obj, ["metadata", "annotations", gardenAnnotationKey("version")], service.version)
  }

  return { workload, manifests }
}

interface CreateDeploymentParams {
  api: KubeApi
  provider: KubernetesProvider
  service: ContainerService
  runtimeContext: RuntimeContext
  namespace: string
  enableDevMode: boolean
  enableHotReload: boolean
  enableLocalMode: boolean
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
  enableDevMode,
  enableHotReload,
  enableLocalMode,
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

  if (enableDevMode && configuredReplicas > 1) {
    log.warn({
      msg: chalk.gray(`Ignoring replicas config on container service ${service.name} while in dev mode`),
      symbol: "warning",
    })
    configuredReplicas = 1
  }

  if (enableHotReload && configuredReplicas > 1) {
    log.warn({
      msg: chalk.yellow(`Ignoring replicas config on container service ${service.name} while in hot-reload mode`),
      symbol: "warning",
    })
    configuredReplicas = 1
  }

  if (enableLocalMode && configuredReplicas > 1) {
    log.verbose({
      msg: chalk.yellow(`Ignoring replicas config on container service ${service.name} while in local mode`),
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

  const imageId = service.module.outputs["deployment-image-id"]

  const { cpu, memory, limits } = spec

  const container: V1Container = {
    name: service.name,
    image: imageId,
    env,
    ports: [],
    resources: getResourceRequirements({ cpu, memory }, limits),
    imagePullPolicy: "IfNotPresent",
    securityContext: {
      allowPrivilegeEscalation: spec.privileged || false,
      ...getSecurityContext(spec.privileged, spec.addCapabilities, spec.dropCapabilities),
    },
  }

  workload.spec.template.spec!.containers = [container]

  if (service.spec.command && service.spec.command.length > 0) {
    container.command = service.spec.command
  }

  if (service.spec.args && service.spec.args.length > 0) {
    container.args = service.spec.args
  }

  if (spec.tty) {
    container.tty = true
    container.stdin = true
  }

  if (spec.healthCheck) {
    let mode: HealthCheckMode
    if (enableHotReload || enableDevMode) {
      mode = "dev"
    } else if (enableLocalMode) {
      mode = "local"
    } else {
      mode = "normal"
    }
    configureHealthCheck(container, spec, mode)
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
    // add any configured imagePullSecrets.
    const imagePullSecrets = await prepareSecrets({ api, namespace, secrets: provider.config.imagePullSecrets, log })
    workload.spec.template.spec!.imagePullSecrets = imagePullSecrets
  }
  await prepareSecrets({ api, namespace, secrets: provider.config.copySecrets, log })

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

  const devModeSpec = service.spec.devMode

  if (enableDevMode && devModeSpec) {
    log.debug({ section: service.name, msg: chalk.gray(`-> Configuring in dev mode`) })

    configureDevMode({
      target: workload,
      spec: devModeSpec,
    })
  } else if (enableHotReload) {
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

  const localModeSpec = service.spec.localMode
  if (enableLocalMode && localModeSpec) {
    await configureLocalMode({
      target: workload,
      spec: localModeSpec,
      service,
      log,
    })
  }

  if (!workload.spec.template.spec?.volumes?.length) {
    // this is important for status checks to work correctly
    delete workload.spec.template.spec?.volumes
  }

  return workload
}

function getDeploymentName(service: GardenService, blueGreen: boolean) {
  return blueGreen ? `${service.name}-${service.version}` : service.name
}

export function getDeploymentLabels(service: GardenService, blueGreen: boolean) {
  if (blueGreen) {
    return {
      [gardenAnnotationKey("module")]: service.module.name,
      [gardenAnnotationKey("service")]: service.name,
      [gardenAnnotationKey("version")]: service.version,
    }
  } else {
    return {
      [gardenAnnotationKey("module")]: service.module.name,
      [gardenAnnotationKey("service")]: service.name,
    }
  }
}

export function getDeploymentSelector(service: GardenService, blueGreen: boolean) {
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
          // Note: We only have the one set of annotations for both Service and Pod resources. One intended for the
          // other will just be ignored since they don't overlap in any cases I could find with commonly used tools.
          annotations: service.spec.annotations,
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

type HealthCheckMode = "dev" | "local" | "normal"

function configureHealthCheck(
  container: V1Container,
  spec: ContainerServiceConfig["spec"],
  mode: HealthCheckMode
): void {
  const readinessPeriodSeconds = 1
  const readinessFailureThreshold = 90

  container.readinessProbe = {
    initialDelaySeconds: 2,
    periodSeconds: readinessPeriodSeconds,
    timeoutSeconds: spec.healthCheck?.readinessTimeoutSeconds || 3,
    successThreshold: 2,
    failureThreshold: readinessFailureThreshold,
  }

  // We wait for the effective failure duration (period * threshold) of the readiness probe before starting the
  // liveness probe.
  // We also increase the periodSeconds and failureThreshold when in hot reload mode. This is to prevent
  // K8s from restarting the pod when liveness probes fail during build or server restarts on a
  // hot reload event.
  container.livenessProbe = {
    initialDelaySeconds: readinessPeriodSeconds * readinessFailureThreshold,
    periodSeconds: mode === "dev" || mode === "local" ? 10 : 5,
    timeoutSeconds: spec.healthCheck?.livenessTimeoutSeconds || 3,
    successThreshold: 1,
    failureThreshold: mode === "dev" || mode === "local" ? 30 : 3,
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

  /*
   Both readiness and liveness probes do not make much sense for the services running in local mode.
   A user can completely control the lifecycle of a local service. Thus, these checks may be unwanted.

   The readiness probe can cause the failure of the local mode startup,
   because the local service has not been connected to the target cluster yet.

   The liveness probe can cause unnecessary re-deployment of the proxy container in the target cluster.
   Also, it can create unnecessary noisy traffic to the local service is running in the debugger.
   */
  if (mode === "local") {
    delete container.readinessProbe
    delete container.livenessProbe
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

      if (volumeModule.compatibleTypes.includes("persistentvolumeclaim")) {
        volumes.push({
          name: volumeName,
          persistentVolumeClaim: {
            claimName: volume.module,
          },
        })
      } else if (volumeModule.compatibleTypes.includes("configmap")) {
        volumes.push({
          name: volumeName,
          configMap: {
            name: volume.module,
          },
        })
      } else {
        throw new ConfigurationError(
          chalk.red(deline`Container module ${chalk.white(module.name)} specifies a unsupported module
          ${chalk.white(volumeModule.name)} for volume mount ${chalk.white(volumeName)}. Only \`persistentvolumeclaim\`
          and \`configmap\` modules are supported at this time.
          `),
          { volumeSpec: volume }
        )
      }
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
