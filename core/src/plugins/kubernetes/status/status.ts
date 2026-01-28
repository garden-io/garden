/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { diffString } from "json-diff"
import type { GardenErrorParams } from "../../../exceptions.js"
import { DeploymentError } from "../../../exceptions.js"
import type { PluginContext } from "../../../plugin-context.js"
import { KubeApi, KubernetesError } from "../api.js"
import { getAppNamespace } from "../namespace.js"
import type {
  BaseResource,
  KubernetesResource,
  KubernetesServerResource,
  KubernetesWorkload,
  SyncableResource,
} from "../types.js"
import { cloneDeep, flatten, isArray, isEqual, isPlainObject, keyBy, mapValues, omit, pickBy } from "lodash-es"
import type { KubernetesPluginContext, KubernetesProvider } from "../config.js"
import type { Log } from "../../../logger/log-entry.js"
import type {
  KubernetesObject,
  V1Container,
  V1Job,
  V1PersistentVolumeClaim,
  V1Pod,
  V1ReplicaSet,
  V1ReplicationController,
  V1Service,
} from "@kubernetes/client-node"
import { getPodsBySelector, getResourceKey, hashManifest } from "../util.js"
import { checkWorkloadStatus } from "./workload.js"
import { checkWorkloadPodStatus } from "./pod.js"
import { deline, stableStringify } from "../../../util/string.js"
import { gardenAnnotationKey } from "../../../util/annotations.js"
import type { ActionMode } from "../../../actions/types.js"
import { deepMap } from "../../../util/objects.js"
import type { DeployState } from "../../../types/service.js"
import { combineStates } from "../../../types/service.js"
import { isTruthy, sleep } from "../../../util/util.js"
import dedent from "dedent"

export const k8sManifestHashAnnotationKey = gardenAnnotationKey("manifest-hash")

export interface ResourceStatus<T extends BaseResource | KubernetesObject = BaseResource> {
  state: DeployState
  resource: KubernetesServerResource<T>
  lastMessage?: string
  warning?: true
  logs?: string
}

export class DeploymentResourceStatusError extends DeploymentError {
  status: ResourceStatus<BaseResource>

  constructor(params: GardenErrorParams & { status: ResourceStatus<BaseResource> }) {
    super(params)
    this.status = params.status
  }
}

export interface StatusHandlerParams<T extends BaseResource | KubernetesObject = BaseResource> {
  api: KubeApi
  namespace: string
  resource: KubernetesServerResource<T>
  log: Log
  resourceVersion?: number
  waitForJobs: boolean
}

interface StatusHandler<T extends BaseResource | KubernetesObject = BaseResource> {
  (params: StatusHandlerParams<T>): Promise<ResourceStatus<T>>
}

const pvcPhaseMap: { [key: string]: DeployState } = {
  Available: "ready",
  Bound: "ready",
  Released: "stopped",
  Failed: "unhealthy",
  // This is confusing, but this basically means it's waiting to be bound
  Pending: "ready",
}

// Handlers to check the rollout status for K8s objects where that applies.
// Using https://github.com/kubernetes/helm/blob/master/pkg/kube/wait.go as a reference here.
const objHandlers: { [kind: string]: StatusHandler } = {
  DaemonSet: checkWorkloadStatus,
  Deployment: checkWorkloadStatus,
  StatefulSet: checkWorkloadStatus,

  PersistentVolumeClaim: async ({ resource }: StatusHandlerParams<V1PersistentVolumeClaim>) => {
    const pvc = <KubernetesServerResource<V1PersistentVolumeClaim>>resource
    const state: DeployState = pvcPhaseMap[pvc.status.phase!] || "unknown"
    return { state, resource }
  },

  Pod: async ({ resource }: StatusHandlerParams<V1Pod>) => {
    return checkWorkloadPodStatus(resource, [<KubernetesServerResource<V1Pod>>resource])
  },

  ReplicaSet: async ({ api, namespace, resource }: StatusHandlerParams<V1ReplicaSet>) => {
    return checkWorkloadPodStatus(
      resource,
      await getPodsBySelector(
        api,
        namespace,
        (<KubernetesServerResource<V1ReplicaSet>>resource).spec.selector!.matchLabels!
      )
    )
  },

  ReplicationController: async ({ api, namespace, resource }: StatusHandlerParams<V1ReplicationController>) => {
    return checkWorkloadPodStatus(resource, await getPodsBySelector(api, namespace, resource.spec!.selector!))
  },

  Service: async ({ resource }: StatusHandlerParams<V1Service>) => {
    if (resource.spec.type === "ExternalName") {
      return { state: "ready", resource }
    }

    const service = <KubernetesServerResource<V1Service>>resource

    if (resource.spec.clusterIP !== "None" && service.spec.clusterIP === "") {
      return { state: "deploying", resource }
    }

    if (resource.spec.type === "LoadBalancer" && !service.status.loadBalancer!.ingress) {
      return { state: "deploying", resource }
    }

    return { state: "ready", resource }
  },

  Job: async ({ resource, waitForJobs }: StatusHandlerParams<V1Job>) => {
    if (
      resource.status?.failed &&
      resource.spec?.backoffLimit &&
      resource.status?.failed >= resource.spec?.backoffLimit
    ) {
      // job has failed
      return { state: "unhealthy", resource }
    }
    if (
      resource.spec?.completions &&
      resource.status?.succeeded &&
      resource.status?.succeeded < resource.spec.completions
    ) {
      // job is not yet completed
      return { state: "deploying", resource }
    }
    // job has succeeded
    if (resource.status.succeeded) {
      return { state: "ready", resource }
    }

    // wait for job only if waitForJobs is set, otherwise
    // mark it as ready and proceed.
    if (waitForJobs) {
      return { state: "deploying", resource }
    } else {
      return { state: "ready", resource }
    }
  },
}

/**
 * Check if the specified Kubernetes objects are deployed and fully rolled out
 */
export async function checkResourceStatuses({
  api,
  namespace,
  manifests,
  log,
  waitForJobs,
}: {
  api: KubeApi
  namespace: string
  manifests: KubernetesResource[]
  log: Log
  waitForJobs: boolean
}): Promise<ResourceStatus[]> {
  return Promise.all(
    manifests.map(async (manifest) => {
      return checkResourceStatus({ api, namespace, manifest, log, waitForJobs })
    })
  )
}

export async function checkResourceStatus({
  api,
  namespace,
  manifest,
  log,
  waitForJobs,
}: {
  api: KubeApi
  namespace: string
  manifest: KubernetesResource
  log: Log
  waitForJobs: boolean
}) {
  if (manifest.metadata?.namespace) {
    namespace = manifest.metadata.namespace
  }

  let resource: KubernetesServerResource

  try {
    resource = await api.readBySpec({ namespace, manifest, log })
  } catch (err) {
    if (!(err instanceof KubernetesError)) {
      throw err
    }
    if (err.responseStatusCode === 404) {
      return { state: <DeployState>"missing", resource: manifest }
    } else {
      throw err
    }
  }

  return resolveResourceStatus({ api, namespace, resource, log, waitForJobs })
}

export async function resolveResourceStatus(
  params: Omit<StatusHandlerParams, "resourceVersion">
): Promise<ResourceStatus> {
  const handler = objHandlers[params.resource.kind]

  if (handler) {
    const resourceVersion = parseInt(params.resource.metadata.resourceVersion!, 10)
    return handler({ ...params, resourceVersion })
  } else {
    // if there is no explicit handler to check the status, we assume there's no rollout phase to wait for
    return { state: "ready", resource: params.resource }
  }
}

export function resolveResourceStatuses(log: Log, statuses: ResourceStatus[]) {
  const deployedStates = statuses.map((s) => s.state)
  const state = combineStates(deployedStates)

  if (state !== "ready") {
    const descriptions = statuses
      .filter((s) => s.state !== "ready")
      .map((s) => `${getResourceKey(s.resource)}: "${s.state}"`)
      .join("\n")

    log.silly(
      dedent`
      Resource(s) with non-ready status found in the cluster:

      ${descriptions}` + "\n"
    )
  }
  return state
}

interface WaitParams {
  namespace: string
  ctx: PluginContext
  provider: KubernetesProvider
  logContext?: string
  resources: KubernetesResource[]
  log: Log
  timeoutSec: number
  waitForJobs: boolean
}

/**
 * Wait until the rollout is complete for each of the given Kubernetes objects
 *
 * @throws {DeploymentResourceStatusError} as soon as resource with state="unhealthy" is found
 * @throws {DeploymentError} if it times out waiting for resource
 */
export async function waitForResources({
  namespace,
  ctx,
  provider,
  logContext,
  resources,
  log,
  timeoutSec,
  waitForJobs,
}: WaitParams) {
  let loops = 0
  const startTime = new Date().getTime()

  const logEventContext = {
    origin: "kubernetes",
    level: "verbose" as const,
  }

  const emitLog = (msg: string) =>
    ctx.events.emit("log", { timestamp: new Date().toISOString(), msg, ...logEventContext })

  const statusLine = log.createLog({
    // TODO: Avoid setting fallback, the action name should be known
    name: logContext || "<kubernetes>",
    origin: "kubernetes",
  })
  emitLog(`Waiting for resources to be ready...`)

  if (resources.length === 0) {
    const noResourcesMsg = `No resources to wait for`
    emitLog(noResourcesMsg)
    return []
  }

  const api = await KubeApi.factory(log, ctx, provider)

  const results: { [key: string]: ResourceStatus } = {}
  const pendingResources = keyBy(resources, getResourceKey)

  while (true) {
    await sleep(2000 + 500 * loops)
    loops += 1

    const statuses = await checkResourceStatuses({
      api,
      namespace,
      manifests: Object.values(pendingResources),
      log,
      waitForJobs,
    })

    for (const status of statuses) {
      const key = getResourceKey(status.resource)

      const lastMessage = results[key]?.lastMessage

      results[key] = status

      // Avoid unnecessary polling
      if (status.state === "ready") {
        delete pendingResources[key]
      }

      const resource = status.resource
      const statusMessage = `${resource.kind} ${resource.metadata.name} is "${status.state}"`

      const statusLogMsg = `Status of ${statusMessage}`
      emitLog(statusLogMsg)

      if (status.state === "unhealthy") {
        let msg = `Error deploying ${logContext || "resources"}: ${status.lastMessage || statusMessage}`

        if (status.logs) {
          msg += "\n\n" + status.logs
        }

        emitLog(msg)
        throw new DeploymentResourceStatusError({
          message: msg,
          status,
        })
      }

      if (status.lastMessage && status.lastMessage !== lastMessage) {
        const statusUpdateLogMsg = `${getResourceKey(status.resource)}: ${status.lastMessage}`
        if (status.warning) {
          statusLine.warn(statusUpdateLogMsg)
        }
        emitLog(statusUpdateLogMsg)
      }
    }

    const combinedStates = combineStates(statuses.map((s) => s.state))

    // Note: "stopped" is a normal state for Pods, which run to completion
    if (combinedStates === "ready" || combinedStates === "stopped") {
      break
    }

    const now = new Date().getTime()

    if (now - startTime > timeoutSec * 1000) {
      const deploymentErrMsg = deline`
        Timed out waiting for ${logContext || "resources"} to deploy after ${timeoutSec} seconds
      `
      emitLog(deploymentErrMsg)
      throw new DeploymentError({ message: deploymentErrMsg })
    }
  }

  const readyMsg = `Resources ready`
  emitLog(readyMsg)

  return Object.values(results)
}

interface ComparisonResult {
  state: DeployState
  remoteResources: KubernetesResource[]
  deployedMode: ActionMode
  /**
   * These resources have changes in `spec.selector`, and would need to be deleted before redeploying (since Kubernetes
   * doesn't allow updates to immutable fields).
   */
  selectorChangedResourceKeys: string[]
}

// The spec comparison & normalization code below is laborious, but it's worth being thorough here.

// Constants for Kubernetes default values
const K8S_DEFAULTS = {
  service: {
    sessionAffinity: "None",
    type: "ClusterIP",
  },
  workload: {
    minReadySeconds: [0, "0"],
    hostNetwork: [false, "false"],
  },
  deployment: {
    revisionHistoryLimit: [10, "10"],
    progressDeadlineSeconds: [600, "600"],
  },
  statefulSet: {
    revisionHistoryLimit: [10, "10"],
  },
  daemonSet: {
    revisionHistoryLimit: [10, "10"],
    minReadySeconds: [0, "0"],
  },
  pod: {
    restartPolicy: "Always",
    dnsPolicy: "ClusterFirst",
    schedulerName: "default-scheduler",
    terminationGracePeriodSeconds: [30, "30"],
    enableServiceLinks: [true, "true"],
  },
  container: {
    terminationMessagePath: "/dev/termination-log",
    terminationMessagePolicy: "File",
    portProtocol: "TCP",
  },
} as const

// Server-managed metadata fields that should be ignored in comparisons
const SERVER_MANAGED_METADATA_FIELDS = [
  "resourceVersion",
  "uid",
  "generation",
  "selfLink",
  "creationTimestamp",
  "managedFields",
  "deletionTimestamp",
  "deletionGracePeriodSeconds",
] as const

/**
 * Determines if deploying the manifest would result in a spec change that triggers a new generation
 * (and thus potentially new containers being spun up).
 *
 * This function normalizes both the manifest and deployed resource to account for Kubernetes API
 * eccentricities (default values, omitted properties, etc.) before comparing their specs.
 *
 * @param manifest - The local Kubernetes manifest to deploy
 * @param deployedResource - The matching resource fetched from the cluster
 * @returns true if the spec has changed and would increment generation, false otherwise
 */
export function specChanged({
  manifest,
  deployedResource,
}: {
  manifest: KubernetesResource
  deployedResource: KubernetesResource
}): boolean {
  // Clone to avoid mutating the original objects
  let normalizedManifest = cloneDeep(manifest)
  let normalizedDeployed = cloneDeep(deployedResource)

  normalizedManifest = convertNumericToString(normalizedManifest)
  normalizedDeployed = convertNumericToString(normalizedDeployed)

  normalizeApiVersionAndNamespace(normalizedManifest, normalizedDeployed)

  // Normalize resource-type-specific defaults
  if (normalizedManifest.kind === "Service") {
    normalizeServiceDefaults(normalizedManifest, normalizedDeployed)
  }

  if (normalizedManifest.kind === "Ingress") {
    normalizeIngressDefaults(normalizedManifest, normalizedDeployed)
  }

  if (isWorkloadKind(normalizedManifest.kind)) {
    normalizeWorkloadDefaults(normalizedManifest, normalizedDeployed)
  }

  if (normalizedManifest.kind === "Pod") {
    if (normalizedManifest.spec) {
      normalizeContainerDefaults(normalizedManifest.spec, normalizedDeployed.spec)
    }
  }

  // Clean up metadata and annotations
  normalizedManifest = <KubernetesResource>removeNullAndUndefined(normalizedManifest)
  normalizedDeployed = <KubernetesResource>removeNullAndUndefined(normalizedDeployed)
  normalizedManifest = removeEmptyEnvValues(normalizedManifest)
  normalizedDeployed = removeEmptyEnvValues(normalizedDeployed)

  removeServerManagedMetadata(normalizedManifest)
  removeServerManagedMetadata(normalizedDeployed)
  removeGardenAnnotations(normalizedManifest)
  removeGardenAnnotations(normalizedDeployed)

  // Finally, compare the specs
  const hasChanged = !isEqual(normalizedManifest.spec, normalizedDeployed.spec)

  return hasChanged
}

/**
 * Convert all numeric values to strings for consistent comparison
 */
function convertNumericToString(resource: KubernetesResource): KubernetesResource {
  return <KubernetesResource>deepMap(resource, (v) => (typeof v === "number" ? v.toString() : v))
}

/**
 * Harmonize API version and namespace between manifest and deployed resource
 */
function normalizeApiVersionAndNamespace(manifest: KubernetesResource, deployed: KubernetesResource): void {
  // API version may change during deployment
  manifest.apiVersion = deployed.apiVersion

  // Namespace is silently dropped for non-namespaced resources
  if (manifest.metadata?.namespace && deployed.metadata?.namespace === undefined) {
    delete manifest.metadata.namespace
  }
}

function isWorkloadKind(kind: string): boolean {
  return kind === "Deployment" || kind === "DaemonSet" || kind === "StatefulSet"
}

function normalizeServiceDefaults(manifest: KubernetesResource, deployed: KubernetesResource): void {
  // These fields are server-managed and should be removed from both sides for comparison
  const serverManagedServiceFields = [
    "clusterIP",
    "clusterIPs",
    "ipFamilies",
    "ipFamilyPolicy",
    "internalTrafficPolicy",
    "sessionAffinityConfig",
  ]

  for (const field of serverManagedServiceFields) {
    if (manifest.spec?.[field] !== undefined) {
      delete manifest.spec[field]
    }
    if (deployed.spec?.[field] !== undefined) {
      delete deployed.spec[field]
    }
  }

  // Remove defaults that match K8S_DEFAULTS.service
  const removeIfDefault = (resource: KubernetesResource, field: string, defaultValue: string) => {
    if (resource.spec?.[field] === defaultValue) {
      delete resource.spec[field]
    }
  }

  removeIfDefault(manifest, "sessionAffinity", K8S_DEFAULTS.service.sessionAffinity)
  removeIfDefault(deployed, "sessionAffinity", K8S_DEFAULTS.service.sessionAffinity)
  removeIfDefault(manifest, "type", K8S_DEFAULTS.service.type)
  removeIfDefault(deployed, "type", K8S_DEFAULTS.service.type)
}

/**
 * Normalize Ingress-specific defaults that Kubernetes adds
 */
function normalizeIngressDefaults(manifest: KubernetesResource, deployed: KubernetesResource): void {
  // Kubernetes adds default pathType "Prefix" to Ingress paths if not specified
  // We need to check if ANY path in the manifest has pathType specified
  const manifestHasPathType = manifest.spec?.rules?.some((rule: any) =>
    rule.http?.paths?.some((path: any) => path.pathType !== undefined)
  )

  // If manifest doesn't specify pathType anywhere, remove default "Prefix" from deployed
  if (!manifestHasPathType && deployed.spec?.rules) {
    for (const rule of deployed.spec.rules) {
      if (rule.http?.paths && Array.isArray(rule.http.paths)) {
        for (const path of rule.http.paths) {
          if (path.pathType === "Prefix") {
            delete path.pathType
          }
        }
      }
    }
  }
}

/**
 * Normalize Workload-specific defaults (Deployment, DaemonSet, StatefulSet)
 */
function normalizeWorkloadDefaults(manifest: KubernetesResource, deployed: KubernetesResource): void {
  const removeIfMatchesDefault = (resource: KubernetesResource, field: string, defaultValues: readonly any[]) => {
    if (resource.spec && defaultValues.includes(resource.spec[field])) {
      delete resource.spec[field]
    }
  }

  // Common workload defaults (applies to all workload types)
  removeIfMatchesDefault(manifest, "minReadySeconds", K8S_DEFAULTS.workload.minReadySeconds)
  removeIfMatchesDefault(deployed, "minReadySeconds", K8S_DEFAULTS.workload.minReadySeconds)

  // hostNetwork in template spec
  const removeHostNetworkDefault = (resource: KubernetesResource) => {
    if (
      resource.spec?.template?.spec?.hostNetwork &&
      K8S_DEFAULTS.workload.hostNetwork.includes(resource.spec.template.spec.hostNetwork)
    ) {
      delete resource.spec.template.spec.hostNetwork
    }
  }
  removeHostNetworkDefault(manifest)
  removeHostNetworkDefault(deployed)

  // Deployment-specific defaults
  if (manifest.kind === "Deployment") {
    removeIfMatchesDefault(manifest, "revisionHistoryLimit", K8S_DEFAULTS.deployment.revisionHistoryLimit)
    removeIfMatchesDefault(deployed, "revisionHistoryLimit", K8S_DEFAULTS.deployment.revisionHistoryLimit)
    removeIfMatchesDefault(manifest, "progressDeadlineSeconds", K8S_DEFAULTS.deployment.progressDeadlineSeconds)
    removeIfMatchesDefault(deployed, "progressDeadlineSeconds", K8S_DEFAULTS.deployment.progressDeadlineSeconds)

    // Remove default strategy from deployed if it matches the K8s default
    // Default strategy for Deployment is RollingUpdate with maxUnavailable=25%, maxSurge=25%
    if (deployed.spec?.strategy) {
      const strategy = deployed.spec.strategy
      const isDefaultStrategy =
        strategy.type === "RollingUpdate" &&
        strategy.rollingUpdate?.maxUnavailable === "25%" &&
        strategy.rollingUpdate?.maxSurge === "25%"

      if (isDefaultStrategy && !manifest.spec?.strategy) {
        delete deployed.spec.strategy
      }
    }
  }

  // StatefulSet-specific defaults
  if (manifest.kind === "StatefulSet") {
    removeIfMatchesDefault(manifest, "revisionHistoryLimit", K8S_DEFAULTS.statefulSet.revisionHistoryLimit)
    removeIfMatchesDefault(deployed, "revisionHistoryLimit", K8S_DEFAULTS.statefulSet.revisionHistoryLimit)

    // Remove default updateStrategy from deployed if it matches the K8s default
    // Default updateStrategy for StatefulSet is RollingUpdate with partition=0
    // Note: partition may be a string after convertNumericToString()
    if (deployed.spec?.updateStrategy) {
      const strategy = deployed.spec.updateStrategy
      const partition = strategy.rollingUpdate?.partition
      const isDefaultStrategy =
        strategy.type === "RollingUpdate" && (partition === 0 || partition === "0" || partition === undefined)

      if (isDefaultStrategy && !manifest.spec?.updateStrategy) {
        delete deployed.spec.updateStrategy
      }
    }

    // Remove default podManagementPolicy from deployed if it matches K8s default
    // Default is "OrderedReady"
    if (deployed.spec?.podManagementPolicy === "OrderedReady" && !manifest.spec?.podManagementPolicy) {
      delete deployed.spec.podManagementPolicy
    }
  }

  // DaemonSet-specific defaults
  if (manifest.kind === "DaemonSet") {
    removeIfMatchesDefault(manifest, "revisionHistoryLimit", K8S_DEFAULTS.daemonSet.revisionHistoryLimit)
    removeIfMatchesDefault(deployed, "revisionHistoryLimit", K8S_DEFAULTS.daemonSet.revisionHistoryLimit)
  }

  // Handle pod template spec defaults
  if (manifest.spec?.template?.spec) {
    normalizeContainerDefaults(manifest.spec.template.spec, deployed.spec?.template?.spec)
  }
}

/**
 * Remove server-managed metadata fields
 */
function removeServerManagedMetadata(resource: KubernetesResource): void {
  // Remove server-managed fields from top-level metadata
  for (const field of SERVER_MANAGED_METADATA_FIELDS) {
    if (resource.metadata?.[field]) {
      delete resource.metadata[field]
    }
  }

  // Also remove from pod template metadata in workloads
  if (resource.spec?.template?.metadata) {
    for (const field of SERVER_MANAGED_METADATA_FIELDS) {
      if (resource.spec.template.metadata[field]) {
        delete resource.spec.template.metadata[field]
      }
    }
  }
}

/**
 * Remove Garden-specific annotations that don't affect spec semantics
 */
function removeGardenAnnotations(resource: KubernetesResource): void {
  if (resource.metadata?.annotations) {
    resource.metadata.annotations = pickBy(
      resource.metadata.annotations,
      (_value, key) => !key.startsWith("garden.io/")
    )
  }
  // Also check template annotations for workloads
  if (resource.spec?.template?.metadata?.annotations) {
    resource.spec.template.metadata.annotations = pickBy(
      resource.spec.template.metadata.annotations,
      (_value, key) => !key.startsWith("garden.io/")
    )
  }
}

/**
 * Normalizes container-related defaults in a pod spec to match what K8s returns
 */
function normalizeContainerDefaults(manifestPodSpec: any, deployedPodSpec: any) {
  // Add pod-level defaults to manifest if K8s added them to deployed
  const podDefaults = [
    { field: "restartPolicy", defaultValue: K8S_DEFAULTS.pod.restartPolicy },
    { field: "dnsPolicy", defaultValue: K8S_DEFAULTS.pod.dnsPolicy },
    { field: "schedulerName", defaultValue: K8S_DEFAULTS.pod.schedulerName },
  ]

  for (const { field, defaultValue } of podDefaults) {
    if (manifestPodSpec[field] === undefined && deployedPodSpec?.[field] === defaultValue) {
      manifestPodSpec[field] = defaultValue
    }
  }

  // Remove defaults that match - delete from both if they're the same default value
  const removeMatchingDefaults = (field: string, defaultValues: readonly any[]) => {
    if (defaultValues.includes(manifestPodSpec[field])) {
      const deployedValue = deployedPodSpec?.[field]
      if (deployedValue === undefined || defaultValues.includes(deployedValue)) {
        delete manifestPodSpec[field]
        if (deployedPodSpec) {
          delete deployedPodSpec[field]
        }
      }
    } else if (manifestPodSpec[field] === undefined && deployedPodSpec?.[field] !== undefined) {
      // If manifest doesn't have the field but deployed has a default value, remove from deployed
      if (defaultValues.includes(deployedPodSpec[field])) {
        delete deployedPodSpec[field]
      }
    }
  }

  removeMatchingDefaults("terminationGracePeriodSeconds", K8S_DEFAULTS.pod.terminationGracePeriodSeconds)
  removeMatchingDefaults("enableServiceLinks", K8S_DEFAULTS.pod.enableServiceLinks)

  // Remove empty securityContext objects
  if (
    manifestPodSpec.securityContext === undefined &&
    deployedPodSpec?.securityContext &&
    Object.keys(deployedPodSpec.securityContext).length === 0
  ) {
    delete deployedPodSpec.securityContext
  }

  // Normalize container arrays
  normalizeContainers(manifestPodSpec.containers, deployedPodSpec?.containers)
  normalizeContainers(manifestPodSpec.initContainers, deployedPodSpec?.initContainers)
}

/**
 * Normalize container-specific defaults
 */
function normalizeContainers(manifestContainers: any[], deployedContainers: any[] | undefined) {
  if (!manifestContainers) return

  // Build a map of deployed containers by name for reliable matching
  const deployedContainersByName = new Map<string, any>()
  if (deployedContainers) {
    for (const container of deployedContainers) {
      if (container.name) {
        deployedContainersByName.set(container.name, container)
      }
    }
  }

  for (const manifestContainer of manifestContainers) {
    const deployedContainer = manifestContainer.name ? deployedContainersByName.get(manifestContainer.name) : undefined

    // imagePullPolicy defaults based on image tag
    if (manifestContainer.imagePullPolicy === undefined) {
      // Determine if image uses :latest tag (explicit or implicit)
      const image = manifestContainer.image
      const hasLatestTag = image?.endsWith(":latest") || (image && !image.includes(":") && !image.includes("@"))
      manifestContainer.imagePullPolicy = hasLatestTag ? "Always" : "IfNotPresent"
    }

    // Remove container defaults that match K8S_DEFAULTS.container
    const containerDefaults = [
      { field: "terminationMessagePath", defaultValue: K8S_DEFAULTS.container.terminationMessagePath },
      { field: "terminationMessagePolicy", defaultValue: K8S_DEFAULTS.container.terminationMessagePolicy },
    ]

    for (const { field, defaultValue } of containerDefaults) {
      if (manifestContainer[field] === defaultValue || !manifestContainer[field]) {
        delete manifestContainer[field]
      }
      if (deployedContainer && (deployedContainer[field] === defaultValue || !deployedContainer[field])) {
        delete deployedContainer[field]
      }
    }

    // Normalize port protocols
    normalizePortProtocols(manifestContainer.ports)
    if (deployedContainer) {
      normalizePortProtocols(deployedContainer.ports)
    }

    // Normalize empty resource requests/limits
    normalizeContainerResources(manifestContainer)
    if (deployedContainer) {
      normalizeContainerResources(deployedContainer)
    }
  }
}

/**
 * Normalize port protocol defaults (remove if TCP)
 */
function normalizePortProtocols(ports: any[] | undefined) {
  if (!ports) return

  for (const port of ports) {
    if (port.protocol === K8S_DEFAULTS.container.portProtocol || !port.protocol) {
      delete port.protocol
    }
  }
}

/**
 * Remove empty resource requests/limits
 */
function normalizeContainerResources(container: any) {
  if (!container.resources) return

  if (container.resources.requests && Object.keys(container.resources.requests).length === 0) {
    delete container.resources.requests
  }
  if (container.resources.limits && Object.keys(container.resources.limits).length === 0) {
    delete container.resources.limits
  }
  if (Object.keys(container.resources).length === 0) {
    delete container.resources
  }
}

/**
 * Check if each of the given Kubernetes objects matches what's installed in the cluster
 */
export async function compareDeployedResources({
  ctx,
  api,
  namespace,
  manifests,
  log,
}: {
  ctx: KubernetesPluginContext
  api: KubeApi
  namespace: string
  manifests: KubernetesResource[]
  log: Log
}): Promise<ComparisonResult> {
  // Unroll any `List` resource types
  manifests = flatten(manifests.map((r: any) => (r.apiVersion === "v1" && r.kind === "List" ? r.items : [r])))

  // Check if any resources are missing from the cluster.
  const deployedResources = await getDeployedResources({ ctx, log, manifests })
  const manifestsMap = keyBy(manifests, (m) => getResourceKey(m))
  const manifestKeys = Object.keys(manifestsMap)
  const deployedMap = keyBy(deployedResources, (m) => getResourceKey(m))

  const result: ComparisonResult = {
    state: "unknown",
    remoteResources: <KubernetesResource[]>deployedResources.filter((o) => o !== null),
    deployedMode: "default",
    selectorChangedResourceKeys: detectChangedSpecSelector(manifestsMap, deployedMap),
  }

  const logDescription = (resource: KubernetesResource) => getResourceKey(resource)

  const missingObjectNames = manifestKeys.filter((k) => !deployedMap[k]).map((k) => logDescription(manifestsMap[k]))

  if (missingObjectNames.length === manifests.length) {
    // All resources missing.
    log.verbose(`All resources missing from cluster`)
    result.state = "missing"
    return result
  } else if (missingObjectNames.length > 0) {
    // One or more objects missing.
    log.verbose(`Resource(s) ${missingObjectNames.join(", ")} missing from cluster`)
    result.state = "outdated"
    return result
  }

  // From here, the state can only be "ready" or "outdated", so we proceed to compare the old & new specs.
  log.debug(`Getting currently deployed resource statuses...`)

  const deployedObjectStatuses: ResourceStatus[] = await Promise.all(
    deployedResources.map(async (resource) =>
      resolveResourceStatus({ api, namespace, waitForJobs: false, resource, log })
    )
  )

  const resolvedState = resolveResourceStatuses(log, deployedObjectStatuses)

  if (resolvedState !== "ready") {
    result.state = resolvedState
    return result
  }

  log.debug(`Comparing expected and deployed resources...`)

  for (const key of Object.keys(manifestsMap)) {
    const manifest = cloneDeep(manifestsMap[key])
    const deployedResource = deployedMap[key]

    if (!manifest.metadata.annotations) {
      manifest.metadata.annotations = {}
    }

    // Discard any last applied config from the input manifest
    if (manifest.metadata?.annotations?.[k8sManifestHashAnnotationKey]) {
      delete manifest.metadata?.annotations?.[k8sManifestHashAnnotationKey]
    }
    if (manifest.spec?.template?.metadata?.annotations?.[k8sManifestHashAnnotationKey]) {
      delete manifest.spec?.template?.metadata?.annotations?.[k8sManifestHashAnnotationKey]
    }

    if (deployedResource && isWorkloadResource(deployedResource)) {
      if (isConfiguredForSyncMode(deployedResource)) {
        result.deployedMode = "sync"
      }
    }

    // Start by checking for "last applied configuration" annotations and comparing against those.
    // This can be more accurate than comparing against resolved resources.
    if (deployedResource.metadata && deployedResource.metadata.annotations) {
      const lastAppliedHashed = deployedResource.metadata.annotations[k8sManifestHashAnnotationKey]

      // The new manifest matches the last applied manifest
      if (lastAppliedHashed && (await hashManifest(manifest)) === lastAppliedHashed) {
        continue
      }

      // Fallback to comparing against kubectl's last-applied-configuration annotation
      const lastApplied = deployedResource.metadata.annotations["kubectl.kubernetes.io/last-applied-configuration"]
      if (lastApplied && stableStringify(manifest) === lastApplied) {
        continue
      }
    }

    if (specChanged({ manifest, deployedResource })) {
      log.debug(`Resource ${manifest.metadata.name} spec has changed`)
      log.silly(() => diffString(deployedResource, manifest))
      result.state = "outdated"
      return result
    }
  }

  log.debug(`All resources match.`)

  result.state = "ready"
  return result
}

export function isConfiguredForSyncMode(resource: SyncableResource): boolean {
  return resource.metadata.annotations?.[gardenAnnotationKey("mode")] === "sync"
}

function isWorkloadResource(resource: KubernetesResource): resource is KubernetesWorkload {
  return (
    resource.kind === "Deployment" ||
    resource.kind === "DaemonSet" ||
    resource.kind === "StatefulSet" ||
    resource.kind === "ReplicaSet"
  )
}

type KubernetesResourceMap = { [key: string]: KubernetesResource }

function detectChangedSpecSelector(manifestsMap: KubernetesResourceMap, deployedMap: KubernetesResourceMap): string[] {
  const manifestKeys = Object.keys(manifestsMap)
  const changedKeys: string[] = []
  for (const k of manifestKeys) {
    const manifest = manifestsMap[k]
    const deployedResource = deployedMap[k]
    if (
      deployedResource && // If no corresponding resource to the local manifest has been deployed, this will be undefined.
      isWorkloadResource(manifest) &&
      isWorkloadResource(deployedResource) &&
      !isEqual(manifest.spec.selector, deployedResource.spec.selector)
    ) {
      changedKeys.push(getResourceKey(manifest))
    }
  }
  return changedKeys
}

export async function getDeployedResource<ResourceKind extends KubernetesObject>(
  ctx: PluginContext,
  provider: KubernetesProvider,
  manifest: KubernetesResource<ResourceKind>,
  log: Log
): Promise<KubernetesResource<ResourceKind> | null> {
  const api = await KubeApi.factory(log, ctx, provider)
  const k8sCtx = ctx as KubernetesPluginContext
  const namespace = manifest.metadata?.namespace || (await getAppNamespace(k8sCtx, log, provider))

  try {
    const res = await api.readBySpec({ namespace, manifest, log })
    return <KubernetesResource<ResourceKind>>res
  } catch (err) {
    if (!(err instanceof KubernetesError)) {
      throw err
    }
    if (err.responseStatusCode === 404) {
      return null
    } else {
      throw err
    }
  }
}

export async function getDeployedResources<ResourceKind extends KubernetesObject>({
  ctx,
  manifests,
  log,
}: {
  ctx: KubernetesPluginContext
  manifests: KubernetesResource<ResourceKind>[]
  log: Log
}): Promise<KubernetesResource<ResourceKind>[]> {
  const maybeDeployedObjects = await Promise.all(
    manifests.map(async (resource) => getDeployedResource(ctx, ctx.provider, resource, log))
  )
  return maybeDeployedObjects.filter(isTruthy)
}

/**
 * Recursively removes all null and undefined value properties from objects
 */
function removeNullAndUndefined<T>(value: T | Iterable<T>): T | Iterable<T> | { [K in keyof T]: T[K] } {
  if (isArray(value)) {
    return value.map(removeNullAndUndefined)
  } else if (isPlainObject(value)) {
    return <{ [K in keyof T]: T[K] }>mapValues(
      pickBy(<any>value, (v) => v !== null && v !== undefined),
      removeNullAndUndefined
    )
  } else {
    return value
  }
}

/**
 * Normalize Kubernetes container specs by removing empty environment variable values. We need
 * this because the Kubernetes API strips out these empty values.
 *
 * That is, something like { "name": FOO, "value": "" } becomes { "name": FOO } when
 * we read the deployed resource from the K8s API.
 *
 * Calling this function ensures a given manifest will look the same as actual deployed resource.
 */
function removeEmptyEnvValues(resource: KubernetesResource): KubernetesResource {
  if (resource.spec?.template?.spec?.containers && resource.spec.template.spec.containers.length > 0) {
    const containerSpecs = resource.spec.template.spec.containers.map((container: V1Container) => {
      const env = container.env?.map((envKvPair) => {
        return envKvPair.value === "" ? omit(envKvPair, "value") : envKvPair
      })
      if (env) {
        container["env"] = env
      }
      return container
    })
    resource.spec.template.spec["containers"] = containerSpecs
  }
  return resource
}
