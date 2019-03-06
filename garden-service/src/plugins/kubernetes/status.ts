/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DeploymentError } from "../../exceptions"
import { PluginContext } from "../../plugin-context"
import { ServiceState, combineStates } from "../../types/service"
import { sleep } from "../../util/util"
import { KubeApi, KubernetesError } from "./api"
import { KUBECTL_DEFAULT_TIMEOUT } from "./kubectl"
import { getAppNamespace } from "./namespace"
import * as Bluebird from "bluebird"
import { KubernetesResource } from "./types"
import {
  V1Pod,
  V1Deployment,
  V1DaemonSet,
  V1DaemonSetStatus,
  V1StatefulSetStatus,
  V1StatefulSet,
  V1StatefulSetSpec,
  V1DeploymentStatus,
} from "@kubernetes/client-node"
import { some, zip, isArray, isPlainObject, pickBy, mapValues } from "lodash"
import { KubernetesProvider } from "./kubernetes"
import { isSubset } from "../../util/is-subset"
import { LogEntry } from "../../logger/log-entry"
import { V1ReplicationController, V1ReplicaSet } from "@kubernetes/client-node"
import dedent = require("dedent")

export interface RolloutStatus {
  state: ServiceState
  obj: KubernetesResource
  lastMessage?: string
  lastError?: string
  resourceVersion?: number
  logs?: string
}

interface ObjHandler {
  (api: KubeApi, namespace: string, obj: KubernetesResource, resourceVersion?: number): Promise<RolloutStatus>
}

const podLogLines = 20

// Handlers to check the rollout status for K8s objects where that applies.
// Using https://github.com/kubernetes/helm/blob/master/pkg/kube/wait.go as a reference here.
const objHandlers: { [kind: string]: ObjHandler } = {
  DaemonSet: checkDeploymentStatus,
  Deployment: checkDeploymentStatus,
  StatefulSet: checkDeploymentStatus,

  PersistentVolumeClaim: async (api, namespace, obj) => {
    const res = await api.core.readNamespacedPersistentVolumeClaim(obj.metadata.name, namespace)
    const state: ServiceState = res.body.status.phase === "Bound" ? "ready" : "deploying"
    return { state, obj }
  },

  Pod: async (api, namespace, obj) => {
    const res = await api.core.readNamespacedPod(obj.metadata.name, namespace)
    return checkPodStatus(obj, [res.body])
  },

  ReplicaSet: async (api, namespace, obj) => {
    return checkPodStatus(obj, await getPods(api, namespace, (<V1ReplicaSet>obj).spec.selector.matchLabels))
  },

  ReplicationController: async (api, namespace, obj) => {
    return checkPodStatus(obj, await getPods(api, namespace, (<V1ReplicationController>obj).spec.selector))
  },

  Service: async (api, namespace, obj) => {
    if (obj.spec.type === "ExternalName") {
      return { state: "ready", obj }
    }

    const status = await api.core.readNamespacedService(obj.metadata.name, namespace)

    if (obj.spec.clusterIP !== "None" && status.body.spec.clusterIP === "") {
      return { state: "deploying", obj }
    }

    if (obj.spec.type === "LoadBalancer" && !status.body.status.loadBalancer.ingress) {
      return { state: "deploying", obj }
    }

    return { state: "ready", obj }
  },
}

async function checkPodStatus(obj: KubernetesResource, pods: V1Pod[]): Promise<RolloutStatus> {
  for (const pod of pods) {
    // TODO: detect unhealthy state (currently we just time out)
    const ready = some(pod.status.conditions.map(c => c.type === "ready"))
    if (!ready) {
      return { state: "deploying", obj }
    }
  }

  return { state: "ready", obj }
}

/**
 * Check the rollout status for the given Deployment, DaemonSet or StatefulSet.
 *
 * NOTE: This mostly replicates the logic in `kubectl rollout status`. Using that directly here
 * didn't pan out, since it doesn't look for events and just times out when errors occur during rollout.
 */
export async function checkDeploymentStatus(
  api: KubeApi, namespace: string, obj: KubernetesResource, resourceVersion?: number,
): Promise<RolloutStatus> {
  const out: RolloutStatus = {
    state: "unhealthy",
    obj,
    resourceVersion,
  }

  let statusRes: V1Deployment | V1DaemonSet | V1StatefulSet

  try {
    statusRes = <V1Deployment | V1DaemonSet | V1StatefulSet>(await api.readBySpec(namespace, obj)).body
  } catch (err) {
    if (err.code && err.code === 404) {
      // service is not running
      return out
    } else {
      throw err
    }
  }

  if (!resourceVersion) {
    resourceVersion = out.resourceVersion = parseInt(statusRes.metadata.resourceVersion, 10)
  }

  // TODO: try to come up with something more efficient. may need to wait for newer k8s version.
  // note: the resourceVersion parameter does not appear to work...
  const eventsRes = await api.core.listNamespacedEvent(namespace)

  // const eventsRes = await this.kubeApi(
  //   "GET",
  //   [
  //     "apis", apiSection, "v1beta1",
  //     "watch",
  //     "namespaces", namespace,
  //     type + "s", service.fullName,
  //   ],
  //   { resourceVersion, watch: "false" },
  // )

  // look for errors and warnings in the events for the service, abort if we find any
  const events = eventsRes.body.items

  for (let event of events) {
    const eventVersion = parseInt(event.metadata.resourceVersion, 10)

    if (
      eventVersion <= <number>resourceVersion ||
      (
        !event.metadata.name.startsWith(obj.metadata.name + ".")
        &&
        !event.metadata.name.startsWith(obj.metadata.name + "-")
      )
    ) {
      continue
    }

    if (eventVersion > <number>resourceVersion) {
      out.resourceVersion = eventVersion
    }

    if (event.type === "Warning" || event.type === "Error") {
      if (event.type === "Warning" && (event.reason === "FailedScheduling" || event.reason === "FailedMount")) {
        // this can happen on first attempt to schedule a pod
        // TODO: we may want to more specifically look at the message
        //       (e.g. 'pod has unbound immediate PersistentVolumeClaims' or 'couldn't propagate object cache')
        continue
      }
      if (event.reason === "Unhealthy") {
        // still waiting on readiness probe
        continue
      }
      out.state = "unhealthy"
      out.lastError = `${event.reason} - ${event.message}`

      // TODO: fetch logs for the pods in the deployment
      if (event.involvedObject.kind === "Pod") {
        const logs = await getPodLogs(api, namespace, [event.involvedObject.name])

        if (logs) {
          out.logs = dedent`
            <Showing last ${podLogLines} lines for the pod. Run the following command for complete logs>
            kubectl -n ${namespace} --context=${api.context} logs ${event.involvedObject.name}

          ` + logs
        }
      } else {
        const pods = await getPods(api, namespace, statusRes.spec.selector.matchLabels)
        const logs = await getPodLogs(api, namespace, pods.map(pod => pod.metadata.name))

        if (logs) {
          out.logs = dedent`
            <Showing last ${podLogLines} lines per pod in this ${obj.kind}. Run the following command for complete logs>
            kubectl -n ${namespace} --context=${api.context} logs ${obj.kind.toLowerCase()}/${obj.metadata.name}

          ` + logs
        }
      }

      return out
    }

    let message = event.message

    if (event.reason === event.reason.toUpperCase()) {
      // some events like ingress events are formatted this way
      message = `${event.reason} ${message}`
    }

    if (message) {
      out.lastMessage = message
    }
  }

  // See `https://github.com/kubernetes/kubernetes/blob/master/pkg/kubectl/rollout_status.go` for a reference
  // for this logic.
  out.state = "ready"
  let statusMsg = ""

  if (statusRes.metadata.generation > statusRes.status.observedGeneration) {
    statusMsg = `Waiting for spec update to be observed...`
    out.state = "deploying"
  } else if (obj.kind === "DaemonSet") {
    const status = <V1DaemonSetStatus>statusRes.status

    const desired = status.desiredNumberScheduled || 0
    const updated = status.updatedNumberScheduled || 0
    const available = status.numberAvailable || 0

    if (updated < desired) {
      statusMsg = `Waiting for rollout: ${updated} out of ${desired} new pods updated...`
      out.state = "deploying"
    } else if (available < desired) {
      statusMsg = `Waiting for rollout: ${available} out of ${desired} updated pods available...`
      out.state = "deploying"
    }
  } else if (obj.kind === "StatefulSet") {
    const status = <V1StatefulSetStatus>statusRes.status
    const statusSpec = <V1StatefulSetSpec>statusRes.spec

    const replicas = status.replicas
    const updated = status.updatedReplicas || 0
    const ready = status.readyReplicas || 0

    if (replicas && ready < replicas) {
      statusMsg = `Waiting for rollout: ${ready} out of ${replicas} new pods updated...`
      out.state = "deploying"
    } else if (statusSpec.updateStrategy.type === "RollingUpdate" && statusSpec.updateStrategy.rollingUpdate) {
      if (replicas && statusSpec.updateStrategy.rollingUpdate.partition) {
        const desired = replicas - statusSpec.updateStrategy.rollingUpdate.partition
        if (updated < desired) {
          statusMsg =
            `Waiting for partitioned roll out to finish: ${updated} out of ${desired} new pods have been updated...`
          out.state = "deploying"
        }
      }
    } else if (status.updateRevision !== status.currentRevision) {
      statusMsg = `Waiting for rolling update to complete...`
      out.state = "deploying"
    }
  } else {
    const status = <V1DeploymentStatus>statusRes.status

    const desired = 1 // TODO: service.count[env.name] || 1
    const updated = status.updatedReplicas || 0
    const replicas = status.replicas || 0
    const available = status.availableReplicas || 0

    if (updated < desired) {
      statusMsg = `Waiting for rollout: ${updated} out of ${desired} new replicas updated...`
      out.state = "deploying"
    } else if (replicas > updated) {
      statusMsg = `Waiting for rollout: ${replicas - updated} old replicas pending termination...`
      out.state = "deploying"
    } else if (available < updated) {
      statusMsg = `Waiting for rollout: ${available} out of ${updated} updated replicas available...`
      out.state = "deploying"
    }
  }

  out.lastMessage = statusMsg

  return out
}

/**
 * Check if the specified Kubernetes objects are deployed and fully rolled out
 */
export async function checkResourceStatuses(
  api: KubeApi, namespace: string, resources: KubernetesResource[], prevStatuses?: RolloutStatus[],
): Promise<RolloutStatus[]> {
  return Bluebird.map(resources, async (obj, i) => {
    return checkResourceStatus(api, namespace, obj, prevStatuses && prevStatuses[i])
  })
}

export async function checkResourceStatus(
  api: KubeApi, namespace: string, resource: KubernetesResource, prevStatus?: RolloutStatus,
) {
  const handler = objHandlers[resource.kind]
  let status: RolloutStatus
  if (handler) {
    try {
      status = await handler(api, namespace, resource, prevStatus && prevStatus.resourceVersion)
    } catch (err) {
      // We handle 404s specifically since this might be invoked before some objects are deployed
      if (err.code === 404) {
        status = { state: "missing", obj: resource }
      } else {
        throw err
      }
    }
  } else {
    // if there is no explicit handler to check the status, we assume there's no rollout phase to wait for
    status = { state: "ready", obj: resource }
  }

  return status
}

interface WaitParams {
  ctx: PluginContext,
  provider: KubernetesProvider,
  serviceName: string,
  resources: KubernetesResource[],
  log: LogEntry,
}

/**
 * Wait until the rollout is complete for each of the given Kubernetes objects
 */
export async function waitForResources({ ctx, provider, serviceName, resources: objects, log }: WaitParams) {
  let loops = 0
  let lastMessage
  const startTime = new Date().getTime()

  log.verbose({
    symbol: "info",
    section: serviceName,
    msg: `Waiting for service to be ready...`,
  })

  const api = new KubeApi(provider)
  const namespace = await getAppNamespace(ctx, provider)
  let prevStatuses: RolloutStatus[] = objects.map((obj) => ({
    state: <ServiceState>"unknown",
    obj,
  }))

  while (true) {
    await sleep(2000 + 1000 * loops)
    loops += 1

    const statuses = await checkResourceStatuses(api, namespace, objects, prevStatuses)

    for (const status of statuses) {
      if (status.lastError) {
        let msg = `Error deploying ${serviceName}: ${status.lastError}`

        if (status.logs !== undefined) {
          msg += "\n\nLogs:\n\n" + status.logs
        }

        throw new DeploymentError(msg, {
          serviceName,
          status,
        })
      }

      if (status.lastMessage && (!lastMessage || status.lastMessage !== lastMessage)) {
        lastMessage = status.lastMessage
        log.verbose({
          symbol: "info",
          section: serviceName,
          msg: status.lastMessage,
        })
      }
    }

    prevStatuses = statuses

    if (combineStates(statuses.map(s => s.state)) === "ready") {
      break
    }

    const now = new Date().getTime()

    if (now - startTime > KUBECTL_DEFAULT_TIMEOUT * 1000) {
      throw new DeploymentError(`Timed out waiting for ${serviceName} to deploy`, { statuses })
    }
  }

  log.verbose({ symbol: "info", section: serviceName, msg: `Service deployed` })
}

interface ComparisonResult {
  state: ServiceState
  remoteObjects: KubernetesResource[]
}

/**
 * Check if each of the given Kubernetes objects matches what's installed in the cluster
 */
export async function compareDeployedObjects(
  ctx: PluginContext, api: KubeApi, namespace: string, objects: KubernetesResource[], log: LogEntry,
): Promise<ComparisonResult> {

  const maybeDeployedObjects = await Bluebird.map(objects, obj => getDeployedObject(ctx, ctx.provider, obj))
  const deployedObjects = <KubernetesResource[]>maybeDeployedObjects.filter(o => o !== null)

  const result: ComparisonResult = {
    state: "unknown",
    remoteObjects: <KubernetesResource[]>deployedObjects.filter(o => o !== null),
  }

  const logDescription = (obj: KubernetesResource) => `${obj.kind}/${obj.metadata.name}`

  const missingObjectNames = zip(objects, maybeDeployedObjects)
    .filter(([_, deployed]) => !deployed)
    .map(([obj, _]) => logDescription(obj!))

  if (missingObjectNames.length > 0) {
    // One or more objects is not deployed.
    log.silly(`Resource(s) ${missingObjectNames.join(", ")} missing from cluster`)
    result.state = "missing"
    return result
  }

  const deployedObjectStatuses: RolloutStatus[] = await Bluebird.map(
    deployedObjects,
    async (obj) => checkResourceStatus(api, namespace, obj, undefined))

  const deployedStates = deployedObjectStatuses.map(s => s.state)
  if (deployedStates.find(s => s !== "ready")) {

    const descriptions = zip(deployedObjects, deployedStates)
      .filter(([_, s]) => s !== "ready")
      .map(([o, s]) => `${logDescription(o!)}: "${s}"`).join("\n")

    log.silly(dedent`
    Resource(s) with non-ready status found in the cluster:

    ${descriptions}` + "\n")

    result.state = combineStates(deployedStates)
    return result
  }

  // From here, the state can only be "ready" or "outdated", so we proceed to compare the old & new specs.

  for (let [newSpec, existingSpec] of zip(objects, deployedObjects) as KubernetesResource[][]) {

    // the API version may implicitly change when deploying
    existingSpec.apiVersion = newSpec.apiVersion

    // the namespace property is silently dropped when added to non-namespaced
    if (newSpec.metadata.namespace && existingSpec.metadata.namespace === undefined) {
      delete newSpec.metadata.namespace
    }

    if (!existingSpec.metadata.annotations) {
      existingSpec.metadata.annotations = {}
    }

    // handle auto-filled properties (this is a bit of a design issue in the K8s API)
    if (newSpec.kind === "Service" && newSpec.spec.clusterIP === "") {
      delete newSpec.spec.clusterIP
    }

    // handle properties that are omitted in the response because they have the default value
    // (another design issue in the K8s API)
    // NOTE: this approach won't fly in the long run, but hopefully we can climb out of this mess when
    //       `kubectl diff` is ready, or server-side apply/diff is ready
    if (newSpec.kind === "DaemonSet") {
      if (newSpec.spec.minReadySeconds === 0) {
        delete newSpec.spec.minReadySeconds
      }
      if (newSpec.spec.template.spec.hostNetwork === false) {
        delete newSpec.spec.template.spec.hostNetwork
      }
    }

    // clean null values
    newSpec = <KubernetesResource>removeNull(newSpec)

    if (!isSubset(existingSpec, newSpec)) {
      if (newSpec) {
        log.silly(`Resource ${newSpec.metadata.name} is not a superset of deployed resource`)
        log.silly("----------------- Expected: -----------------------")
        log.silly(JSON.stringify(newSpec, null, 4))
        log.silly("------------------Deployed: -----------------------")
        log.silly(JSON.stringify(existingSpec, null, 4))
        log.silly("---------------------------------------------------")
      }
      // console.log(JSON.stringify(obj, null, 4))
      // console.log(JSON.stringify(existingSpec, null, 4))
      // console.log("----------------------------------------------------")
      // throw new Error("bla")
      result.state = "outdated"
      return result
    }
  }

  result.state = "ready"
  return result
}

async function getDeployedObject(
  ctx: PluginContext, provider: KubernetesProvider, obj: KubernetesResource,
): Promise<KubernetesResource | null> {
  const api = new KubeApi(provider)
  const namespace = obj.metadata.namespace || await getAppNamespace(ctx, provider)

  try {
    const res = await api.readBySpec(namespace, obj)
    return res.body
  } catch (err) {
    if (err.code === 404) {
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
    return <{ [K in keyof T]: T[K] }>mapValues(pickBy(<any>value, v => v !== null), removeNull)
  } else {
    return value
  }
}

/**
 * Retrieve a list of pods based on the provided label selector.
 */
async function getPods(api: KubeApi, namespace: string, selector: { [key: string]: string }): Promise<V1Pod[]> {
  const selectorString = Object.entries(selector).map(([k, v]) => `${k}=${v}`).join(",")
  const res = await api.core.listNamespacedPod(
    namespace, undefined, undefined, undefined, true, selectorString,
  )
  return res.body.items
}

/**
 * Get a formatted list of log tails for each of the specified pods. Used for debugging and error logs.
 */
async function getPodLogs(api: KubeApi, namespace: string, podNames: string[]): Promise<string> {
  const allLogs = await Bluebird.map(podNames, async (name) => {
    let containerName: string | undefined
    try {
      const podRes = await api.core.readNamespacedPod(name, namespace)
      const containerNames = podRes.body.spec.containers.map(c => c.name)
      if (containerNames.length > 1) {
        containerName = containerNames.filter(n => !n.match(/garden-/))[0]
      } else {
        containerName = undefined
      }
    } catch (err) {
      if (err.code === 404) {
        return ""
      } else {
        throw err
      }
    }
    // Putting 5000 bytes as a length limit in addition to the line limit, just as a precaution in case someone
    // accidentally logs a binary file or something.
    try {
      const res = await api.core.readNamespacedPodLog(
        name, namespace, containerName, false, 5000, undefined, false, undefined, podLogLines,
      )
      return res.body ? `****** ${name} ******\n${res.body}` : ""
    } catch (err) {
      if (err instanceof KubernetesError && err.message.includes("waiting to start")) {
        return ""
      } else {
        throw err
      }
    }
  })
  return allLogs.filter(l => l !== "").join("\n\n")
}
