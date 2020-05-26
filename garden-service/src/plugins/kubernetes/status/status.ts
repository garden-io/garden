/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
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
import { KUBECTL_DEFAULT_TIMEOUT } from "../kubectl"
import { getAppNamespace } from "../namespace"
import Bluebird from "bluebird"
import { KubernetesResource, KubernetesServerResource } from "../types"
import { zip, isArray, isPlainObject, pickBy, mapValues, flatten, cloneDeep } from "lodash"
import { KubernetesProvider, KubernetesPluginContext } from "../config"
import { isSubset } from "../../../util/is-subset"
import { LogEntry } from "../../../logger/log-entry"
import {
  V1ReplicationController,
  V1ReplicaSet,
  V1Pod,
  V1PersistentVolumeClaim,
  V1Service,
} from "@kubernetes/client-node"
import dedent = require("dedent")
import { getPods, hashManifest } from "../util"
import { checkWorkloadStatus } from "./workload"
import { checkWorkloadPodStatus } from "./pod"
import { gardenAnnotationKey } from "../../../util/string"
import stableStringify from "json-stable-stringify"

export interface ResourceStatus {
  state: ServiceState
  resource: KubernetesServerResource
  lastMessage?: string
  warning?: true
  logs?: string
}

export interface StatusHandlerParams {
  api: KubeApi
  namespace: string
  resource: KubernetesServerResource
  log: LogEntry
  resourceVersion?: number
}

interface ObjHandler {
  (params: StatusHandlerParams): Promise<ResourceStatus>
}

const pvcPhaseMap: { [key: string]: ServiceState } = {
  Available: "deploying",
  Bound: "ready",
  Released: "stopped",
  Failed: "unhealthy",
}

// Handlers to check the rollout status for K8s objects where that applies.
// Using https://github.com/kubernetes/helm/blob/master/pkg/kube/wait.go as a reference here.
const objHandlers: { [kind: string]: ObjHandler } = {
  DaemonSet: checkWorkloadStatus,
  Deployment: checkWorkloadStatus,
  StatefulSet: checkWorkloadStatus,

  PersistentVolumeClaim: async ({ resource }) => {
    const pvc = <KubernetesServerResource<V1PersistentVolumeClaim>>resource
    const state: ServiceState = pvcPhaseMap[pvc.status.phase!] || "unknown"
    return { state, resource }
  },

  Pod: async ({ resource }) => {
    return checkWorkloadPodStatus(resource, [<KubernetesServerResource<V1Pod>>resource])
  },

  ReplicaSet: async ({ api, namespace, resource }) => {
    return checkWorkloadPodStatus(
      resource,
      await getPods(api, namespace, (<KubernetesServerResource<V1ReplicaSet>>resource).spec.selector!.matchLabels!)
    )
  },

  ReplicationController: async ({ api, namespace, resource }) => {
    return checkWorkloadPodStatus(
      resource,
      await getPods(api, namespace, (<KubernetesServerResource<V1ReplicationController>>resource).spec.selector)
    )
  },

  Service: async ({ resource }) => {
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

  if (manifest.metadata.namespace) {
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
  provider: KubernetesProvider
  serviceName: string
  resources: KubernetesResource[]
  log: LogEntry
}

/**
 * Wait until the rollout is complete for each of the given Kubernetes objects
 */
export async function waitForResources({ namespace, provider, serviceName, resources, log }: WaitParams) {
  let loops = 0
  let lastMessage: string | undefined
  const startTime = new Date().getTime()

  const statusLine = log.info({
    symbol: "info",
    section: serviceName,
    msg: `Waiting for resources to be ready...`,
  })

  const api = await KubeApi.factory(log, provider)
  let statuses: ResourceStatus[]

  while (true) {
    await sleep(2000 + 500 * loops)
    loops += 1

    statuses = await checkResourceStatuses(api, namespace, resources, log)

    for (const status of statuses) {
      const resource = status.resource

      log.debug(`Status of ${resource.kind} ${resource.metadata.name} is "${status.state}"`)

      if (status.state === "unhealthy") {
        let msg = `Error deploying ${serviceName}: ${status.lastMessage}`

        if (status.logs) {
          msg += "\n\n" + status.logs
        }

        throw new DeploymentError(msg, {
          serviceName,
          status,
        })
      }

      if (status.lastMessage && (!lastMessage || status.lastMessage !== lastMessage)) {
        lastMessage = status.lastMessage
        const symbol = status.warning === true ? "warning" : "info"
        statusLine.setState({
          symbol,
          msg: `${status.resource.kind}/${status.resource.metadata.name}: ${status.lastMessage}`,
        })
      }
    }

    if (combineStates(statuses.map((s) => s.state)) === "ready") {
      break
    }

    const now = new Date().getTime()

    if (now - startTime > KUBECTL_DEFAULT_TIMEOUT * 1000) {
      throw new DeploymentError(`Timed out waiting for ${serviceName} to deploy`, { statuses })
    }
  }

  statusLine.setState({ symbol: "info", section: serviceName, msg: `Resources ready` })

  return statuses.map((s) => s.resource)
}

interface ComparisonResult {
  state: ServiceState
  remoteResources: KubernetesResource[]
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
    if (manifest.metadata.namespace && deployedResource.metadata.namespace === undefined) {
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

    if (!isSubset(deployedResource, manifest)) {
      if (manifest) {
        log.verbose(`Resource ${manifest.metadata.name} is not a superset of deployed resource`)
        log.debug(diffString(deployedResource, manifest))
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

async function getDeployedResource(
  ctx: PluginContext,
  provider: KubernetesProvider,
  resource: KubernetesResource,
  log: LogEntry
): Promise<KubernetesResource | null> {
  const api = await KubeApi.factory(log, provider)
  const namespace = resource.metadata.namespace || (await getAppNamespace(ctx, log, provider))

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
