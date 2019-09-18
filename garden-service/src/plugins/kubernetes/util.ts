/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { get, flatten, uniqBy, sortBy } from "lodash"
import { V1Pod, V1EnvVar } from "@kubernetes/client-node"

import { KubernetesResource, KubernetesWorkload, KubernetesPod, KubernetesServerResource } from "./types"
import { splitLast, serializeValues } from "../../util/util"
import { KubeApi, KubernetesError } from "./api"
import { gardenAnnotationKey, base64 } from "../../util/string"
import { MAX_CONFIGMAP_DATA_SIZE } from "./constants"
import { ContainerEnvVars } from "../container/config"
import { ConfigurationError } from "../../exceptions"

export const workloadTypes = ["Deployment", "DaemonSet", "ReplicaSet", "StatefulSet"]

export function getAnnotation(obj: KubernetesResource, key: string): string | null {
  return get(obj, ["metadata", "annotations", key])
}

/**
 * Given a list of resources, get all the associated pods.
 */
export async function getAllPods(
  api: KubeApi, defaultNamespace: string, resources: KubernetesResource[],
): Promise<KubernetesPod[]> {
  const pods: KubernetesPod[] = flatten(await Bluebird.map(resources, async (resource) => {
    if (resource.apiVersion === "v1" && resource.kind === "Pod") {
      return [<KubernetesPod>resource]
    }

    if (isWorkload(resource)) {
      return getWorkloadPods(api, resource.metadata.namespace || defaultNamespace, <KubernetesWorkload>resource)
    }

    return []
  }))

  return <KubernetesPod[]>deduplicateResources(pods)
}

/**
 * Given a resources, try to retrieve a valid selector or return undefined otherwise.
 */
export function getSelectorFromResource(resource: KubernetesWorkload) {
  // We check if the resource has its own selector
  if (resource.spec && resource.spec.selector
    && resource.spec.selector.matchLabels) {
    return resource.spec.selector.matchLabels
  }
  // We check if the pod template has labels
  if (resource.spec.template
    && resource.spec.template.metadata
    && resource.spec.template.metadata.labels) {
    return resource.spec.template.metadata.labels
  }
  // We check if the resource is from an Helm Chart
  // (as in returned from kubernetes.helm.common.getChartResources(...))
  if (resource.metadata
    && resource.metadata.labels
    && resource.metadata.labels.chart
    && resource.metadata.labels.app) {
    return {
      app: resource.metadata.labels.app,
    }
  }

  // No selector found.
  throw new ConfigurationError(`No selector found for ${resource.metadata.name} while retrieving pods.`, {
    resource,
  })
}

/**
 * Retrieve a list of pods based on the provided label selector.
 */
export async function getWorkloadPods(api: KubeApi, namespace: string, resource: KubernetesWorkload) {
  const selector = getSelectorFromResource(resource)
  const pods = await getPods(api, resource.metadata.namespace || namespace, selector)

  if (resource.kind === "Deployment") {
    // Make sure we only return the pods from the current ReplicaSet
    const selectorString = labelSelectorToString(selector)
    const replicaSets = await api.apps.listNamespacedReplicaSet(
      resource.metadata.namespace || namespace, false, undefined, undefined, undefined, selectorString,
    )

    if (replicaSets.items.length === 0) {
      return []
    }

    const sorted = sortBy(replicaSets.items, r => r.metadata.creationTimestamp!)
    const currentReplicaSet = sorted[replicaSets.items.length - 1]

    return pods.filter(pod => pod.metadata.name.startsWith(currentReplicaSet.metadata.name))
  } else {
    return pods
  }
}

export function labelSelectorToString(selector: { [key: string]: string }) {
  return Object.entries(selector).map(([k, v]) => `${k}=${v}`).join(",")
}

/**
 * Retrieve a list of pods based on the provided label selector.
 */
export async function getPods(
  api: KubeApi, namespace: string, selector: { [key: string]: string },
): Promise<KubernetesServerResource<V1Pod>[]> {
  const selectorString = labelSelectorToString(selector)
  const res = await api.core.listNamespacedPod(
    namespace, true, undefined, undefined, undefined, selectorString,
  )
  return <KubernetesServerResource<V1Pod>[]>res.items.map(pod => {
    // inexplicably, the API sometimes returns apiVersion and kind as undefined...
    pod.apiVersion = "v1"
    pod.kind = "Pod"
    return pod
  })
}

/**
 * Returns the API group of the resource. Returns empty string for "v1" objects.
 */
export function getApiGroup(resource: KubernetesResource) {
  const split = splitLast(resource.apiVersion, "/")
  return split.length === 1 ? "" : split[0]
}

/**
 * Returns true if the resource is a built-in Kubernetes workload type.
 */
export function isWorkload(resource: KubernetesResource) {
  return isBuiltIn(resource) && workloadTypes.includes(resource.kind)
}

/**
 * Returns true if the resource is a built-in Kubernetes type (e.g. v1, apps/*, *.k8s.io/*)
 */
export function isBuiltIn(resource: KubernetesResource) {
  const apiGroup = getApiGroup(resource)
  return apiGroup.endsWith("k8s.io") || !apiGroup.includes(".")
}

export function deduplicateResources(resources: KubernetesResource[]) {
  return uniqBy(resources, r => `${r.apiVersion}/${r.kind}`)
}

/**
 * Converts the given number of millicpus (1000 mcpu = 1 CPU) to a string suitable for use in pod resource limit specs.
 */
export function millicpuToString(mcpu: number) {
  mcpu = Math.floor(mcpu)

  if (mcpu % 1000 === 0) {
    return (mcpu / 1000).toString(10)
  } else {
    return `${mcpu}m`
  }
}

/**
 * Converts the given number of kilobytes to a string suitable for use in pod/volume resource specs.
 */
export function kilobytesToString(kb: number) {
  kb = Math.floor(kb)

  for (const [suffix, power] of Object.entries(suffixTable)) {
    if (kb % (1024 ** power) === 0) {
      return `${(kb / (1024 ** power))}${suffix}`
    }
  }

  return `${kb}Ki`
}

/**
 * Converts the given number of megabytes to a string suitable for use in pod/volume resource specs.
 */
export function megabytesToString(mb: number) {
  return kilobytesToString(mb * 1024)
}

const suffixTable = {
  Ei: 5,
  Pi: 4,
  Ti: 3,
  Gi: 2,
  Mi: 1,
}

export async function upsertConfigMap(
  { api, namespace, key, labels, data }:
    { api: KubeApi, namespace: string, key: string, labels: { [key: string]: string }, data: { [key: string]: any } },
) {
  const serializedData = serializeValues(data)

  if (base64(JSON.stringify(serializedData)).length > MAX_CONFIGMAP_DATA_SIZE) {
    throw new KubernetesError(`Attempting to store too much data in ConfigMap ${key}`, {
      key,
      namespace,
      labels,
      data,
    })
  }

  const body = {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: {
      name: key,
      annotations: {
        [gardenAnnotationKey("generated")]: "true",
        // Set all the labels as annotations as well
        ...labels,
      },
      labels,
    },
    data: serializedData,
  }

  try {
    await api.core.createNamespacedConfigMap(namespace, <any>body)
  } catch (err) {
    if (err.code === 409) {
      await api.core.patchNamespacedConfigMap(key, namespace, body)
    } else {
      throw err
    }
  }
}

/**
 * Flattens an array of Kubernetes resources that contain `List` resources.
 *
 * If an array of resources contains a resource of kind `List`, the list items of that resource are
 * flattened and included with the top-level resources.
 *
 * For example (simplified):
 * `[{ metadata: { name: a }}, { kind: "List", items: [{ metadata: { name: b }}, { metadata: { name: c }}]}]`
 * becomes
 * `[{ metadata: { name: a }}, { metadata: { name: b }}, { metadata: { name: b }}]`
 */
export function flattenResources(resources: KubernetesResource[]) {
  return flatten(resources.map((r: any) => r.apiVersion === "v1" && r.kind === "List" ? r.items : [r]))
}

/**
 * Maps an array of env vars, as specified on a container module, to a list of Kubernetes `V1EnvVar`s.
 */
export function prepareEnvVars(env: ContainerEnvVars): V1EnvVar[] {
  return Object.entries(env)
    .map(([name, value]) => {
      if (value === null) {
        return { name, value: "null" }
      } else if (typeof value === "object") {
        if (!value.secretRef.key) {
          throw new ConfigurationError(`kubernetes: Must specify \`key\` on secretRef for env variable ${name}`, {
            name,
            value,
          })
        }
        return {
          name,
          valueFrom: {
            secretKeyRef: {
              name: value.secretRef.name,
              key: value.secretRef.key!,
            },
          },
        }
      } else {
        return { name, value: value.toString() }
      }
    })
}

/**
 * Makes sure a Kubernetes manifest has an up-to-date API version.
 * See https://kubernetes.io/blog/2019/07/18/api-deprecations-in-1-16/
 *
 * @param manifest any Kubernetes manifest
 */
export function convertDeprecatedManifestVersion(manifest: KubernetesResource): KubernetesResource {
  const { apiVersion, kind } = manifest

  if (workloadTypes.includes(kind)) {
    manifest.apiVersion = "apps/v1"
  } else if (apiVersion === "extensions/v1beta1") {
    switch (kind) {
      case "NetworkPolicy":
        manifest.apiVersion = "networking.k8s.io/v1"
        break

      case "PodSecurityPolicy":
        manifest.apiVersion = "policy/v1beta1"
        break
    }
  }

  // apps/v1/Deployment requires spec.selector to be set
  if (kind === "Deployment") {
    if (manifest.spec && !manifest.spec.selector) {
      manifest.spec.selector = {
        // This resolves to an empty object if both of these are (for whatever reason) undefined
        ...{ matchLabels: manifest.spec.template.metadata.labels || manifest.metadata.labels },
      }
    }
  }

  return manifest
}
