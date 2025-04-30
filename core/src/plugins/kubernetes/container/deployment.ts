/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type {
  V1Affinity,
  V1Container,
  V1DaemonSet,
  V1Deployment,
  V1PodSpec,
  V1VolumeMount,
} from "@kubernetes/client-node"
import { extend, keyBy, omit, set } from "lodash-es"
import type { ContainerDeployAction, ContainerDeploySpec, ContainerVolumeSpec } from "../../container/moduleConfig.js"
import { createIngressResources } from "./ingress.js"
import { createServiceResources } from "./service.js"
import { waitForResources } from "../status/status.js"
import { apply, deleteObjectsBySelector, deleteResourceKeys, KUBECTL_DEFAULT_TIMEOUT } from "../kubectl.js"
import { getAppNamespace } from "../namespace.js"
import type { PluginContext } from "../../../plugin-context.js"
import { KubeApi } from "../api.js"
import type { KubernetesPluginContext, KubernetesProvider } from "../config.js"
import type { ActionLog, Log } from "../../../logger/log-entry.js"
import { prepareEnvVars } from "../util.js"
import { gardenAnnotationKey } from "../../../util/string.js"
import { resolve } from "path"
import { killPortForwards } from "../port-forward.js"
import { prepareSecrets } from "../secrets.js"
import { configureSyncMode, convertContainerSyncSpec } from "../sync.js"
import { getDeployedImageId, getResourceRequirements, getSecurityContext, resolveResourceLimits } from "./util.js"
import type { DeployActionHandler, DeployActionParams } from "../../../plugin/action-types.js"
import type { ActionMode, Resolved } from "../../../actions/types.js"
import { ConfigurationError, DeploymentError } from "../../../exceptions.js"
import type { SyncableKind, KubernetesWorkload, KubernetesResource, SupportedRuntimeAction } from "../types.js"
import { k8sGetContainerDeployStatus } from "./status.js"
import { K8_POD_DEFAULT_CONTAINER_ANNOTATION_KEY } from "../run.js"
import { styles } from "../../../logger/styles.js"

export const REVISION_HISTORY_LIMIT_PROD = 10
export const REVISION_HISTORY_LIMIT_DEFAULT = 3
export const DEFAULT_MINIMUM_REPLICAS = 1
export const PRODUCTION_MINIMUM_REPLICAS = 3

export const k8sContainerDeploy: DeployActionHandler<"deploy", ContainerDeployAction> = async (params) => {
  const { ctx, action, log, force } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const api = await KubeApi.factory(log, k8sCtx, k8sCtx.provider)

  const imageId = getDeployedImageId(action)

  const status = await k8sGetContainerDeployStatus(params)
  const specChangedResourceKeys: string[] = status.detail?.detail.selectorChangedResourceKeys || []
  if (specChangedResourceKeys.length > 0) {
    const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)
    await handleChangedSelector({
      action,
      specChangedResourceKeys,
      ctx: k8sCtx,
      namespace,
      log,
      production: ctx.production,
      force,
    })
  }

  await deployContainerServiceRolling({ ...params, api, imageId })

  const postDeployStatus = await k8sGetContainerDeployStatus(params)

  // Make sure port forwards work after redeployment
  killPortForwards(action, postDeployStatus.detail?.forwardablePorts || [], log)

  return postDeployStatus
}

export const deployContainerServiceRolling = async (
  params: DeployActionParams<"deploy", ContainerDeployAction> & { api: KubeApi; imageId: string }
) => {
  const { ctx, api, action, log, imageId } = params
  const k8sCtx = <KubernetesPluginContext>ctx

  const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)

  const { manifests } = await createContainerManifests({
    ctx: k8sCtx,
    api,
    log,
    action,
    imageId,
  })

  const provider = k8sCtx.provider
  const pruneLabels = { [gardenAnnotationKey("service")]: action.name }

  await apply({ log, ctx, api, provider, manifests, namespace, pruneLabels })

  await waitForResources({
    namespace,
    ctx,
    provider,
    waitForJobs: false,
    actionName: action.key(),
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
}: {
  ctx: PluginContext
  api: KubeApi
  log: ActionLog
  action: Resolved<ContainerDeployAction>
  imageId: string
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
    log,
    production,
  })
  const kubeServices = await createServiceResources(action, namespace)
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
  log: ActionLog
  production: boolean
}

const getDefaultWorkloadTarget = (w: KubernetesResource<V1Deployment | V1DaemonSet>) => ({
  kind: <SyncableKind>w.kind,
  name: w.metadata.name,
})

export async function createWorkloadManifest({
  ctx,
  api,
  provider,
  action,
  imageId,
  namespace,
  log,
  production,
}: CreateDeploymentParams): Promise<KubernetesWorkload> {
  const spec = action.getSpec()

  const mode = action.mode()

  let configuredReplicas = spec.replicas || DEFAULT_MINIMUM_REPLICAS
  let workload = workloadConfig({ action, configuredReplicas, namespace })

  if (production && !spec.replicas) {
    configuredReplicas = PRODUCTION_MINIMUM_REPLICAS
  }

  if (mode === "sync" && configuredReplicas > 1) {
    log.warn(`Ignoring replicas config on container service ${action.name} while in sync mode`)
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
  const resolvedResourceLimits = resolveResourceLimits({ cpu, memory }, limits)

  const container: V1Container = {
    name: action.name,
    image: imageId,
    env,
    ports: [],
    resources: getResourceRequirements(resolvedResourceLimits),
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
      return deploymentStrategy satisfies never
    }

    workload.spec.revisionHistoryLimit = production ? REVISION_HISTORY_LIMIT_PROD : REVISION_HISTORY_LIMIT_DEFAULT
  }

  if (provider.config.imagePullSecrets?.length > 0) {
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
                    key: gardenAnnotationKey("action"),
                    operator: "In",
                    values: [action.key()],
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

  // Local mode always takes precedence over sync mode
  if (mode === "sync" && syncSpec) {
    log.debug(styles.primary(`-> Configuring in sync mode`))
    const configured = await configureSyncMode({
      ctx,
      log,
      provider,
      action,
      defaultTarget: getDefaultWorkloadTarget(workload),
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

export function getDeploymentLabels(action: ContainerDeployAction) {
  return {
    [gardenAnnotationKey("module")]: action.moduleName() || "",
    [gardenAnnotationKey("action")]: action.key(),
  }
}

export function getDeploymentSelector(action: ContainerDeployAction) {
  // Unfortunately we need this because matchLabels is immutable, and we had omitted the module annotation before
  // in the selector.
  return omit(getDeploymentLabels(action), gardenAnnotationKey("module"))
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
  const labels = getDeploymentLabels(action)
  const selector = {
    matchLabels: getDeploymentSelector(action),
  }

  const { annotations, daemon } = action.getSpec()
  // Add default-container annotation in generated manifest
  // so exec respects it in case of multiple containers in pod
  annotations[K8_POD_DEFAULT_CONTAINER_ANNOTATION_KEY] = action.name

  return {
    kind: daemon ? "DaemonSet" : "Deployment",
    apiVersion: "apps/v1",
    metadata: {
      name: action.name,
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

function configureHealthCheck(container: V1Container, spec: ContainerDeploySpec, mode: ActionMode): void {
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
    periodSeconds: mode === "sync" ? 10 : 5,
    timeoutSeconds: spec.healthCheck?.livenessTimeoutSeconds || 3,
    successThreshold: 1,
    failureThreshold: mode === "sync" ? 30 : 3,
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
    throw new ConfigurationError({
      message: "Must specify type of health check when configuring health check.",
    })
  }
}

export function configureVolumes(
  action: SupportedRuntimeAction,
  podSpec: V1PodSpec,
  volumeSpecs: ContainerVolumeSpec[]
): void {
  const volumes: any[] = []
  const volumeMounts: V1VolumeMount[] = []

  for (const volume of volumeSpecs) {
    const volumeName = volume.name

    if (!volumeName) {
      throw new ConfigurationError({ message: "Must specify volume name" })
    }

    volumeMounts.push({
      name: volumeName,
      mountPath: volume.containerPath,
    })

    if (volume.hostPath) {
      volumes.push({
        name: volumeName,
        hostPath: {
          path: resolve(action.sourcePath(), volume.hostPath),
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

/**
 * Deletes matching deployed resources for the given Deploy action, unless deploying against a production environment
 * with `force = false`.
 *
 * TODO: Also accept `KubernetesDeployAction`s and reuse this helper for deleting before redeploying when selectors
 * have changed before a `kubernetes` Deploy is redeployed.
 */
export async function handleChangedSelector({
  action,
  specChangedResourceKeys,
  ctx,
  namespace,
  log,
  production,
  force,
}: {
  action: ContainerDeployAction
  specChangedResourceKeys: string[]
  ctx: KubernetesPluginContext
  namespace: string
  log: Log
  production: boolean
  force: boolean
}) {
  const msgPrefix = `Deploy ${styles.highlight(action.name)} was deployed with a different ${styles.accent(
    "spec.selector"
  )} and needs to be deleted before redeploying.`
  if (production && !force) {
    throw new DeploymentError({
      message: `${msgPrefix} Since this environment has production = true, Garden won't automatically delete this resource. To do so, use the ${styles.command(
        "--force"
      )} flag when deploying e.g. with the ${styles.command(
        "garden deploy"
      )} command. You can also delete the resource from your cluster manually and try again.`,
    })
  } else {
    if (production && force) {
      log.warn(`${msgPrefix} Since we're deploying with force = true, we'll now delete it before redeploying.`)
    } else if (!production) {
      log.warn(
        `${msgPrefix} Since this environment does not have production = true, we'll now delete it before redeploying.`
      )
    }
    await deleteResourceKeys({
      ctx,
      log,
      provider: ctx.provider,
      namespace,
      keys: specChangedResourceKeys,
    })
  }
}
