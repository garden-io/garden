/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { get, flatten, sortBy, omit, chain, sample, isEmpty, find, cloneDeep } from "lodash"
import { V1Pod, V1EnvVar, V1Container, V1PodSpec, CoreV1Event } from "@kubernetes/client-node"
import { apply as jsonMerge } from "json-merge-patch"
import chalk from "chalk"
import hasha from "hasha"

import { KubernetesResource, KubernetesWorkload, KubernetesPod, KubernetesServerResource, isPodResource } from "./types"
import { splitLast, serializeValues, findByName, exec } from "../../util/util"
import { KubeApi, KubernetesError } from "./api"
import { gardenAnnotationKey, base64, deline, stableStringify } from "../../util/string"
import { inClusterRegistryHostname, MAX_CONFIGMAP_DATA_SIZE } from "./constants"
import { ContainerEnvVars } from "../container/config"
import { ConfigurationError, DeploymentError, PluginError } from "../../exceptions"
import { ServiceResourceSpec, KubernetesProvider, KubernetesPluginContext } from "./config"
import { LogEntry } from "../../logger/log-entry"
import { PluginContext } from "../../plugin-context"
import { HelmModule } from "./helm/config"
import { KubernetesModule } from "./kubernetes-module/config"
import { getChartPath, renderHelmTemplateString } from "./helm/common"
import { SyncableResource } from "./hot-reload/hot-reload"
import { ProviderMap } from "../../config/provider"
import { PodRunner } from "./run"
import { isSubset } from "../../util/is-subset"
import { checkPodStatus } from "./status/pod"
import { getModuleNamespace } from "./namespace"

const STATIC_LABEL_REGEX = /[0-9]/g
export const workloadTypes = ["Deployment", "DaemonSet", "ReplicaSet", "StatefulSet"]

export function getAnnotation(obj: KubernetesResource, key: string): string | null {
  return get(obj, ["metadata", "annotations", key])
}

export function getResourceKey(resource: KubernetesResource) {
  return `${resource.kind}/${resource.metadata.name}`
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
  const pods: KubernetesPod[] = flatten(
    await Bluebird.map(resources, async (resource) => {
      if (resource.apiVersion === "v1" && resource.kind === "Pod") {
        return [<KubernetesServerResource<V1Pod>>resource]
      }

      if (isWorkload(resource)) {
        return getWorkloadPods(api, resource.metadata?.namespace || defaultNamespace, <KubernetesWorkload>resource)
      }

      return []
    })
  )

  return pods
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

interface K8sVersion {
  major: number
  minor: number
  gitVersion: string
  gitCommit: string
  gitTreeState: string
  buildDate: Date
  goVersion: string
  compiler: string
  platform: string
}

export interface K8sClientServerVersions {
  clientVersion: K8sVersion
  serverVersion: K8sVersion
}

/**
 * get objectyfied result of "kubectl version"
 */
export async function getK8sClientServerVersions(ctx: string): Promise<K8sClientServerVersions> {
  const versions: K8sClientServerVersions = JSON.parse(
    (await exec("kubectl", ["version", "--context", ctx, "--output", "json"])).stdout
  )
  return versions
}

/**
 * Retrieve a list of pods based on the resource selector, deduplicated so that only the most recent
 * pod is returned when multiple pods with the same label are found.
 */
export async function getCurrentWorkloadPods(
  api: KubeApi,
  namespace: string,
  resource: KubernetesWorkload | KubernetesPod
) {
  return deduplicatePodsByLabel(await getWorkloadPods(api, namespace, resource))
}

/**
 * Retrieve a list of pods based on the given resource/manifest. If passed a Pod manifest, it's read from the
 * remote namespace and returned directly.
 */
export async function getWorkloadPods(api: KubeApi, namespace: string, resource: KubernetesWorkload | KubernetesPod) {
  if (isPodResource(resource)) {
    return [await api.core.readNamespacedPod(resource.metadata.name, resource.metadata.namespace || namespace)]
  }

  // We don't match on the garden.io/version label because it can fall out of sync during hot reloads
  const selector = omit(getSelectorFromResource(resource), gardenAnnotationKey("version"))
  const pods = await getPods(api, resource.metadata?.namespace || namespace, selector)

  if (resource.kind === "Deployment") {
    // Make sure we only return the pods from the current ReplicaSet
    const selectorString = labelSelectorToString(selector)
    const replicaSetRes = await api.apps.listNamespacedReplicaSet(
      resource.metadata?.namespace || namespace,
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
}

/**
 * Retrieve a list of *ready* pods based on the provided label selector.
 */
export async function getReadyPods(api: KubeApi, namespace: string, selector: { [key: string]: string }) {
  const pods = await getPods(api, namespace, selector)
  return pods.filter((pod) => checkPodStatus(pod) === "ready")
}

export async function execInWorkload({
  ctx,
  provider,
  log,
  namespace,
  workload,
  command,
  interactive,
}: {
  ctx: PluginContext
  provider: KubernetesProvider
  log: LogEntry
  namespace: string
  workload: KubernetesWorkload | KubernetesPod
  command: string[]
  interactive: boolean
}) {
  const api = await KubeApi.factory(log, ctx, provider)
  const pods = await getCurrentWorkloadPods(api, namespace, workload)

  const pod = pods[0]

  if (!pod) {
    // This should not happen because of the prior status check, but checking to be sure
    throw new DeploymentError(`Could not find running pod for ${workload.kind}/${workload.metadata.name}`, {
      workload,
    })
  }

  const runner = new PodRunner({
    api,
    ctx,
    provider,
    namespace,
    pod,
  })

  const res = await runner.exec({
    log,
    command,
    timeoutSec: 999999,
    tty: interactive,
    buffer: true,
  })

  return { code: res.exitCode, output: res.log }
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

/**
 * Given a deployment name, return a running Pod from it, or throw if none is found.
 */
export async function getRunningDeploymentPod({
  api,
  deploymentName,
  namespace,
}: {
  api: KubeApi
  deploymentName: string
  namespace: string
}) {
  const resource = await api.apps.readNamespacedDeployment(deploymentName, namespace)
  const pods = await getWorkloadPods(api, namespace, resource)
  const pod = sample(pods.filter((p) => checkPodStatus(p) === "ready"))
  if (!pod) {
    throw new PluginError(`Could not find a running Pod in Deployment ${deploymentName}`, {
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
  return Object.entries(labels)
    .map(([k, v]) => `${k}=${v}`)
    .join(",")
}

/**
 * Returns true if the provided matchLabels selector matches the given labels. Use to e.g. match the selector on a
 * Service with Pod templates from a Deployment.
 *
 * @param selector The selector on the Service, or the `matchLabels` part of a Deployment spec selector
 * @param labels The workload labels to match agains
 */
export function matchSelector(selector: { [key: string]: string }, labels: { [key: string]: string }) {
  return Object.keys(selector).length > 0 && isSubset(labels, selector)
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
    resourceSpec = jsonMerge(cloneDeep(baseModule.spec.serviceResource || {}), resourceSpec)
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
  provider: KubernetesProvider
  manifests: KubernetesResource[]
  module: HelmModule | KubernetesModule
  resourceSpec: ServiceResourceSpec
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
export async function getServiceResource({
  ctx,
  log,
  provider,
  manifests,
  module,
  resourceSpec,
}: GetServiceResourceParams): Promise<SyncableResource> {
  const resourceMsgName = resourceSpec ? "resource" : "serviceResource"

  if (resourceSpec.podSelector && !isEmpty(resourceSpec.podSelector)) {
    const api = await KubeApi.factory(log, ctx, provider)
    const k8sCtx = ctx as KubernetesPluginContext
    const namespace = await getModuleNamespace({
      ctx: k8sCtx,
      log,
      module,
      provider: k8sCtx.provider,
    })

    const pods = await getReadyPods(api, namespace, resourceSpec.podSelector)
    const pod = sample(pods)
    if (!pod) {
      const selectorStr = getSelectorString(resourceSpec.podSelector)
      throw new ConfigurationError(
        chalk.red(
          `Could not find any Pod matching provided podSelector (${selectorStr}) for ${resourceMsgName} in ` +
            `${module.type} module ${chalk.white(module.name)}`
        ),
        { resourceSpec }
      )
    }
    return pod
  }

  let targetName = resourceSpec.name
  let target: SyncableResource

  const targetKind = resourceSpec.kind
  const chartResourceNames = manifests.map((o) => `${o.kind}/${o.metadata.name}`)

  const applicableChartResources = manifests.filter((o) => o.kind === targetKind)

  if (targetKind && targetName) {
    if (module.type === "helm" && targetName.includes("{{")) {
      // need to resolve the template string
      const chartPath = await getChartPath(<HelmModule>module)
      targetName = await renderHelmTemplateString(ctx, log, module as HelmModule, chartPath, targetName)
    }

    target = find(<SyncableResource[]>manifests, (o) => o.kind === targetKind && o.metadata.name === targetName)!

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
          You must specify a resource name in the appropriate config in order to identify the correct ${targetKind}
          to use.`
        ),
        { resourceSpec, chartResourceNames }
      )
    }

    target = <SyncableResource>applicableChartResources[0]
  }

  return target
}

/**
 * From the given Deployment, DaemonSet, StatefulSet or Pod resource, get either the first container spec,
 * or if `containerName` is specified, the one matching that name.
 */
export function getResourceContainer(resource: SyncableResource, containerName?: string): V1Container {
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

export function getResourcePodSpec(resource: KubernetesWorkload | KubernetesPod): V1PodSpec | undefined {
  return isPodResource(resource) ? resource.spec : resource.spec.template?.spec
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
 * Given a map of providers, find the kubernetes provider, or one based on it.
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

/**
 * Returns true if the in-cluster registry is being used by the given `kubernetes` provider.
 */
export function usingInClusterRegistry(provider: KubernetesProvider) {
  return provider.config.deploymentRegistry?.hostname === inClusterRegistryHostname
}

export function renderPodEvents(events: CoreV1Event[]): string {
  let text = ""

  text += `${chalk.white("━━━ Events ━━━")}\n`
  for (const event of events) {
    const obj = event.involvedObject
    const name = chalk.blueBright(`${obj.kind} ${obj.name}:`)
    const msg = `${event.reason} - ${event.message}`
    const colored =
      event.type === "Error" ? chalk.red(msg) : event.type === "Warning" ? chalk.yellow(msg) : chalk.white(msg)
    text += `${name} ${colored}\n`
  }

  if (events.length === 0) {
    text += `${chalk.red("No matching events found")}\n`
  }

  return text
}

export function summarize(resources: KubernetesResource[]) {
  return resources.map((r) => `${r.kind} ${r.metadata.name}`).join(", ")
}
