/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { diffString } from "json-diff"
import { DeploymentError } from "../../../exceptions"
import { PluginContext } from "../../../plugin-context"
import { ServiceState, combineStates } from "../../../types/service"
import { sleep, encodeYamlMulti, deepMap } from "../../../util/util"
import { KubeApi } from "../api"
import { KUBECTL_DEFAULT_TIMEOUT, kubectl } from "../kubectl"
import { getAppNamespace } from "../namespace"
import Bluebird from "bluebird"
import { KubernetesResource, KubernetesServerResource } from "../types"
import { zip, isArray, isPlainObject, pickBy, mapValues, flatten } from "lodash"
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
import { getPods } from "../util"
import { checkWorkloadStatus } from "./workload"
import { checkPodStatus } from "./pod"
import { waitForServiceEndpoints } from "./service"

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
  resourceVersion?: number,
}

interface ObjHandler {
  (params: StatusHandlerParams): Promise<ResourceStatus>
}

// Handlers to check the rollout status for K8s objects where that applies.
// Using https://github.com/kubernetes/helm/blob/master/pkg/kube/wait.go as a reference here.
const objHandlers: { [kind: string]: ObjHandler } = {
  DaemonSet: checkWorkloadStatus,
  Deployment: checkWorkloadStatus,
  StatefulSet: checkWorkloadStatus,

  PersistentVolumeClaim: async ({ resource }) => {
    const pvc = <KubernetesServerResource<V1PersistentVolumeClaim>>resource
    const state: ServiceState = pvc.status.phase === "Bound" ? "ready" : "deploying"
    return { state, resource }
  },

  Pod: async ({ resource }) => {
    return checkPodStatus(resource, [<KubernetesServerResource<V1Pod>>resource])
  },

  ReplicaSet: async ({ api, namespace, resource }) => {
    return checkPodStatus(resource, await getPods(
      api, namespace, (<KubernetesServerResource<V1ReplicaSet>>resource).spec.selector!.matchLabels!),
    )
  },

  ReplicationController: async ({ api, namespace, resource }) => {
    return checkPodStatus(resource, await getPods(
      api, namespace, (<KubernetesServerResource<V1ReplicationController>>resource).spec.selector),
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
  api: KubeApi, namespace: string, manifests: KubernetesResource[], log: LogEntry,
): Promise<ResourceStatus[]> {
  return Bluebird.map(manifests, async (manifest) => {
    return checkResourceStatus(api, namespace, manifest, log)
  })
}

export async function checkResourceStatus(
  api: KubeApi, namespace: string, manifest: KubernetesResource, log: LogEntry,
) {
  const handler = objHandlers[manifest.kind]

  if (manifest.metadata.namespace) {
    namespace = manifest.metadata.namespace
  }

  let resource: KubernetesServerResource
  let resourceVersion: number | undefined

  try {
    resource = await api.readBySpec(namespace, manifest, log)
    resourceVersion = parseInt(resource.metadata.resourceVersion!, 10)
  } catch (err) {
    if (err.code === 404) {
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
  ctx: PluginContext,
  provider: KubernetesProvider,
  serviceName: string,
  resources: KubernetesResource[],
  log: LogEntry,
}

/**
 * Wait until the rollout is complete for each of the given Kubernetes objects
 */
export async function waitForResources({ ctx, provider, serviceName, resources, log }: WaitParams) {
  let loops = 0
  let lastMessage: string | undefined
  const startTime = new Date().getTime()

  const statusLine = log.info({
    symbol: "info",
    section: serviceName,
    msg: `Waiting for resources to be ready...`,
  })

  const api = await KubeApi.factory(log, provider)
  const namespace = await getAppNamespace(ctx, log, provider)

  while (true) {
    await sleep(2000 + 500 * loops)
    loops += 1

    const statuses = await checkResourceStatuses(api, namespace, resources, log)

    for (const status of statuses) {
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

    if (combineStates(statuses.map(s => s.state)) === "ready") {
      // If applicable, wait until Services properly point to each Pod in the resource list.
      // This step is put in to give the cluster a moment to update its network routing.
      // For example, when a Deployment passes its health check, Kubernetes doesn't instantly route Service traffic
      // to it. We need to account for this so that dependant tasks, tests and services can reliably run after this
      // routine resolves.
      await waitForServiceEndpoints(api, statusLine, namespace, resources)
      break
    }

    const now = new Date().getTime()

    if (now - startTime > KUBECTL_DEFAULT_TIMEOUT * 1000) {
      throw new DeploymentError(`Timed out waiting for ${serviceName} to deploy`, { statuses })
    }
  }

  statusLine.setState({ symbol: "info", section: serviceName, msg: `Resources ready` })
}

interface ComparisonResult {
  state: ServiceState
  remoteObjects: KubernetesResource[]
}

/**
 * Check if each of the given Kubernetes objects matches what's installed in the cluster
 */
export async function compareDeployedObjects(
  ctx: KubernetesPluginContext, api: KubeApi, namespace: string, resources: KubernetesResource[], log: LogEntry,
  skipDiff: boolean,
): Promise<ComparisonResult> {
  // Unroll any `List` resource types
  resources = flatten(resources.map((r: any) => r.apiVersion === "v1" && r.kind === "List" ? r.items : [r]))

  // Check if any resources are missing from the cluster.
  const maybeDeployedObjects = await Bluebird.map(
    resources, resource => getDeployedResource(ctx, ctx.provider, resource, log),
  )
  const deployedObjects = <KubernetesResource[]>maybeDeployedObjects.filter(o => o !== null)

  const result: ComparisonResult = {
    state: "unknown",
    remoteObjects: <KubernetesResource[]>deployedObjects.filter(o => o !== null),
  }

  const logDescription = (resource: KubernetesResource) => `${resource.kind}/${resource.metadata.name}`

  const missingObjectNames = zip(resources, maybeDeployedObjects)
    .filter(([_, deployed]) => !deployed)
    .map(([resource, _]) => logDescription(resource!))

  if (missingObjectNames.length === resources.length) {
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

  // TODO: The skipDiff parameter is a temporary workaround until we finish implementing diffing in a more reliable way.
  if (!skipDiff) {
    // First we try using `kubectl diff`, to avoid potential normalization issues (i.e. false negatives). This errors
    // with exit code 1 if there is a mismatch, but may also fail with the same exit code for a number of other reasons,
    // including the cluster not supporting dry-runs, certain CRDs not supporting dry-runs etc.
    const yamlResources = await encodeYamlMulti(resources)
    const provider = ctx.provider

    try {
      await kubectl.exec({ log, provider, namespace, args: ["diff", "-f", "-"], input: Buffer.from(yamlResources) })

      // If the commands exits succesfully, the check was successful and the diff is empty.
      log.verbose(`kubectl diff indicates all resources match the deployed resources.`)
      result.state = "ready"
      return result
    } catch (err) {
      // Exited with non-zero code. Check for error messages on stderr. If one is there, the command was unable to
      // complete the check, so we fall back to our own mechanism. Otherwise the command worked, but one or more
      // resources are missing or outdated.
      if (err.stderr && err.stderr.trim() !== "exit status 1") {
        log.debug(`kubectl diff failed: ${err.message}\n${err.stderr}`)
      } else {
        log.debug(`kubectl diff indicates one or more resources are outdated.`)
        log.silly(err.stdout)
        result.state = "outdated"
        return result
      }
    }
  }

  // Using kubectl diff didn't work, so we fall back to our own comparison check, which works in _most_ cases,
  // but doesn't exhaustively handle normalization issues.
  log.debug(`Getting currently deployed resources...`)

  const deployedObjectStatuses: ResourceStatus[] = await Bluebird.map(
    deployedObjects,
    async (resource) => checkResourceStatus(api, namespace, resource, log))

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

  log.verbose(`Comparing expected and deployed resources...`)

  for (let [newSpec, existingSpec] of zip(resources, deployedObjects) as KubernetesResource[][]) {
    // to avoid normalization issues, we convert all numeric values to strings and then compare
    newSpec = <KubernetesResource>deepMap(newSpec, v => typeof v === "number" ? v.toString() : v)
    existingSpec = <KubernetesResource>deepMap(existingSpec, v => typeof v === "number" ? v.toString() : v)

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

    // NOTE: this approach won't fly in the long run, but hopefully we can climb out of this mess when
    //       `kubectl diff` is ready, or server-side apply/diff is ready
    if (newSpec.kind === "DaemonSet" || newSpec.kind === "Deployment" || newSpec.kind == "StatefulSet") {
      // handle properties that are omitted in the response because they have the default value
      // (another design issue in the K8s API)
      if (newSpec.spec.minReadySeconds === 0) {
        delete newSpec.spec.minReadySeconds
      }
      if (newSpec.spec.template && newSpec.spec.template.spec && newSpec.spec.template.spec.hostNetwork === false) {
        delete newSpec.spec.template.spec.hostNetwork
      }
    }

    // clean null values
    newSpec = <KubernetesResource>removeNull(newSpec)

    if (!isSubset(existingSpec, newSpec)) {
      if (newSpec) {
        log.verbose(`Resource ${newSpec.metadata.name} is not a superset of deployed resource`)
        log.debug(diffString(existingSpec, newSpec))
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
  ctx: PluginContext, provider: KubernetesProvider, resource: KubernetesResource, log: LogEntry,
): Promise<KubernetesResource | null> {
  const api = await KubeApi.factory(log, provider)
  const namespace = resource.metadata.namespace || await getAppNamespace(ctx, log, provider)

  try {
    const res = await api.readBySpec(namespace, resource, log)
    return <KubernetesResource>res
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
