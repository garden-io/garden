/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { cloneDeep, find, flatten, get, isEmpty, omit, sample, sortBy, uniqBy } from "lodash-es"
import type { CoreV1Event, V1Container, V1EnvVar, V1Pod, V1PodSpec } from "@kubernetes/client-node"
import { apply as jsonMerge } from "json-merge-patch"
import { hashSync } from "hasha"

import type {
  KubernetesPod,
  KubernetesResource,
  KubernetesServerResource,
  KubernetesWorkload,
  SupportedRuntimeAction,
  SyncableResource,
} from "./types.js"
import { isPodResource } from "./types.js"
import { findByName } from "../../util/util.js"
import { KubeApi, KubernetesError } from "./api.js"
import { base64, dedent, deline, naturalList, splitLast, stableStringify, truncate } from "../../util/string.js"
import { gardenAnnotationKey } from "../../util/annotations.js"
import { MAX_CONFIGMAP_DATA_SIZE } from "./constants.js"
import type { ContainerEnvVars } from "../container/moduleConfig.js"
import { ConfigurationError, DeploymentError, InternalError, PluginError } from "../../exceptions.js"
import type { KubernetesPluginContext, KubernetesProvider, KubernetesTargetResourceSpec } from "./config.js"
import type { Log } from "../../logger/log-entry.js"
import type { PluginContext } from "../../plugin-context.js"
import type { HelmModule } from "./helm/module-config.js"
import type { KubernetesModule } from "./kubernetes-type/module-config.js"
import { prepareTemplates, renderHelmTemplateString } from "./helm/common.js"
import type { ProviderMap } from "../../config/provider.js"
import type { PodRunnerExecParams } from "./run.js"
import { PodRunner } from "./run.js"
import { isSubset } from "../../util/is-subset.js"
import { checkPodStatus } from "./status/pod.js"
import { getActionNamespace } from "./namespace.js"
import type { ActionStatus, Resolved } from "../../actions/types.js"
import { serializeValues } from "../../util/serialization.js"
import { PassThrough } from "stream"
import { styles } from "../../logger/styles.js"
import type { RunResult } from "../../plugin/base.js"
import { runResultToActionState } from "../../actions/base.js"

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
  return hashSync(stableStringify(manifest), { algorithm: "sha256" })
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
    await Promise.all(
      resources.map(async (resource) => {
        if (resource.apiVersion === "v1" && resource.kind === "Pod") {
          return [<KubernetesServerResource<V1Pod>>resource]
        }

        if (isWorkload(resource)) {
          return getWorkloadPods({
            api,
            namespace: resource.metadata?.namespace || defaultNamespace,
            resource: <KubernetesWorkload>resource,
          })
        }

        return []
      })
    )
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
  throw new ConfigurationError({
    message: `No selector found for ${resource.metadata.name} while retrieving pods.`,
  })
}

/**
 * Deduplicates a list of pods by label, so that only the most recent pod is returned.
 */
export function deduplicatePodsByLabel(pods: KubernetesServerResource<V1Pod>[]) {
  // We don't filter out pods with no labels
  const noLabel = pods.filter((pod) => isEmpty(pod.metadata.labels))
  const labeled = pods.filter((pod) => !isEmpty(pod.metadata.labels))
  const labeledByCreation = sortBy(labeled, (pod) => pod.metadata.creationTimestamp).reverse() // We only want the most recent pod in case of duplicates
  const uniqByLabel = uniqBy(labeledByCreation, (pod) => JSON.stringify(pod.metadata.labels))

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
 * Retrieve a list of pods based on the resource selector, deduplicated so that only the most recent
 * pod is returned when multiple pods with the same label are found.
 */
export async function getCurrentWorkloadPods(
  api: KubeApi,
  namespace: string,
  resource: KubernetesWorkload | KubernetesPod
) {
  return deduplicatePodsByLabel(await getWorkloadPods({ api, namespace, resource }))
}

/**
 * Retrieve a list of pods based on the given resource/manifest. If passed a Pod manifest, it's read from the
 * remote namespace and returned directly.
 *
 * In the case of Deployments, only the pods belonging the latest ReplicaSet are returned.
 */
export async function getWorkloadPods({
  api,
  namespace,
  resource,
}: {
  api: KubeApi
  namespace: string
  resource: KubernetesWorkload | KubernetesPod
}) {
  if (isPodResource(resource)) {
    return [
      await api.core.readNamespacedPod({
        name: resource.metadata.name,
        namespace: resource.metadata.namespace || namespace,
      }),
    ]
  }

  // We don't match on the garden.io/version label because it can fall out of sync
  const selector = omit(getSelectorFromResource(resource), gardenAnnotationKey("version"))
  const pods = await getPods(api, resource.metadata?.namespace || namespace, selector)

  if (resource.kind === "Deployment") {
    // Make sure we only return the pods from the current ReplicaSet
    const selectorString = labelSelectorToString(selector)
    const replicaSetRes = await api.apps.listNamespacedReplicaSet({
      namespace: resource.metadata?.namespace || namespace,
      labelSelector: selectorString,
    })

    const replicaSets = replicaSetRes.items.filter((r) => (r.spec.replicas || 0) > 0)

    if (replicaSets.length === 0) {
      return []
    }

    const sorted = sortBy(replicaSets, (r) => r.metadata.creationTimestamp!)
    const currentReplicaSet = sorted[replicaSets.length - 1]
    return pods.filter((p) => p.metadata.name.startsWith(currentReplicaSet.metadata.name))
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
  const res = await api.core.listNamespacedPod({
    namespace,
    labelSelector: selectorString,
  })

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
  containerName,
  streamLogs = false,
  interactive,
}: {
  ctx: PluginContext
  provider: KubernetesProvider
  log: Log
  namespace: string
  workload: KubernetesWorkload | KubernetesPod
  command: string[]
  containerName?: string
  streamLogs?: boolean
  interactive: boolean
}) {
  const api = await KubeApi.factory(log, ctx, provider)
  const pods = await getCurrentWorkloadPods(api, namespace, workload)

  const runningPods = pods.filter((p) => checkPodStatus(p) === "ready")
  if (runningPods.length === 0) {
    throw new DeploymentError({
      message: `No running pods found for ${getResourceKey(workload)}`,
    })
  }

  const pod = sample(runningPods)

  if (!pod) {
    // This should not happen because of the prior status check, but checking to be sure
    throw new DeploymentError({
      message: `Could not find running pod for ${getResourceKey(workload)}`,
    })
  }

  const execParams: PodRunnerExecParams = {
    log,
    command,
    timeoutSec: 999999,
    tty: interactive,
    buffer: true,
    containerName,
  }

  if (streamLogs) {
    const logEventContext = {
      // To avoid an awkwardly long prefix for the log lines when rendered, we set a max length here.
      origin: truncate(command.join(" "), 25),
      level: "verbose" as const,
    }

    const outputStream = new PassThrough()
    outputStream.on("error", () => {})
    outputStream.on("data", (line: Buffer) => {
      // For some reason, we're getting extra newlines for each line here, so we trim them.
      const msg = line.toString().trimEnd()
      ctx.events.emit("log", { timestamp: new Date().toISOString(), msg, ...logEventContext })
      log.verbose(msg)
    })
    execParams.stdout = outputStream
    execParams.stderr = outputStream
  }

  const runner = new PodRunner({
    api,
    ctx,
    provider,
    namespace,
    pod,
  })

  const res = await runner.exec(execParams)

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
    throw new KubernetesError({
      message: `Attempting to store too much data in ConfigMap ${key} (namespace: ${namespace})`,
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
    await api.core.createNamespacedConfigMap({ namespace, body })
  } catch (err) {
    if (!(err instanceof KubernetesError)) {
      throw err
    }
    if (err.responseStatusCode === 409) {
      await api.core.patchNamespacedConfigMap({ name: key, namespace, body })
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
export function flattenResources(resources: KubernetesResource[]): KubernetesResource[] {
  return flatten(resources.map((r: KubernetesResource) => (r.apiVersion === "v1" && r.kind === "List" ? r.items : [r])))
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
          throw new ConfigurationError({
            message: `kubernetes: Must specify \`key\` on secretRef for env variable ${name}`,
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
  const resource = await api.apps.readNamespacedDeployment({ name: deploymentName, namespace })
  const pods = await getWorkloadPods({ api, namespace, resource })
  const pod = sample(pods.filter((p) => checkPodStatus(p) === "ready"))
  if (!pod) {
    throw new PluginError({
      message: `Could not find a running Pod in Deployment ${deploymentName} in namespace ${namespace}`,
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
 * @param labels The workload labels to match against
 */
export function matchSelector(selector: { [key: string]: string }, labels: { [key: string]: string }) {
  return Object.keys(selector).length > 0 && isSubset(labels, selector)
}

/**
 * Returns the `serviceResource` spec on the module. If the module has a base module, the two resource specs
 * are merged using a JSON Merge Patch (RFC 7396).
 *
 * Returns undefined if no resource spec is configured, or it is empty.
 */
export function getServiceResourceSpec(module: HelmModule | KubernetesModule, baseModule: HelmModule | undefined) {
  let resourceSpec = module.spec.serviceResource || {}

  if (baseModule) {
    resourceSpec = jsonMerge(cloneDeep(baseModule.spec.serviceResource || {}), resourceSpec)
  }

  return isEmpty(resourceSpec) ? undefined : resourceSpec
}

interface GetTargetResourceParams {
  ctx: PluginContext
  log: Log
  provider: KubernetesProvider
  manifests?: KubernetesResource[]
  action: Resolved<SupportedRuntimeAction>
  query: KubernetesTargetResourceSpec
}

/**
 * Finds and returns the configured resource.
 *
 * If a `podSelector` is set on the query, we look for a running Pod matching the selector.
 * If `manifests` are provided and the query doesn't set a `podSelector`, the resource is looked for in the given list.
 * Otherwise, the project namespace is queried for resource matching the kind and name in the query.
 *
 * Throws an error if an invalid query is given, or the resource spec doesn't match any of the given resources.
 */
export async function getTargetResource({
  ctx,
  log,
  provider,
  manifests,
  action,
  query,
}: GetTargetResourceParams): Promise<SyncableResource> {
  const api = await KubeApi.factory(log, ctx, provider)
  const k8sCtx = ctx as KubernetesPluginContext
  const namespace = await getActionNamespace({
    ctx: k8sCtx,
    log,
    action,
    provider: k8sCtx.provider,
  })

  if (query.podSelector && !isEmpty(query.podSelector)) {
    const pods = await getReadyPods(api, namespace, query.podSelector)
    const pod = sample(pods)
    if (!pod) {
      const selectorStr = getSelectorString(query.podSelector)
      throw new ConfigurationError({
        message:
          `Could not find any Pod matching provided podSelector (${selectorStr}) for target in ` +
          `${action.longDescription()}`,
      })
    }
    return pod
  }

  const targetKind = query.kind
  let targetName = query.name
  let target: SyncableResource

  if (!targetKind) {
    // This should be caught in config/schema validation
    throw new InternalError({
      message: `Neither kind nor podSelector set in resource query defined in ${action.longDescription()}`,
    })
  }

  // Look in the specified manifests, if provided
  if (manifests) {
    const chartResourceNames = manifests.map((o) => getResourceKey(o))

    const applicableChartResources = manifests.filter((o) => o.kind === targetKind)

    if (targetKind && targetName) {
      if (action.type === "helm" && targetName.includes("{{")) {
        // need to resolve the Helm template string
        const { chartPath, valuesPath, reference } = await prepareTemplates({ ctx: k8sCtx, action, log })
        targetName = await renderHelmTemplateString({
          ctx,
          log,
          action,
          chartPath,
          reference,
          value: targetName,
          valuesPath,
        })
      }

      target = find(<SyncableResource[]>applicableChartResources, (o) => o.metadata.name === targetName)!

      if (!target) {
        throw new ConfigurationError({
          message: dedent`
            ${action.longDescription()} does not contain specified ${targetKind} ${styles.highlight(targetName)}

            The chart does declare the following resources: ${naturalList(chartResourceNames)}
            `,
        })
      }
    } else {
      if (applicableChartResources.length === 0) {
        throw new ConfigurationError({
          message: dedent`
            ${action.longDescription()} contains no ${targetKind}s.

            The chart does declare the following resources: ${naturalList(chartResourceNames)}
            `,
        })
      }

      if (applicableChartResources.length > 1) {
        throw new ConfigurationError({
          message: deline`${action.longDescription()} contains multiple ${targetKind}s.
            You must specify a resource name in the appropriate config in order to identify the correct ${targetKind}
            to use.

            The chart declares the following resources: ${naturalList(chartResourceNames)}
            `,
        })
      }

      target = <SyncableResource>applicableChartResources[0]
    }

    return target
  }

  // No manifests provided, need to look up in the remote namespace
  try {
    target = await readTargetResource({ api, namespace, query })
    return target
  } catch (err) {
    if (!(err instanceof KubernetesError)) {
      throw err
    }
    if (err.responseStatusCode === 404) {
      throw new ConfigurationError({
        message: deline`${action.longDescription()} specifies target resource ${targetKind}/${targetName}, which could not be found in namespace ${namespace}.`,
      })
    } else {
      throw err
    }
  }
}

export async function readTargetResource({
  api,
  namespace,
  query,
}: {
  api: KubeApi
  namespace: string
  query: KubernetesTargetResourceSpec
}): Promise<SyncableResource> {
  const targetKind = query.kind
  const targetName = query.name

  if (!targetName) {
    // This should be caught in config/schema validation
    throw new InternalError({ message: `Must specify name in resource/target query` })
  }

  if (targetKind === "Deployment") {
    return api.apps.readNamespacedDeployment({ name: targetName, namespace })
  } else if (targetKind === "DaemonSet") {
    return api.apps.readNamespacedDaemonSet({ name: targetName, namespace })
  } else if (targetKind === "StatefulSet") {
    return api.apps.readNamespacedStatefulSet({ name: targetName, namespace })
  } else {
    // This should be caught in config/schema validation
    throw new InternalError({
      message: dedent`Unsupported kind ${targetKind} specified in resource/target query`,
    })
  }
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
    throw new ConfigurationError({
      message: `${kind} ${resource.metadata.name} has no containers configured.`,
    })
  }

  const container = containerName ? findByName(containers, containerName) : containers[0]

  if (!container) {
    throw new ConfigurationError({
      message: `Could not find container '${containerName}' in ${kind} '${name}'`,
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
 * @param parts the name of the module associated with the Pod
 * @param key the specific key of the task, test etc.
 */
export function makePodName(type: string, ...parts: string[]) {
  const id = `${type.toLowerCase()}-${parts.join("-")}`
  const hash = hashSync(`${id}-${Math.round(new Date().getTime())}`, { algorithm: "sha1" })
  return id.slice(0, maxPodNamePrefixLength) + "-" + hash.slice(0, podNameHashLength)
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
    throw new ConfigurationError({
      message: `Could not find a configured kubernetes (or local-kubernetes) provider. Configured providers: ${naturalList(
        Object.keys(providers)
      )}`,
    })
  }

  return provider as KubernetesProvider
}

export function renderWorkloadEvents(events: CoreV1Event[], workloadKind: string, workloadName: string): string {
  let text = ""

  text += `${styles.accent(`━━━ Latest events from ${workloadKind} ${workloadName} ━━━`)}\n`
  for (const event of events) {
    const obj = event.involvedObject
    const name = styles.highlight(`${obj.kind} ${obj.name}:`)
    const msg = `${event.reason} - ${event.message}`
    const colored =
      event.type === "Error"
        ? styles.error(msg)
        : event.type === "Warning"
          ? styles.warning(msg)
          : styles.highlight(msg)
    text += `${name} ${colored}\n`
  }

  if (events.length === 0) {
    text += `${styles.error("<No events found>")}\n`
  }

  return text
}

export function summarize(resources: KubernetesResource[]) {
  return resources.map((r) => `${r.kind} ${r.metadata.name}`).join(", ")
}

/**
 * Filter out all volumes and volumeMounts that are not a ConfigMaps or Secrets,
 * since they will probably cause issues when creating a pod runner from a chart or larger manifest.
 *
 * This is not a pure function, i.e. it has side effects and can mutate the input arguments.
 *
 * This sanitization only makes sense when both `podSpec` and `containerSpec` are defined.
 * It serves helm-pod and kubernetes-pod action types.
 */
export function sanitizeVolumesForPodRunner(podSpec: V1PodSpec | undefined, containerSpec: V1Container | undefined) {
  if (!podSpec) {
    return
  }
  if (!podSpec.volumes) {
    return
  }
  if (!containerSpec) {
    return
  }

  // Sanitize volumes
  podSpec.volumes = podSpec.volumes.filter((volume) => volume.configMap || volume.secret)

  // Sanitize volumeMounts
  const retainedVolumes = new Set(podSpec?.volumes?.map((volume) => volume.name))
  containerSpec.volumeMounts = containerSpec.volumeMounts?.filter((volumeMount) => {
    return retainedVolumes.has(volumeMount.name)
  })

  /*
  Here we get the `containerSpec` and the `podSpec` as separate arguments,
  so we can't be sure that `containerSpec` object   has the same identity as one of the containers defined in `podSpec.containers`.

  The names of these 2 containers can also be different
  because we always override the container name in the caller function `prepareRunPodSpec()`.

  Thus, we need to sanitize `podSpec.containers` explicitly.
   */
  for (const podSpecContainer of podSpec.containers) {
    podSpecContainer.volumeMounts = podSpecContainer.volumeMounts?.filter((volumeMount) => {
      return retainedVolumes.has(volumeMount.name)
    })
  }

  // We also make sure the defaultMode of a configMap volume is an octal number.
  podSpec.volumes.forEach((volume) => {
    if (volume.configMap && volume.configMap.defaultMode && !isOctal(volume.configMap.defaultMode.toString())) {
      volume.configMap!.defaultMode = parseInt(`0${volume.configMap?.defaultMode}`, 8)
    }
  })
}

export function isOctal(value: string) {
  return /^(0o?)[0-7]+$/i.test(value)
}

export function toActionStatus<T extends RunResult>(detail: T): ActionStatus {
  return { state: runResultToActionState(detail), detail, outputs: { log: detail.log } }
}
