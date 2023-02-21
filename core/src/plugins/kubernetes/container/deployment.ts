/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { V1Affinity, V1Container, V1DaemonSet, V1Deployment, V1PodSpec, V1VolumeMount } from "@kubernetes/client-node"
import { extend, keyBy, omit, set } from "lodash"
import { ContainerDeployAction, ContainerDeploySpec, ContainerVolumeSpec } from "../../container/moduleConfig"
import { createIngressResources } from "./ingress"
import { createServiceResources } from "./service"
import { waitForResources } from "../status/status"
import { apply, deleteObjectsBySelector, KUBECTL_DEFAULT_TIMEOUT } from "../kubectl"
import { getAppNamespace, getAppNamespaceStatus } from "../namespace"
import { PluginContext } from "../../../plugin-context"
import { KubeApi } from "../api"
import { KubernetesPluginContext, KubernetesProvider } from "../config"
import { Log } from "../../../logger/log-entry"
import { prepareEnvVars } from "../util"
import { deline, gardenAnnotationKey } from "../../../util/string"
import { resolve } from "path"
import { killPortForwards } from "../port-forward"
import { prepareSecrets } from "../secrets"
import { configureSyncMode, convertContainerSyncSpec, startSyncs } from "../sync"
import { getDeployedImageId, getResourceRequirements, getSecurityContext } from "./util"
import { configureLocalMode, startServiceInLocalMode } from "../local-mode"
import { DeployActionHandler, DeployActionParams } from "../../../plugin/action-types"
import { Resolved } from "../../../actions/types"
import { ConfigurationError } from "../../../exceptions"
import {
  SyncableKind,
  syncableKinds,
  SyncableResource,
  KubernetesWorkload,
  KubernetesResource,
  SupportedRuntimeActions,
} from "../types"
import { k8sGetContainerDeployStatus, ContainerServiceStatus } from "./status"
import { emitNonRepeatableWarning } from "../../../warnings"

export const DEFAULT_CPU_REQUEST = "10m"
export const DEFAULT_MEMORY_REQUEST = "90Mi" // This is the minimum in some clusters
export const REVISION_HISTORY_LIMIT_PROD = 10
export const REVISION_HISTORY_LIMIT_DEFAULT = 3
export const DEFAULT_MINIMUM_REPLICAS = 1
export const PRODUCTION_MINIMUM_REPLICAS = 3

export const k8sContainerDeploy: DeployActionHandler<"deploy", ContainerDeployAction> = async (params) => {
  const { ctx, action, log, syncMode, localMode } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const { deploymentStrategy } = k8sCtx.provider.config
  const deployWithSyncMode = syncMode && !!action.getSpec("sync")
  const api = await KubeApi.factory(log, k8sCtx, k8sCtx.provider)

  const imageId = getDeployedImageId(action, k8sCtx.provider)

  if (deploymentStrategy === "blue-green") {
    emitNonRepeatableWarning(
      "The deploymentStrategy configuration option has been deprecated and has no effect. It will be removed iin 0.14. The 'rolling' deployment strategy will be applied."
    )
  }
  await deployContainerServiceRolling({ ...params, syncMode: deployWithSyncMode, api, imageId })

  const status = await k8sGetContainerDeployStatus(params)

  // Make sure port forwards work after redeployment
  killPortForwards(action, status.detail?.forwardablePorts || [], log)

  if (deployWithSyncMode) {
    await startContainerDevSync({
      ctx: k8sCtx,
      log,
      status: status.detail!,
      action,
    })
  }

  if (localMode) {
    await startLocalMode({
      ctx: k8sCtx,
      log,
      status: status.detail!,
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
  log: Log
  action: Resolved<ContainerDeployAction>
}) {
  const sync = action.getSpec("sync")
  const workload = status.detail.workload

  if (!sync?.paths || !workload) {
    return
  }

  log.info({
    section: action.name,
    // FIXME: Not sure why we need to explicitly set the symbol here, but if we don't
    // it's not rendered.
    symbol: "info",
    msg: chalk.grey(`Deploying in sync mode`),
  })

  const defaultNamespace = await getAppNamespace(ctx, log, ctx.provider)

  const target = {
    kind: <SyncableKind>workload.kind,
    name: workload.metadata.name,
  }

  const syncs = sync.paths.map((s) => ({
    ...s,
    sourcePath: s.source,
    containerPath: s.target,
    target,
  }))

  await startSyncs({
    ctx,
    log,
    action,
    actionDefaults: {},
    basePath: action.basePath(),
    defaultNamespace,
    defaultTarget: target,
    manifests: status.detail.remoteResources,
    syncs,
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
  log: Log
  action: Resolved<ContainerDeployAction>
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
  params: DeployActionParams<"deploy", ContainerDeployAction> & { api: KubeApi; imageId: string }
) => {
  const { ctx, api, action, log, syncMode, imageId, localMode } = params
  const k8sCtx = <KubernetesPluginContext>ctx

  const namespaceStatus = await getAppNamespaceStatus(k8sCtx, log, k8sCtx.provider)
  const namespace = namespaceStatus.namespaceName

  const { manifests } = await createContainerManifests({
    ctx: k8sCtx,
    api,
    log,
    action,
    imageId,
    enableSyncMode: syncMode,
    enableLocalMode: localMode,
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

export async function createContainerManifests({
  ctx,
  api,
  log,
  action,
  imageId,
  enableSyncMode,
  enableLocalMode,
}: {
  ctx: PluginContext
  api: KubeApi
  log: Log
  action: Resolved<ContainerDeployAction>
  imageId: string
  enableSyncMode: boolean
  enableLocalMode: boolean
}) {
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const { production } = ctx
  const namespace = await getAppNamespace(k8sCtx, log, provider)
  const ingresses = await createIngressResources(api, provider, namespace, action, log)
  const workload = await createWorkloadManifest({
    ctx: k8sCtx,
    api,
    provider,
    action,
    imageId,
    namespace,
    enableSyncMode,
    enableLocalMode,
    log,
    production,
  })
  const kubeServices = await createServiceResources(action, namespace)
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
    set(obj, ["metadata", "labels", gardenAnnotationKey("module")], action.moduleName() || "")
    set(obj, ["metadata", "labels", gardenAnnotationKey("service")], action.name)
    set(obj, ["metadata", "annotations", gardenAnnotationKey("generated")], "true")
    set(obj, ["metadata", "annotations", gardenAnnotationKey("version")], action.versionString())
  }

  return { workload, manifests }
}

interface CreateDeploymentParams {
  ctx: KubernetesPluginContext
  api: KubeApi
  provider: KubernetesProvider
  action: Resolved<ContainerDeployAction>
  namespace: string
  imageId: string
  enableSyncMode: boolean
  enableLocalMode: boolean
  log: Log
  production: boolean
}

export async function createWorkloadManifest({
  ctx,
  api,
  provider,
  action,
  imageId,
  namespace,
  enableSyncMode,
  enableLocalMode,
  log,
  production,
}: CreateDeploymentParams): Promise<KubernetesWorkload> {
  const spec = action.getSpec()
  let configuredReplicas = spec.replicas || DEFAULT_MINIMUM_REPLICAS
  let workload = workloadConfig({ action, configuredReplicas, namespace })

  if (production && !spec.replicas) {
    configuredReplicas = PRODUCTION_MINIMUM_REPLICAS
  }

  if (enableSyncMode && configuredReplicas > 1) {
    log.warn({
      msg: chalk.gray(`Ignoring replicas config on container service ${action.name} while in sync mode`),
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

  const env = prepareEnvVars({ ...action.getEnvVars(), ...spec.env })

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
    if (enableSyncMode) {
      mode = "dev"
    } else if (enableLocalMode) {
      mode = "local"
    } else {
      mode = "normal"
    }
    configureHealthCheck(container, spec, mode)
  }

  if (spec.volumes && spec.volumes.length) {
    configureVolumes(action, workload.spec.template.spec!, spec.volumes)
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

    const deploymentStrategy = spec.deploymentStrategy
    if (deploymentStrategy === "RollingUpdate") {
      // Need the <any> cast because the library types are busted
      deployment.spec!.strategy = <any>{
        type: deploymentStrategy,
        rollingUpdate: {
          // This is optimized for fast re-deployment.
          maxUnavailable: 1,
          maxSurge: 1,
        },
      }
    } else if (deploymentStrategy === "Recreate") {
      deployment.spec!.strategy = {
        type: deploymentStrategy,
      }
    } else {
      const _exhaustiveCheck: never = deploymentStrategy
      return _exhaustiveCheck
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
                    key: gardenAnnotationKey("actionName"),
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

  const syncSpec = convertContainerSyncSpec(ctx, action)
  const localModeSpec = spec.localMode

  // Local mode always takes precedence over sync mode
  if (enableLocalMode && localModeSpec) {
    // no op here, local mode will be configured later after all manifests are ready
  } else if (enableSyncMode && syncSpec) {
    log.debug({ section: action.key(), msg: chalk.gray(`-> Configuring in sync mode`) })

    const target = { kind: <SyncableKind>workload.kind, name: workload.metadata.name }

    const configured = await configureSyncMode({
      ctx,
      log,
      provider,
      action,
      defaultTarget: target,
      manifests: [workload],
      spec: syncSpec,
    })

    workload = <KubernetesResource<V1Deployment | V1DaemonSet>>configured.updated[0]
  }

  if (!workload.spec.template.spec?.volumes?.length) {
    // this is important for status checks to work correctly
    delete workload.spec.template.spec?.volumes
  }

  return workload
}

export function getDeploymentName(deployName: string, blueGreen: boolean, versionString: string) {
  return blueGreen ? `${deployName}-${versionString}` : deployName
}

export function getDeploymentLabels(action: ContainerDeployAction, blueGreen: boolean) {
  if (blueGreen) {
    return {
      [gardenAnnotationKey("module")]: action.moduleName() || "",
      [gardenAnnotationKey("actionName")]: action.name,
      [gardenAnnotationKey("service")]: action.name,
      [gardenAnnotationKey("version")]: action.versionString(),
    }
  } else {
    return {
      [gardenAnnotationKey("module")]: action.moduleName() || "",
      [gardenAnnotationKey("actionName")]: action.name,
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
}: {
  action: Resolved<ContainerDeployAction>
  configuredReplicas: number
  namespace: string
}): KubernetesResource<V1Deployment | V1DaemonSet> {
  const labels = getDeploymentLabels(action, false)
  const selector = {
    matchLabels: getDeploymentSelector(action, false),
  }

  const { annotations, daemon } = action.getSpec()

  return {
    kind: daemon ? "DaemonSet" : "Deployment",
    apiVersion: "apps/v1",
    metadata: {
      name: getDeploymentName(action.name, false, action.versionString()),
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

function configureHealthCheck(container: V1Container, spec: ContainerDeploySpec, mode: HealthCheckMode): void {
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
  // We also increase the periodSeconds and failureThreshold when in sync mode. This is to prevent
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
      port: portsByName[spec.healthCheck.tcpPort].containerPort,
    }
    container.livenessProbe.tcpSocket = container.readinessProbe.tcpSocket
  } else {
    throw new Error("Must specify type of health check when configuring health check.")
  }
}

export function configureVolumes(
  action: SupportedRuntimeActions,
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
          path: resolve(action.basePath(), volume.hostPath),
        },
      })
    } else if (volume.action) {
      // Make sure the action is a supported type
      const volumeAction = action.getDependency(volume.action)

      if (!volumeAction) {
        throw new ConfigurationError(
          `${action.longDescription()} specifies action '${
            volume.action.name
          }' on volume '${volumeName}' but the Deploy action could not be found. Please make sure it is specified as a dependency on the action.`,
          { volume }
        )
      }

      if (volumeAction.isCompatible("persistentvolumeclaim")) {
        volumes.push({
          name: volumeName,
          persistentVolumeClaim: {
            claimName: volume.action,
          },
        })
      } else if (volumeAction.isCompatible("configmap")) {
        volumes.push({
          name: volumeName,
          configMap: {
            name: volume.action,
          },
        })
      } else {
        throw new ConfigurationError(
          chalk.red(deline`${action.longDescription()} specifies a unsupported config
          ${chalk.white(volumeAction.name)} for volume mount ${chalk.white(volumeName)}. Only \`persistentvolumeclaim\`
          and \`configmap\` action are supported at this time.
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

  return { state: "ready", detail: { state: "missing", detail: {} }, outputs: {} }
}
