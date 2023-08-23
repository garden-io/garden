/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { diffString } from "json-diff"
import { DeploymentError } from "../../../exceptions"
import { PluginContext } from "../../../plugin-context"
import { KubeApi } from "../api"
import { getAppNamespace } from "../namespace"
import { KubernetesResource, KubernetesServerResource, BaseResource, KubernetesWorkload } from "../types"
import { zip, isArray, isPlainObject, pickBy, mapValues, flatten, cloneDeep, omit, isEqual, keyBy } from "lodash"
import { KubernetesProvider, KubernetesPluginContext } from "../config"
import { isSubset } from "../../../util/is-subset"
import { Log } from "../../../logger/log-entry"
import {
  V1ReplicationController,
  V1ReplicaSet,
  V1Pod,
  V1PersistentVolumeClaim,
  V1Service,
  V1Container,
  KubernetesObject,
  V1Job,
} from "@kubernetes/client-node"
import dedent = require("dedent")
import { getPods, getResourceKey, hashManifest } from "../util"
import { checkWorkloadStatus } from "./workload"
import { checkWorkloadPodStatus } from "./pod"
import { deline, gardenAnnotationKey, stableStringify } from "../../../util/string"
import { SyncableResource } from "../types"
import { ActionMode } from "../../../actions/types"
import { deepMap } from "../../../util/objects"
import { DeployState, combineStates } from "../../../types/service"
import { isTruthy, sleep } from "../../../util/util"

export interface ResourceStatus<T extends BaseResource | KubernetesObject = BaseResource> {
  state: DeployState
  resource: KubernetesServerResource<T>
  lastMessage?: string
  warning?: true
  logs?: string
}

export interface StatusHandlerParams<T extends BaseResource | KubernetesObject = BaseResource> {
  api: KubeApi
  namespace: string
  resource: KubernetesServerResource<T>
  log: Log
  resourceVersion?: number
  waitForJobs?: boolean
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
      await getPods(api, namespace, (<KubernetesServerResource<V1ReplicaSet>>resource).spec.selector!.matchLabels!)
    )
  },

  ReplicationController: async ({ api, namespace, resource }: StatusHandlerParams<V1ReplicationController>) => {
    return checkWorkloadPodStatus(resource, await getPods(api, namespace, resource.spec!.selector!))
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
export async function checkResourceStatuses(
  api: KubeApi,
  namespace: string,
  manifests: KubernetesResource[],
  log: Log,
  waitForJobs?: boolean
): Promise<ResourceStatus[]> {
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
  waitForJobs?: boolean
}) {
  const handler = objHandlers[manifest.kind]

  if (manifest.metadata?.namespace) {
    namespace = manifest.metadata.namespace
  }

  let resource: KubernetesServerResource
  let resourceVersion: number | undefined

  try {
    resource = await api.readBySpec({ namespace, manifest, log })
    resourceVersion = parseInt(resource.metadata.resourceVersion!, 10)
  } catch (err) {
    if (err.statusCode === 404) {
      return { state: <DeployState>"missing", resource: manifest }
    } else {
      throw err
    }
  }

  let status: ResourceStatus
  if (handler) {
    status = await handler({ api, namespace, resource, log, resourceVersion, waitForJobs })
  } else {
    // if there is no explicit handler to check the status, we assume there's no rollout phase to wait for
    status = { state: "ready", resource: manifest }
  }

  return status
}

interface WaitParams {
  namespace: string
  ctx: PluginContext
  provider: KubernetesProvider
  actionName?: string
  resources: KubernetesResource[]
  log: Log
  timeoutSec: number
  waitForJobs?: boolean
}

/**
 * Wait until the rollout is complete for each of the given Kubernetes objects
 */
export async function waitForResources({
  namespace,
  ctx,
  provider,
  actionName,
  resources,
  log,
  timeoutSec,
  waitForJobs,
}: WaitParams) {
  let loops = 0
  const startTime = new Date().getTime()

  const logEventContext = {
    origin: "kubernetes-plugin",
    level: "verbose" as const,
  }

  const emitLog = (msg: string) =>
    ctx.events.emit("log", { timestamp: new Date().toISOString(), msg, ...logEventContext })

  const waitingMsg = `Waiting for resources to be ready...`
  const statusLine = log
    .createLog({
      // TODO: Avoid setting fallback, the action name should be known
      name: actionName || "<kubernetes>",
    })
    .info(waitingMsg)
  emitLog(waitingMsg)

  if (resources.length === 0) {
    const noResourcesMsg = `No resources to wait for`
    emitLog(noResourcesMsg)
    statusLine.info(noResourcesMsg)
    return []
  }

  const api = await KubeApi.factory(log, ctx, provider)

  const results: { [key: string]: ResourceStatus } = {}
  const pendingResources = keyBy(resources, getResourceKey)

  while (true) {
    await sleep(2000 + 500 * loops)
    loops += 1

    const statuses = await checkResourceStatuses(api, namespace, Object.values(pendingResources), log, waitForJobs)

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
      log.debug(statusLogMsg)
      emitLog(statusLogMsg)

      if (status.state === "unhealthy") {
        let msg = `Error deploying ${actionName || "resources"}: ${status.lastMessage || statusMessage}`

        if (status.logs) {
          msg += "\n\n" + status.logs
        }

        emitLog(msg)
        throw new DeploymentError({
          message: msg,
          detail: {
            serviceName: actionName,
            status,
          },
        })
      }

      if (status.lastMessage && status.lastMessage !== lastMessage) {
        const statusUpdateLogMsg = `${getResourceKey(status.resource)}: ${status.lastMessage}`
        if (status.warning) {
          statusLine.warn(statusUpdateLogMsg)
        } else {
          statusLine.info(statusUpdateLogMsg)
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
        Timed out waiting for ${actionName || "resources"} to deploy after ${timeoutSec} seconds
      `
      emitLog(deploymentErrMsg)
      throw new DeploymentError({ message: deploymentErrMsg, detail: { statuses } })
    }
  }

  const readyMsg = `Resources ready`
  emitLog(readyMsg)
  statusLine.info(readyMsg)

  return Object.values(results)
}

interface ComparisonResult {
  state: DeployState
  remoteResources: KubernetesResource[]
  mode: ActionMode
  /**
   * These resources have changes in `spec.selector`, and would need to be deleted before redeploying (since Kubernetes
   * doesn't allow updates to immutable fields).
   */
  selectorChangedResourceKeys: string[]
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
  const maybeDeployedObjects = await Promise.all(
    manifests.map((resource) => getDeployedResource(ctx, ctx.provider, resource, log))
  )
  const deployedResources = <KubernetesResource[]>maybeDeployedObjects.filter((o) => o !== null)
  const manifestsMap = keyBy(manifests, (m) => getResourceKey(m))
  const manifestKeys = Object.keys(manifestsMap)
  const deployedMap = keyBy(deployedResources, (m) => getResourceKey(m))

  const result: ComparisonResult = {
    state: "unknown",
    remoteResources: <KubernetesResource[]>deployedResources.filter((o) => o !== null),
    mode: "default",
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
    deployedResources.map(async (resource) => checkResourceStatus({ api, namespace, manifest: resource, log }))
  )

  const deployedStates = deployedObjectStatuses.map((s) => s.state)
  if (deployedStates.find((s) => s !== "ready")) {
    const descriptions = zip(deployedResources, deployedStates)
      .filter(([_, s]) => s !== "ready")
      .map(([o, s]) => `${logDescription(o!)}: "${s}"`)
      .join("\n")

    log.silly(
      dedent`
      Resource(s) with non-ready status found in the cluster:

      ${descriptions}` + "\n"
    )

    result.state = combineStates(deployedStates)
    return result
  }

  log.debug(`Comparing expected and deployed resources...`)

  for (const key of Object.keys(manifestsMap)) {
    let manifest = cloneDeep(manifestsMap[key])
    let deployedResource = deployedMap[key]

    if (!manifest.metadata.annotations) {
      manifest.metadata.annotations = {}
    }

    // Discard any last applied config from the input manifest
    const hashKey = gardenAnnotationKey("manifest-hash")
    if (manifest.metadata?.annotations?.[hashKey]) {
      delete manifest.metadata?.annotations?.[hashKey]
    }
    if (manifest.spec?.template?.metadata?.annotations?.[hashKey]) {
      delete manifest.spec?.template?.metadata?.annotations?.[hashKey]
    }

    if (isWorkloadResource(manifest)) {
      if (isConfiguredForSyncMode(manifest)) {
        result.mode = "sync"
      }
      if (isConfiguredForLocalMode(manifest)) {
        result.mode = "local"
      }
    }

    // Start by checking for "last applied configuration" annotations and comparing against those.
    // This can be more accurate than comparing against resolved resources.
    if (deployedResource.metadata && deployedResource.metadata.annotations) {
      const lastAppliedHashed = deployedResource.metadata.annotations[gardenAnnotationKey("manifest-hash")]

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

    // to avoid normalization issues, we convert all numeric values to strings and then compare
    manifest = <KubernetesResource>deepMap(manifest, (v) => (typeof v === "number" ? v.toString() : v))
    deployedResource = <KubernetesResource>deepMap(deployedResource, (v) => (typeof v === "number" ? v.toString() : v))

    // the API version may implicitly change when deploying
    manifest.apiVersion = deployedResource.apiVersion

    // the namespace property is silently dropped when added to non-namespaced resources
    if (manifest.metadata?.namespace && deployedResource.metadata?.namespace === undefined) {
      delete manifest.metadata.namespace
    }

    if (!deployedResource.metadata.annotations) {
      deployedResource.metadata.annotations = {}
    }

    // handle auto-filled properties (this is a bit of a design issue in the K8s API)
    if (manifest.kind === "Service" && manifest.spec.clusterIP === "") {
      delete manifest.spec.clusterIP
    }

    // NOTE: this approach won't fly in the long run, but hopefully we can climb out of this mess when
    //       `kubectl diff` is ready, or server-side apply/diff is ready
    if (manifest.kind === "DaemonSet" || manifest.kind === "Deployment" || manifest.kind === "StatefulSet") {
      // NOTE: this approach won't fly in the long run, but hopefully we can climb out of this mess when
      //       `kubectl diff` is ready, or server-side apply/diff is ready

      // handle properties that are omitted in the response because they have the default value
      // (another design issue in the K8s API)
      if (manifest.spec.minReadySeconds === 0) {
        delete manifest.spec.minReadySeconds
      }
      if (manifest.spec.template && manifest.spec.template.spec && manifest.spec.template.spec.hostNetwork === false) {
        delete manifest.spec.template.spec.hostNetwork
      }
    }

    // clean null and undefined values
    manifest = <KubernetesResource>removeNullAndUndefined(manifest)
    // The Kubernetes API currently strips out environment variables values so we remove them
    // from the manifests as well
    manifest = removeEmptyEnvValues(manifest)
    // ...and from the deployedResource for good measure, in case the K8s API changes.
    deployedResource = removeEmptyEnvValues(deployedResource)

    if (!isSubset(deployedResource, manifest)) {
      if (manifest) {
        log.debug(`Resource ${manifest.metadata.name} is not a superset of deployed resource`)
        log.silly(diffString(deployedResource, manifest))
      }
      // console.log(JSON.stringify(resource, null, 4))
      // console.log(JSON.stringify(existingSpec, null, 4))
      // console.log("----------------------------------------------------")
      // throw new Error("bla")
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

export function isConfiguredForLocalMode(resource: SyncableResource): boolean {
  return resource.metadata.annotations?.[gardenAnnotationKey("mode")] === "local"
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
    if (err.statusCode === 404) {
      return null
    } else {
      throw err
    }
  }
}

/**
 * Fetches matching deployed resources from the cluster for the provided array of manifests.
 */
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
