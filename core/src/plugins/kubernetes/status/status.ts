/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { diffString } from "json-diff"
import { DeploymentError } from "../../../exceptions"
import { PluginContext } from "../../../plugin-context"
import { ServiceState, combineStates } from "../../../types/service"
import { sleep, deepMap } from "../../../util/util"
import { KubeApi } from "../api"
import { getAppNamespace } from "../namespace"
import Bluebird from "bluebird"
import { KubernetesResource, KubernetesServerResource, BaseResource } from "../types"
import { zip, isArray, isPlainObject, pickBy, mapValues, flatten, cloneDeep, omit } from "lodash"
import { KubernetesProvider, KubernetesPluginContext } from "../config"
import { isSubset } from "../../../util/is-subset"
import { LogEntry } from "../../../logger/log-entry"
import {
  V1ReplicationController,
  V1ReplicaSet,
  V1Pod,
  V1PersistentVolumeClaim,
  V1Service,
  V1Container,
} from "@kubernetes/client-node"
import dedent = require("dedent")
import { getPods, hashManifest } from "../util"
import { checkWorkloadStatus } from "./workload"
import { checkWorkloadPodStatus } from "./pod"
import { deline, gardenAnnotationKey, stableStringify } from "../../../util/string"
import { HotReloadableResource } from "../hot-reload/hot-reload"

export interface ResourceStatus<T = BaseResource> {
  state: ServiceState
  resource: KubernetesServerResource<T>
  lastMessage?: string
  warning?: true
  logs?: string
}

export interface StatusHandlerParams<T = BaseResource> {
  api: KubeApi
  namespace: string
  resource: KubernetesServerResource<T>
  log: LogEntry
  resourceVersion?: number
}

interface StatusHandler<T = BaseResource> {
  (params: StatusHandlerParams<T>): Promise<ResourceStatus<T>>
}

const pvcPhaseMap: { [key: string]: ServiceState } = {
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
    const state: ServiceState = pvcPhaseMap[pvc.status.phase!] || "unknown"
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
}

/**
 * Check if the specified Kubernetes objects are deployed and fully rolled out
 */
export async function checkResourceStatuses(
  api: KubeApi,
  namespace: string,
  manifests: KubernetesResource[],
  log: LogEntry
): Promise<ResourceStatus[]> {
  return Bluebird.map(manifests, async (manifest) => {
    return checkResourceStatus(api, namespace, manifest, log)
  })
}

export async function checkResourceStatus(
  api: KubeApi,
  namespace: string,
  manifest: KubernetesResource,
  log: LogEntry
) {
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
      return { state: <ServiceState>"missing", resource: manifest }
    } else {
      throw err
    }
  }

  let status: ResourceStatus
  if (handler) {
    status = await handler({ api, namespace, resource, log, resourceVersion })
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
  serviceName?: string
  resources: KubernetesResource[]
  log: LogEntry
  timeoutSec: number
}

/**
 * Wait until the rollout is complete for each of the given Kubernetes objects
 */
export async function waitForResources({
  namespace,
  ctx,
  provider,
  serviceName,
  resources,
  log,
  timeoutSec,
}: WaitParams) {
  let loops = 0
  let lastMessage: string | undefined
  const startTime = new Date().getTime()
  const emitLog = (msg: string) =>
    ctx.events.emit("log", { timestamp: new Date().getTime(), data: Buffer.from(msg, "utf-8") })

  const waitingMsg = `Waiting for resources to be ready...`
  const statusLine = log.info({
    symbol: "info",
    section: serviceName,
    msg: waitingMsg,
  })
  emitLog(waitingMsg)

  if (resources.length === 0) {
    const noResourcesMsg = `No resources to wait`
    emitLog(noResourcesMsg)
    statusLine.setState({ symbol: "info", section: serviceName, msg: noResourcesMsg })
    return []
  }

  const api = await KubeApi.factory(log, ctx, provider)
  let statuses: ResourceStatus[]

  while (true) {
    await sleep(2000 + 500 * loops)
    loops += 1

    statuses = await checkResourceStatuses(api, namespace, resources, log)

    for (const status of statuses) {
      const resource = status.resource
      const statusMessage = `${resource.kind} ${resource.metadata.name} is "${status.state}"`

      const statusLogMsg = `Status of ${statusMessage}`
      log.debug(statusLogMsg)
      emitLog(statusLogMsg)

      if (status.state === "unhealthy") {
        let msg = `Error deploying ${serviceName || "resources"}: ${status.lastMessage || statusMessage}`

        if (status.logs) {
          msg += "\n\n" + status.logs
        }

        emitLog(msg)
        throw new DeploymentError(msg, {
          serviceName,
          status,
        })
      }

      if (status.lastMessage && (!lastMessage || status.lastMessage !== lastMessage)) {
        lastMessage = status.lastMessage
        const symbol = status.warning === true ? "warning" : "info"
        const statusUpdateLogMsg = `${status.resource.kind}/${status.resource.metadata.name}: ${status.lastMessage}`
        statusLine.setState({
          symbol,
          msg: statusUpdateLogMsg,
        })
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
        Timed out waiting for ${serviceName || "resources"} to deploy after ${timeoutSec} seconds
      `
      emitLog(deploymentErrMsg)
      throw new DeploymentError(deploymentErrMsg, { statuses })
    }
  }

  const readyMsg = `Resources ready`
  emitLog(readyMsg)
  statusLine.setState({ symbol: "info", section: serviceName, msg: readyMsg })

  return statuses
}

interface ComparisonResult {
  state: ServiceState
  remoteResources: KubernetesResource[]
  deployedWithDevMode: boolean
  deployedWithHotReloading: boolean
  deployedWithLocalMode: boolean
}

/**
 * Check if each of the given Kubernetes objects matches what's installed in the cluster
 */
export async function compareDeployedResources(
  ctx: KubernetesPluginContext,
  api: KubeApi,
  namespace: string,
  manifests: KubernetesResource[],
  log: LogEntry
): Promise<ComparisonResult> {
  // Unroll any `List` resource types
  manifests = flatten(manifests.map((r: any) => (r.apiVersion === "v1" && r.kind === "List" ? r.items : [r])))

  // Check if any resources are missing from the cluster.
  const maybeDeployedObjects = await Bluebird.map(manifests, (resource) =>
    getDeployedResource(ctx, ctx.provider, resource, log)
  )
  const deployedResources = <KubernetesResource[]>maybeDeployedObjects.filter((o) => o !== null)

  const result: ComparisonResult = {
    state: "unknown",
    remoteResources: <KubernetesResource[]>deployedResources.filter((o) => o !== null),
    deployedWithDevMode: false,
    deployedWithHotReloading: false,
    deployedWithLocalMode: false,
  }

  const logDescription = (resource: KubernetesResource) => `${resource.kind}/${resource.metadata.name}`

  const missingObjectNames = zip(manifests, maybeDeployedObjects)
    .filter(([_, deployed]) => !deployed)
    .map(([resource, _]) => logDescription(resource!))

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

  const deployedObjectStatuses: ResourceStatus[] = await Bluebird.map(deployedResources, async (resource) =>
    checkResourceStatus(api, namespace, resource, log)
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

  log.verbose(`Comparing expected and deployed resources...`)

  for (let [newManifest, deployedResource] of zip(manifests, deployedResources) as KubernetesResource[][]) {
    let manifest = cloneDeep(newManifest)

    if (!manifest.metadata.annotations) {
      manifest.metadata.annotations = {}
    }

    // Discard any last applied config from the input manifest
    if (manifest.metadata.annotations[gardenAnnotationKey("manifest-hash")]) {
      delete manifest.metadata.annotations[gardenAnnotationKey("manifest-hash")]
    }

    if (manifest.kind === "DaemonSet" || manifest.kind === "Deployment" || manifest.kind === "StatefulSet") {
      if (isConfiguredForDevMode(<HotReloadableResource>manifest)) {
        result.deployedWithDevMode = true
      }
      if (isConfiguredForHotReloading(<HotReloadableResource>manifest)) {
        result.deployedWithHotReloading = true
      }
      if (isConfiguredForLocalMode(<HotReloadableResource>manifest)) {
        result.deployedWithLocalMode = true
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

    // clean null values
    manifest = <KubernetesResource>removeNull(manifest)
    // The Kubernetes API currently strips out environment variables values so we remove them
    // from the manifests as well
    manifest = removeEmptyEnvValues(manifest)
    // ...and from the deployedResource for good measure, in case the K8s API changes.
    deployedResource = removeEmptyEnvValues(deployedResource)

    if (!isSubset(deployedResource, manifest)) {
      if (manifest) {
        log.verbose(`Resource ${manifest.metadata.name} is not a superset of deployed resource`)
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

  log.verbose(`All resources match.`)

  result.state = "ready"
  return result
}

export function isConfiguredForDevMode(resource: HotReloadableResource): boolean {
  return resource.metadata.annotations?.[gardenAnnotationKey("dev-mode")] === "true"
}

export function isConfiguredForHotReloading(resource: HotReloadableResource): boolean {
  return resource.metadata.annotations?.[gardenAnnotationKey("hot-reload")] === "true"
}

export function isConfiguredForLocalMode(resource: HotReloadableResource): boolean {
  return resource.metadata.annotations?.[gardenAnnotationKey("local-mode")] === "true"
}

export async function getDeployedResource(
  ctx: PluginContext,
  provider: KubernetesProvider,
  resource: KubernetesResource,
  log: LogEntry
): Promise<KubernetesResource | null> {
  const api = await KubeApi.factory(log, ctx, provider)
  const namespace = resource.metadata?.namespace || (await getAppNamespace(ctx, log, provider))

  try {
    const res = await api.readBySpec({ namespace, manifest: resource, log })
    return <KubernetesResource>res
  } catch (err) {
    if (err.statusCode === 404) {
      return null
    } else {
      throw err
    }
  }
}

/**
 * Recursively removes all null value properties from objects
 */
function removeNull<T>(value: T | Iterable<T>): T | Iterable<T> | { [K in keyof T]: T[K] } {
  if (isArray(value)) {
    return value.map(removeNull)
  } else if (isPlainObject(value)) {
    return <{ [K in keyof T]: T[K] }>mapValues(
      pickBy(<any>value, (v) => v !== null),
      removeNull
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
