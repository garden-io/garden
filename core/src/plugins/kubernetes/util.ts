/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { get, flatten, uniqBy, sortBy, omit, chain, sample, isEmpty, find } from "lodash"
import { V1Pod, V1EnvVar, V1Container, V1PodSpec } from "@kubernetes/client-node"
import { apply as jsonMerge } from "json-merge-patch"
import chalk from "chalk"
import hasha from "hasha"

import { KubernetesResource, KubernetesWorkload, KubernetesPod, KubernetesServerResource } from "./types"
import { splitLast, serializeValues, findByName } from "../../util/util"
import { KubeApi, KubernetesError } from "./api"
import { gardenAnnotationKey, base64, deline, stableStringify } from "../../util/string"
import { MAX_CONFIGMAP_DATA_SIZE, dockerAuthSecretName, dockerAuthSecretKey } from "./constants"
import { ContainerEnvVars } from "../container/config"
import { ConfigurationError, PluginError } from "../../exceptions"
import { ServiceResourceSpec, KubernetesProvider } from "./config"
import { LogEntry } from "../../logger/log-entry"
import { PluginContext } from "../../plugin-context"
import { HelmModule } from "./helm/config"
import { KubernetesModule } from "./kubernetes-module/config"
import { getChartPath, renderHelmTemplateString } from "./helm/common"
import { HotReloadableResource } from "./hot-reload/hot-reload"
import { ProviderMap } from "../../config/provider"

export const skopeoImage = "gardendev/skopeo:1.41.0-1"

const STATIC_LABEL_REGEX = /[0-9]/g
export const workloadTypes = ["Deployment", "DaemonSet", "ReplicaSet", "StatefulSet"]

export function getAnnotation(obj: KubernetesResource, key: string): string | null {
  return get(obj, ["metadata", "annotations", key])
}

/**
 * Returns a hash of the manifest. We use this instead of the raw manifest when setting the
 * "manifest-hash" annotation. This prevents "Too long annotation" errors for long manifests.
 */
export async function hashManifest(manifest: KubernetesResource) {
  return hasha(stableStringify(manifest), { algorithm: "sha256" })
}

/**
 * Given a list of resources, get all the associated pods.
 */
export async function getAllPods(
  api: KubeApi,
  defaultNamespace: string,
  resources: KubernetesResource[]
): Promise<KubernetesPod[]> {
  const pods: KubernetesServerResource<V1Pod>[] = flatten(
    await Bluebird.map(resources, async (resource) => {
      if (resource.apiVersion === "v1" && resource.kind === "Pod") {
        return [<KubernetesServerResource<V1Pod>>resource]
      }

      if (isWorkload(resource)) {
        return getWorkloadPods(api, resource.metadata.namespace || defaultNamespace, <KubernetesWorkload>resource)
      }

      return []
    })
  )

  return <KubernetesServerResource<V1Pod>[]>deduplicateResources(pods)
}

/**
 * Given a resources, try to retrieve a valid selector or throw otherwise.
 */
export function getSelectorFromResource(resource: KubernetesWorkload): { [key: string]: string } {
  // We check if the resource has its own selector
  if (resource.spec && resource.spec.selector && resource.spec.selector.matchLabels) {
    return resource.spec.selector.matchLabels
  }
  // We check if the pod template has labels
  if (resource.spec.template && resource.spec.template.metadata && resource.spec.template.metadata.labels) {
    return resource.spec.template.metadata.labels
  }
  // We check if the resource is from an Helm Chart
  // (as in returned from kubernetes.helm.common.getChartResources(...))
  if (resource.metadata && resource.metadata.labels && resource.metadata.labels.chart && resource.metadata.labels.app) {
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
 * Deduplicates a list of pods by label, so that only the most recent pod is returned.
 */
export function deduplicatePodsByLabel(pods: KubernetesServerResource<V1Pod>[]) {
  // We don't filter out pods with no labels
  const noLabel = pods.filter((pod) => isEmpty(pod.metadata.labels))
  const uniqByLabel = chain(pods)
    .filter((pod) => !isEmpty(pod.metadata.labels))
    .sortBy((pod) => pod.metadata.creationTimestamp)
    .reverse() // We only want the most recent pod in case of duplicates
    .uniqBy((pod) => JSON.stringify(pod.metadata.labels))
    .value()
  return sortBy([...uniqByLabel, ...noLabel], (pod) => pod.metadata.creationTimestamp)
}

/**
 * Retrieve a list of pods based on the resource selector, deduplicated so that only the most recent
 * pod is returned when multiple pods with the same label are found.
 */
export async function getCurrentWorkloadPods(api: KubeApi, namespace: string, resource: KubernetesWorkload) {
  return deduplicatePodsByLabel(await getWorkloadPods(api, namespace, resource))
}

/**
 * Retrieve a list of pods based on the resource selector.
 */
export async function getWorkloadPods(api: KubeApi, namespace: string, resource: KubernetesWorkload) {
  // We don't match on the garden.io/version label because it can fall out of sync during hot reloads
  const selector = omit(getSelectorFromResource(resource), gardenAnnotationKey("version"))
  const pods = await getPods(api, resource.metadata.namespace || namespace, selector)

  if (resource.kind === "Deployment") {
    // Make sure we only return the pods from the current ReplicaSet
    const selectorString = labelSelectorToString(selector)
    const replicaSetRes = await api.apps.listNamespacedReplicaSet(
      resource.metadata.namespace || namespace,
      undefined, // pretty
      undefined, // allowWatchBookmarks
      undefined, // _continue
      undefined, // fieldSelector
      selectorString // labelSelector
    )

    const replicaSets = replicaSetRes.items.filter((r) => (r.spec.replicas || 0) > 0)

    if (replicaSets.length === 0) {
      return []
    }

    const sorted = sortBy(replicaSets, (r) => r.metadata.creationTimestamp!)
    const currentReplicaSet = sorted[replicaSets.length - 1]

    return pods.filter((pod) => pod.metadata.name.startsWith(currentReplicaSet.metadata.name))
  } else {
    return pods
  }
}

export function labelSelectorToString(selector: { [key: string]: string }) {
  return Object.entries(selector)
    .map(([k, v]) => `${k}=${v}`)
    .join(",")
}

/**
 * Retrieve a list of pods based on the provided label selector.
 */
export async function getPods(
  api: KubeApi,
  namespace: string,
  selector: { [key: string]: string }
): Promise<KubernetesServerResource<V1Pod>[]> {
  const selectorString = labelSelectorToString(selector)
  const res = await api.core.listNamespacedPod(
    namespace,
    undefined, // pretty
    undefined, // allowWatchBookmarks
    undefined, // continue
    undefined, // fieldSelector
    selectorString // labelSelector
  )
  return <KubernetesServerResource<V1Pod>[]>res.items
    .map((pod) => {
      // inexplicably, the API sometimes returns apiVersion and kind as undefined...
      pod.apiVersion = "v1"
      pod.kind = "Pod"
      return pod
    })
    .filter(
      (pod) =>
        // Filter out failed pods
        !(pod.status && pod.status.phase === "Failed") &&
        // Filter out evicted pods
        !(pod.status && pod.status.reason && pod.status.reason.includes("Evicted"))
    )
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
  return uniqBy(resources, (r) => `${r.apiVersion}/${r.kind}`)
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
    if (kb % 1024 ** power === 0) {
      return `${kb / 1024 ** power}${suffix}`
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

export async function upsertConfigMap({
  api,
  namespace,
  key,
  labels,
  data,
}: {
  api: KubeApi
  namespace: string
  key: string
  labels: { [key: string]: string }
  data: { [key: string]: any }
}) {
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
    if (err.statusCode === 409) {
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
  return flatten(resources.map((r: any) => (r.apiVersion === "v1" && r.kind === "List" ? r.items : [r])))
}

/**
 * Maps an array of env vars, as specified on a container module, to a list of Kubernetes `V1EnvVar`s.
 */
export function prepareEnvVars(env: ContainerEnvVars): V1EnvVar[] {
  return Object.entries(env)
    .filter(([_, value]) => value !== undefined)
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
export function convertDeprecatedManifestVersion(manifest: KubernetesWorkload): KubernetesWorkload {
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
        ...{ matchLabels: manifest.spec.template?.metadata?.labels || manifest.metadata.labels },
      }
    }
  }

  return manifest
}

export async function getDeploymentPod({
  api,
  deploymentName,
  namespace,
}: {
  api: KubeApi
  deploymentName: string
  namespace: string
}) {
  const status = await api.apps.readNamespacedDeployment(deploymentName, namespace)
  const pods = await getPods(api, namespace, status.spec.selector?.matchLabels || {})
  const pod = sample(pods)
  if (!pod) {
    throw new PluginError(`Could not a running pod in a deployment: ${deploymentName}`, {
      deploymentName,
      namespace,
    })
  }

  return pod
}

export function getStaticLabelsFromPod(pod: KubernetesPod): { [key: string]: string } {
  const labels: { [key: string]: string } = {}

  for (const label in pod.metadata.labels) {
    if (!pod.metadata.labels[label].match(STATIC_LABEL_REGEX)) {
      labels[label] = pod.metadata.labels[label]
    }
  }
  return labels
}

export function getSelectorString(labels: { [key: string]: string }) {
  let selectorString: string = "-l"
  for (const label in labels) {
    selectorString += `${label}=${labels[label]},`
  }
  return selectorString.trimEnd().slice(0, -1)
}

/**
 * Returns the `serviceResource` spec on the module. If the module has a base module, the two resource specs
 * are merged using a JSON Merge Patch (RFC 7396).
 *
 * Throws error if no resource spec is configured, or it is empty.
 */
export function getServiceResourceSpec(
  module: HelmModule | KubernetesModule,
  baseModule: HelmModule | undefined
): ServiceResourceSpec {
  let resourceSpec = module.spec.serviceResource || {}

  if (baseModule) {
    resourceSpec = jsonMerge(baseModule.spec.serviceResource || {}, resourceSpec)
  }

  if (isEmpty(resourceSpec)) {
    throw new ConfigurationError(
      chalk.red(
        deline`${module.type} module ${chalk.white(module.name)} doesn't specify a ${chalk.underline("serviceResource")}
        in its configuration. You must specify a resource in the module config in order to use certain Garden features,
        such as hot reloading, tasks and tests.`
      ),
      { resourceSpec }
    )
  }

  return <ServiceResourceSpec>resourceSpec
}

interface GetServiceResourceParams {
  ctx: PluginContext
  log: LogEntry
  manifests: KubernetesResource[]
  module: HelmModule | KubernetesModule
  baseModule: HelmModule | undefined
  resourceSpec?: ServiceResourceSpec
}

/**
 * Finds and returns the configured service resource from the specified manifests, that we can use for
 * hot-reloading and other service-specific functionality.
 *
 * Optionally provide a `resourceSpec`, which is then used instead of the default `module.serviceResource` spec.
 * This is used when individual tasks or tests specify a resource.
 *
 * Throws an error if no valid resource spec is given, or the resource spec doesn't match any of the given resources.
 */
export async function findServiceResource({
  ctx,
  log,
  manifests,
  module,
  baseModule,
  resourceSpec,
}: GetServiceResourceParams): Promise<HotReloadableResource> {
  const resourceMsgName = resourceSpec ? "resource" : "serviceResource"

  if (!resourceSpec) {
    resourceSpec = getServiceResourceSpec(module, baseModule)
  }

  const targetKind = resourceSpec.kind
  let targetName = resourceSpec.name

  const chartResourceNames = manifests.map((o) => `${o.kind}/${o.metadata.name}`)
  const applicableChartResources = manifests.filter((o) => o.kind === targetKind)

  let target: HotReloadableResource

  if (targetName) {
    if (module.type === "helm" && targetName.includes("{{")) {
      // need to resolve the template string
      const chartPath = await getChartPath(<HelmModule>module)
      targetName = await renderHelmTemplateString(ctx, log, module as HelmModule, chartPath, targetName)
    }

    target = find(<HotReloadableResource[]>manifests, (o) => o.kind === targetKind && o.metadata.name === targetName)!

    if (!target) {
      throw new ConfigurationError(
        chalk.red(
          deline`${module.type} module ${chalk.white(module.name)} does not contain specified ${targetKind}
          ${chalk.white(targetName)}`
        ),
        { resourceSpec, chartResourceNames }
      )
    }
  } else {
    if (applicableChartResources.length === 0) {
      throw new ConfigurationError(`${module.type} module ${chalk.white(module.name)} contains no ${targetKind}s.`, {
        resourceSpec,
        chartResourceNames,
      })
    }

    if (applicableChartResources.length > 1) {
      throw new ConfigurationError(
        chalk.red(
          deline`${module.type} module ${chalk.white(module.name)} contains multiple ${targetKind}s.
          You must specify ${chalk.underline(`${resourceMsgName}.name`)} in the module config in order to identify
          the correct ${targetKind} to use.`
        ),
        { resourceSpec, chartResourceNames }
      )
    }

    target = <HotReloadableResource>applicableChartResources[0]
  }

  return target
}

/**
 * From the given Deployment, DaemonSet or StatefulSet resource, get either the first container spec,
 * or if `containerName` is specified, the one matching that name.
 */
export function getResourceContainer(resource: HotReloadableResource, containerName?: string): V1Container {
  const kind = resource.kind
  const name = resource.metadata.name

  const containers = getResourcePodSpec(resource)?.containers || []

  if (containers.length === 0) {
    throw new ConfigurationError(`${kind} ${resource.metadata.name} has no containers configured.`, { resource })
  }

  const container = containerName ? findByName(containers, containerName) : containers[0]

  if (!container) {
    throw new ConfigurationError(`Could not find container '${containerName}' in ${kind} '${name}'`, {
      resource,
      containerName,
    })
  }

  return container
}

export function getResourcePodSpec(resource: HotReloadableResource): V1PodSpec | undefined {
  return resource.spec.template.spec
}

const maxPodNameLength = 63
const podNameHashLength = 6
const maxPodNamePrefixLength = maxPodNameLength - podNameHashLength - 1

/**
 * Generates a valid Pod name, given a type, and other identifiers (e.g. module name, task name, test name etc.).
 * Creates a hash suffix to uniquely identify the Pod, and composes the type and identifiers into a prefix (up to a
 * maximum length).
 *
 * @param type the type of Pod, e.g. `task` or `test`
 * @param ...parts the name of the module associated with the Pod
 * @param key the specific key of the task, test etc.
 */
export function makePodName(type: string, ...parts: string[]) {
  const id = `${type}-${parts.join("-")}`
  const hash = hasha(`${id}-${Math.round(new Date().getTime())}`, { algorithm: "sha1" })
  return id.slice(0, maxPodNamePrefixLength) + "-" + hash.slice(0, podNameHashLength)
}

/**
 * Gets the Docker auth volume details to be mounted into a container.
 */
export function getDockerAuthVolume() {
  return {
    name: dockerAuthSecretName,
    secret: {
      secretName: dockerAuthSecretName,
      items: [{ key: dockerAuthSecretKey, path: "config.json" }],
    },
  }
}

/**
 * Creates a skopeo container configuration to be execued by a PodRunner.
 *
 * @param command the skopeo command to execute
 */
export function getSkopeoContainer(command: string) {
  return {
    name: "skopeo",
    image: skopeoImage,
    command: ["sh", "-c", command],
    volumeMounts: [
      {
        name: dockerAuthSecretName,
        mountPath: "/root/.docker",
        readOnly: true,
      },
    ],
  }
}

/**
 * Given a map of providers, find the kuberetes provider, or one based on it.
 */
export function getK8sProvider(providers: ProviderMap): KubernetesProvider {
  if (providers.kubernetes) {
    return providers.kubernetes as KubernetesProvider
  }

  // TODO: use the plugin inheritance mechanism here instead of the direct name check
  const provider = Object.values(providers).find((p) => p.name === "kubernetes" || p.name === "local-kubernetes")

  if (!provider) {
    throw new ConfigurationError(`Could not find a configured kubernetes (or local-kubernetes) provider`, {
      configuredProviders: Object.keys(providers),
    })
  }

  return provider as KubernetesProvider
}
