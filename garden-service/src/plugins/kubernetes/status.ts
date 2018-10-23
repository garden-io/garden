/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DeploymentError } from "../../exceptions"
import { PluginContext } from "../../plugin-context"
import { RuntimeContext, Service, ServiceState } from "../../types/service"
import { sleep } from "../../util/util"
import { KubeApi } from "./api"
import { KUBECTL_DEFAULT_TIMEOUT } from "./kubectl"
import { getAppNamespace } from "./namespace"
import * as Bluebird from "bluebird"
import { KubernetesObject } from "./helm"
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
import { getContainerServiceStatus } from "./deployment"
import { V1ReplicationController, V1ReplicaSet } from "@kubernetes/client-node"
import dedent = require("dedent")

export interface RolloutStatus {
  state: ServiceState
  obj: KubernetesObject
  lastMessage?: string
  lastError?: string
  resourceVersion?: number
  logs?: string
}

interface ObjHandler {
  (api: KubeApi, namespace: string, obj: KubernetesObject, resourceVersion?: number): Promise<RolloutStatus>
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

async function checkPodStatus(obj: KubernetesObject, pods: V1Pod[]): Promise<RolloutStatus> {
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
  api: KubeApi, namespace: string, obj: KubernetesObject, resourceVersion?: number,
): Promise<RolloutStatus> {
  //
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
      if (event.reason === "Unhealthy") {
        // still waiting on readiness probe
        continue
      }
      out.state = "unhealthy"
      out.lastError = `${event.reason} - ${event.message}`

      // TODO: fetch logs for the pods in the deployment
      if (event.involvedObject.kind === "Pod") {
        const logs = await getPodLogs(api, namespace, [event.involvedObject.name])

        out.logs = dedent`
          <Showing last ${podLogLines} lines for the pod. Run the following command for complete logs:>
          kubectl -n ${namespace} --context=${api.context} logs ${event.involvedObject.name}

          ${logs}
        `
      } else {
        const pods = await getPods(api, namespace, statusRes.spec.selector.matchLabels)
        const logs = await getPodLogs(api, namespace, pods.map(pod => pod.metadata.name))

        out.logs = dedent`
          <Showing last ${podLogLines} lines per pod in this ${obj.kind}. Run the following command for complete logs:>
          kubectl -n ${namespace} --context=${api.context} logs ${obj.kind.toLowerCase()}/${obj.metadata.name}

          ${logs}
        `
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
export async function checkObjectStatus(
  api: KubeApi, namespace: string, objects: KubernetesObject[], prevStatuses?: RolloutStatus[],
) {
  let ready = true

  const statuses: RolloutStatus[] = await Bluebird.map(objects, async (obj, i) => {
    const handler = objHandlers[obj.kind]
    const prevStatus = prevStatuses && prevStatuses[i]
    const status: RolloutStatus = handler
      ? await handler(api, namespace, obj, prevStatus && prevStatus.resourceVersion)
      // if there is no explicit handler to check the status, we assume there's no rollout phase to wait for
      : { state: "ready", obj }

    if (status.state !== "ready") {
      ready = false
    }

    return status
  })

  return { ready, statuses }
}

interface WaitParams {
  ctx: PluginContext,
  provider: KubernetesProvider,
  service: Service,
  objects: KubernetesObject[],
  logEntry?: LogEntry,
}

/**
 * Wait until the rollout is complete for each of the given Kubernetes objects
 */
export async function waitForObjects({ ctx, provider, service, objects, logEntry }: WaitParams) {
  let loops = 0
  let lastMessage
  const startTime = new Date().getTime()

  logEntry && logEntry.verbose({
    symbol: "info",
    section: service.name,
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

    const { ready, statuses } = await checkObjectStatus(api, namespace, objects, prevStatuses)

    for (const status of statuses) {
      if (status.lastError) {
        let msg = `Error deploying ${service.name}: ${status.lastError}`

        if (status.logs !== undefined) {
          msg += "\n\nLogs:\n\n" + status.logs
        }

        throw new DeploymentError(msg, {
          serviceName: service.name,
          status,
        })
      }

      if (status.lastMessage && (!lastMessage || status.lastMessage !== lastMessage)) {
        lastMessage = status.lastMessage
        logEntry && logEntry.verbose({
          symbol: "info",
          section: service.name,
          msg: status.lastMessage,
        })
      }
    }

    prevStatuses = statuses

    if (ready) {
      break
    }

    const now = new Date().getTime()

    if (now - startTime > KUBECTL_DEFAULT_TIMEOUT * 1000) {
      throw new DeploymentError(`Timed out waiting for ${service.name} to deploy`, { statuses })
    }
  }

  logEntry && logEntry.verbose({ symbol: "info", section: service.name, msg: `Service deployed` })
}

/**
 * Resolves to true if the requested services were ready, or became ready within a timeout limit.
 * Resolves to false otherwise.
 *
 * TODO: This function is repetitive of waitForObjects above.
 */
export async function waitForServices(
  ctx: PluginContext, runtimeContext: RuntimeContext, services: Service[], buildDependencies,
): Promise<boolean> {
  let ready
  const startTime = new Date().getTime()

  while (true) {

    ready = (await Bluebird.map(services, async (service) => {
      const state = (await getContainerServiceStatus({
        ctx, buildDependencies, service, runtimeContext, module: service.module,
      })).state
      return state === "ready" || state === "outdated"
    })).every(serviceReady => serviceReady)

    if (ready) {
      return true
    }

    if (new Date().getTime() - startTime > KUBECTL_DEFAULT_TIMEOUT * 1000) {
      return false
    }

    await sleep(2000)
  }

}

/**
 * Check if each of the given Kubernetes objects matches what's installed in the cluster
 */
export async function compareDeployedObjects(ctx: PluginContext, objects: KubernetesObject[]): Promise<ServiceState> {
  const existingObjects = await Bluebird.map(objects, obj => getDeployedObject(ctx, ctx.provider, obj))
  let missing = true

  for (let [obj, existingSpec] of zip(objects, existingObjects)) {
    if (existingSpec && obj) {
      missing = false

      // the API version may implicitly change when deploying
      existingSpec.apiVersion = obj.apiVersion

      // the namespace property is silently dropped when added to non-namespaced
      if (obj.metadata.namespace && existingSpec.metadata.namespace === undefined) {
        delete obj.metadata.namespace
      }

      if (!existingSpec.metadata.annotations) {
        existingSpec.metadata.annotations = {}
      }

      // handle auto-filled properties (this is a bit of a design issue in the K8s API)
      if (obj.kind === "Service" && obj.spec.clusterIP === "") {
        delete obj.spec.clusterIP
      }

      // handle properties that are omitted in the response because they have the default value
      // (another design issue in the K8s API)
      // NOTE: this approach won't fly in the long run, but hopefully we can climb out of this mess when
      //       `kubectl diff` is ready, or server-side apply/diff is ready
      if (obj.kind === "DaemonSet") {
        if (obj.spec.minReadySeconds === 0) {
          delete obj.spec.minReadySeconds
        }
        if (obj.spec.template.spec.hostNetwork === false) {
          delete obj.spec.template.spec.hostNetwork
        }
      }

      // clean null values
      obj = <KubernetesObject>removeNull(obj)
    }

    if (existingSpec && !isSubset(existingSpec, obj)) {
      // console.log(JSON.stringify(obj, null, 4))
      // console.log(JSON.stringify(existingSpec, null, 4))
      // console.log("----------------------------------------------------")
      // throw new Error("bla")
      return "outdated"
    }
  }

  return missing ? "missing" : "ready"
}

async function getDeployedObject(
  ctx: PluginContext, provider: KubernetesProvider, obj: KubernetesObject,
): Promise<KubernetesObject | null> {
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
    // Putting 5000 bytes as a length limit in addition to the line limit, just as a precaution in case someone
    // accidentally logs a binary file or something.
    const res = await api.core.readNamespacedPodLog(
      name, namespace, undefined, false, 5000, undefined, false, undefined, podLogLines,
    )
    return `****** ${name} ******\n${res.body}`
  })
  return allLogs.join("\n\n")
}
