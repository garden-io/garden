/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { V1Affinity, V1Container, V1DaemonSet, V1Deployment, V1PodSpec, V1VolumeMount } from "@kubernetes/client-node"
import { extend, find, keyBy, omit, set } from "lodash"
import {
  ContainerModule,
  ContainerVolumeSpec,
  ContainerDeployAction,
  ContainerDeploySpec,
} from "../../container/moduleConfig"
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
import { ContainerServiceStatus, getContainerDeployStatus } from "./status"
import { LogEntry } from "../../../logger/log-entry"
import { prepareEnvVars, workloadTypes } from "../util"
import { deline, gardenAnnotationKey } from "../../../util/string"
import { RuntimeContext } from "../../../runtime-context"
import { resolve } from "path"
import { killPortForwards } from "../port-forward"
import { prepareSecrets } from "../secrets"
import { configureDevMode, startDevModeSync } from "../dev-mode"
import { syncableKinds, SyncableResource } from "../types"
import { getResourceRequirements, getSecurityContext } from "./util"
import { configureLocalMode, startServiceInLocalMode } from "../local-mode"
import { DeployActionHandler, DeployActionParams } from "../../../plugin/action-types"

export const DEFAULT_CPU_REQUEST = "10m"
export const DEFAULT_MEMORY_REQUEST = "90Mi" // This is the minimum in some clusters
export const REVISION_HISTORY_LIMIT_PROD = 10
export const REVISION_HISTORY_LIMIT_DEFAULT = 3
export const DEFAULT_MINIMUM_REPLICAS = 1
export const PRODUCTION_MINIMUM_REPLICAS = 3

export const containerDeploy: DeployActionHandler<"deploy", ContainerDeployAction> = async (params) => {
  const { ctx, action, log, devMode, localMode } = params
  const { deploymentStrategy } = params.ctx.provider.config
  const deployWithDevMode = devMode && !!action.getSpec("devMode")
  const k8sCtx = <KubernetesPluginContext>ctx
  const api = await KubeApi.factory(log, k8sCtx, k8sCtx.provider)

  if (deploymentStrategy === "blue-green") {
    await deployContainerServiceBlueGreen({ ...params, devMode: deployWithDevMode, api })
  } else {
    await deployContainerServiceRolling({ ...params, devMode: deployWithDevMode, api })
  }

  const status = await getContainerDeployStatus(params)

  // Make sure port forwards work after redeployment
  killPortForwards(action, status.forwardablePorts || [], log)

  if (deployWithDevMode) {
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
      action,
    })
  }

  return status
}

export async function startContainerDevSync({
  ctx,
  log,
  status,
  action,
}: {
  ctx: KubernetesPluginContext
  status: ContainerServiceStatus
  log: LogEntry
  action: ContainerDeployAction
}) {
  const devMode = action.getSpec("devMode")

  if (!devMode) {
    return
  }

  log.info({
    section: service.name,
    msg: chalk.grey(`Deploying in dev mode`),
  })

  const namespace = await getAppNamespace(ctx, log, ctx.provider)
  const target = status.detail.remoteResources.find((r) => syncableKinds.includes(r.kind))! as SyncableResource

  await startDevModeSync({
    ctx,
    log,
    basePath: action.getBasePath(),
    namespace,
    target,
    spec: devMode,
    deployName: action.name,
  })
}

export async function startLocalMode({
  ctx,
  log,
  status,
  action,
}: {
  ctx: KubernetesPluginContext
  status: ContainerServiceStatus
  log: LogEntry
  action: ContainerDeployAction
}) {
  const localModeSpec = action.getSpec("localMode")

  if (!localModeSpec) {
    return
  }

  const namespace = await getAppNamespace(ctx, log, ctx.provider)
  const targetResource = status.detail.remoteResources.find((r) => syncableKinds.includes(r.kind))! as SyncableResource

  await startServiceInLocalMode({
    ctx,
    spec: localModeSpec,
    targetResource,
    action,
    namespace,
    log,
  })
}

export const deployContainerServiceRolling = async (
  params: DeployActionParams<"deploy", ContainerDeployAction> & { api: KubeApi }
) => {
  const { ctx, api, action, runtimeContext, log, devMode, localMode } = params
  const k8sCtx = <KubernetesPluginContext>ctx

  const namespaceStatus = await getAppNamespaceStatus(k8sCtx, log, k8sCtx.provider)
  const namespace = namespaceStatus.namespaceName

  const { manifests } = await createContainerManifests({
    ctx: k8sCtx,
    api,
    log,
    action,
    runtimeContext,
    enableDevMode: devMode,
    enableLocalMode: localMode,
    blueGreen: false,
  })

  const provider = k8sCtx.provider
  const pruneLabels = { [gardenAnnotationKey("service")]: action.name }

  await apply({ log, ctx, api, provider, manifests, namespace, pruneLabels })

  await waitForResources({
    namespace,
    ctx,
    provider,
    actionName: action.name,
    resources: manifests,
    log,
    timeoutSec: action.getSpec("timeout") || KUBECTL_DEFAULT_TIMEOUT,
  })
}

export const deployContainerServiceBlueGreen = async (
  params: DeployActionParams<"deploy", ContainerDeployAction> & { api: KubeApi }
) => {
  const { ctx, api, action, runtimeContext, log, devMode, localMode } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const namespaceStatus = await getAppNamespaceStatus(k8sCtx, log, k8sCtx.provider)
  const namespace = namespaceStatus.namespaceName

  // Create all the resource manifests for the Garden service which will be deployed
  const { manifests } = await createContainerManifests({
    ctx: k8sCtx,
    api,
    log,
    action,
    runtimeContext,
    enableDevMode: devMode,
    enableLocalMode: localMode,
    blueGreen: true,
  })

  const provider = k8sCtx.provider

  // Retrieve the k8s service referring to the Garden service which is already deployed
  const currentService = (await api.core.listNamespacedService(namespace)).items.filter(
    (s) => s.metadata.name === action.name
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
      actionName: action.name,
      resources: manifests,
      log,
      timeoutSec: KUBECTL_DEFAULT_TIMEOUT,
    })
  } else {
    // A k8s service matching the current Garden service exist in the cluster.
    // Proceeding with blue-green deployment
    const newVersion = action.getVersionString()
    const versionKey = gardenAnnotationKey("version")

    // Remove Service manifest from generated resources
    const filteredManifests = manifests.filter((manifest) => manifest.kind !== "Service")

    // Apply new Deployment manifest (deploy the Green version)
    await apply({ log, ctx, api, provider, manifests: filteredManifests, namespace })
    await waitForResources({
      namespace,
      ctx,
      provider: k8sCtx.provider,
      actionName: `Deploy ${action.name}`,
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
      await api.core.patchNamespacedService(action.name, namespace, servicePatchBody)
    }

    await waitForResources({
      namespace,
      ctx,
      provider: k8sCtx.provider,
      actionName: `Update service`,
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
      selector: `${gardenAnnotationKey("service")}=${action.name},` + `${versionKey}!=${newVersion}`,
    })
  }
}

export async function createContainerManifests({
  ctx,
  api,
  log,
  action,
  runtimeContext,
  enableDevMode,
  enableLocalMode,
  blueGreen,
}: {
  ctx: PluginContext
  api: KubeApi
  log: LogEntry
  action: ContainerDeployAction
  runtimeContext: RuntimeContext
  enableDevMode: boolean
  enableLocalMode: boolean
  blueGreen: boolean
}) {
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const { production } = ctx
  const namespace = await getAppNamespace(k8sCtx, log, provider)
  const ingresses = await createIngressResources(api, provider, namespace, action, log)
  const workload = await createWorkloadManifest({
    api,
    provider,
    action,
    runtimeContext,
    namespace,
    enableDevMode,
    enableLocalMode,
    log,
    production,
    blueGreen,
  })
  const kubeServices = await createServiceResources(action, namespace, blueGreen)
  const localModeSpec = action.getSpec("localMode")

  if (enableLocalMode && localModeSpec) {
    await configureLocalMode({
      ctx,
      spec: localModeSpec,
      targetResource: workload,
      action,
      log,
    })
  }

  const manifests = [workload, ...kubeServices, ...ingresses]

  for (const obj of manifests) {
    set(obj, ["metadata", "labels", gardenAnnotationKey("module")], action.getModuleName())
    set(obj, ["metadata", "labels", gardenAnnotationKey("service")], action.name)
    set(obj, ["metadata", "annotations", gardenAnnotationKey("generated")], "true")
    set(obj, ["metadata", "annotations", gardenAnnotationKey("version")], action.getVersionString())
  }

  return { workload, manifests }
}

interface CreateDeploymentParams {
  api: KubeApi
  provider: KubernetesProvider
  action: ContainerDeployAction
  runtimeContext: RuntimeContext
  namespace: string
  enableDevMode: boolean
  enableLocalMode: boolean
  log: LogEntry
  production: boolean
  blueGreen: boolean
}

export async function createWorkloadManifest({
  api,
  provider,
  action,
  runtimeContext,
  namespace,
  enableDevMode,
  enableLocalMode,
  log,
  production,
  blueGreen,
}: CreateDeploymentParams): Promise<KubernetesWorkload> {
  const spec = action.getSpec()
  let configuredReplicas = spec.replicas || DEFAULT_MINIMUM_REPLICAS
  const workload = workloadConfig({ action, configuredReplicas, namespace, blueGreen })

  if (production && !spec.replicas) {
    configuredReplicas = PRODUCTION_MINIMUM_REPLICAS
  }

  if (enableDevMode && configuredReplicas > 1) {
    log.warn({
      msg: chalk.gray(`Ignoring replicas config on container service ${action.name} while in dev mode`),
      symbol: "warning",
    })
    configuredReplicas = 1
  }

  if (enableLocalMode && configuredReplicas > 1) {
    log.verbose({
      msg: chalk.yellow(`Ignoring replicas config on container Deploy ${action.name} while in local mode`),
      symbol: "warning",
    })
    configuredReplicas = 1
  }

  const env = prepareEnvVars({ ...runtimeContext.envVars, ...spec.env })

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
    name: action.name,
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

  if (spec.command && spec.command.length > 0) {
    container.command = spec.command
  }

  if (spec.args && spec.args.length > 0) {
    container.args = spec.args
  }

  if (spec.tty) {
    container.tty = true
    container.stdin = true
  }

  if (spec.healthCheck) {
    let mode: HealthCheckMode
    if (enableDevMode) {
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
                    values: [action.getModuleName()],
                  },
                  {
                    key: gardenAnnotationKey("service"),
                    operator: "In",
                    values: [action.name],
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

  const devModeSpec = spec.devMode
  const localModeSpec = spec.localMode

  // Local mode always takes precedence over dev mode
  if (enableLocalMode && localModeSpec) {
    // no op here, local mode will be configured later after all manifests are ready
  } else if (enableDevMode && devModeSpec) {
    log.debug({ section: action.name, msg: chalk.gray(`-> Configuring in dev mode`) })

    configureDevMode({
      target: workload,
      spec: devModeSpec,
    })
  }

  if (!workload.spec.template.spec?.volumes?.length) {
    // this is important for status checks to work correctly
    delete workload.spec.template.spec?.volumes
  }

  return workload
}

function getDeploymentName(action: ContainerDeployAction, blueGreen: boolean) {
  return blueGreen ? `${action.name}-${action.getVersionString()}` : action.name
}

export function getDeploymentLabels(action: ContainerDeployAction, blueGreen: boolean) {
  if (blueGreen) {
    return {
      [gardenAnnotationKey("module")]: action.getModuleName(),
      [gardenAnnotationKey("service")]: action.name,
      [gardenAnnotationKey("version")]: action.getVersionString(),
    }
  } else {
    return {
      [gardenAnnotationKey("module")]: action.getModuleName(),
      [gardenAnnotationKey("service")]: action.name,
    }
  }
}

export function getDeploymentSelector(action: ContainerDeployAction, blueGreen: boolean) {
  // Unfortunately we need this because matchLabels is immutable, and we had omitted the module annotation before
  // in the selector.
  return omit(getDeploymentLabels(action, blueGreen), gardenAnnotationKey("module"))
}

function workloadConfig({
  action,
  configuredReplicas,
  namespace,
  blueGreen,
}: {
  action: ContainerDeployAction
  configuredReplicas: number
  namespace: string
  blueGreen: boolean
}): KubernetesResource<V1Deployment | V1DaemonSet> {
  const labels = getDeploymentLabels(action, blueGreen)
  const selector = {
    matchLabels: getDeploymentSelector(action, blueGreen),
  }

  const { annotations, daemon } = action.getSpec()

  return {
    kind: daemon ? "DaemonSet" : "Deployment",
    apiVersion: "apps/v1",
    metadata: {
      name: getDeploymentName(action, blueGreen),
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
          annotations,
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
  spec: ContainerDeploySpec,
  mode: HealthCheckMode
): void {
  if (mode === "local") {
    // no need to configure liveness and readiness probes for a service running in local mode
    return
  }

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
  // We also increase the periodSeconds and failureThreshold when in dev mode. This is to prevent
  // K8s from restarting the pod when liveness probes fail during build or server restarts on a
  // sync event.
  container.livenessProbe = {
    initialDelaySeconds: readinessPeriodSeconds * readinessFailureThreshold,
    periodSeconds: mode === "dev" ? 10 : 5,
    timeoutSeconds: spec.healthCheck?.livenessTimeoutSeconds || 3,
    successThreshold: 1,
    failureThreshold: mode === "dev" ? 30 : 3,
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

export const deleteContainerDeploy: DeployActionHandler<"delete", ContainerDeployAction> = async (params) => {
  const { ctx, log, action } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)
  const provider = k8sCtx.provider

  await deleteObjectsBySelector({
    ctx,
    log,
    provider,
    namespace,
    selector: `${gardenAnnotationKey("service")}=${action.name}`,
    objectTypes: ["deployment", "replicaset", "pod", "service", "ingress", "daemonset"],
    includeUninitialized: false,
  })

  return { state: "missing", detail: { remoteResources: [], workload: null } }
}
