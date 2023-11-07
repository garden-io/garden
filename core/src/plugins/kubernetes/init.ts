/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { KubeApi, KubernetesError } from "./api.js"
import {
  getAppNamespace,
  prepareNamespaces,
  deleteNamespaces,
  getSystemNamespace,
  getNamespaceStatus,
  clearNamespaceCache,
} from "./namespace.js"
import type { KubernetesPluginContext, KubernetesConfig, KubernetesProvider, ProviderSecretRef } from "./config.js"
import { prepareSystemServices, getSystemServiceStatus, getSystemGarden } from "./system.js"
import type {
  GetEnvironmentStatusParams,
  EnvironmentStatus,
} from "../../plugin/handlers/Provider/getEnvironmentStatus.js"
import type {
  PrepareEnvironmentParams,
  PrepareEnvironmentResult,
} from "../../plugin/handlers/Provider/prepareEnvironment.js"
import type {
  CleanupEnvironmentParams,
  CleanupEnvironmentResult,
} from "../../plugin/handlers/Provider/cleanupEnvironment.js"
import { millicpuToString, megabytesToString } from "./util.js"
import chalk from "chalk"
import { deline, dedent, gardenAnnotationKey } from "../../util/string.js"
import type { DeployState } from "../../types/service.js"
import { combineStates } from "../../types/service.js"
import { ConfigurationError } from "../../exceptions.js"
import { readSecret } from "./secrets.js"
import { systemDockerAuthSecretName, dockerAuthSecretKey } from "./constants.js"
import type { V1IngressClass, V1Secret, V1Toleration } from "@kubernetes/client-node"
import type { KubernetesResource } from "./types.js"
import { compareDeployedResources } from "./status/status.js"
import type { PrimitiveMap } from "../../config/common.js"
import { mapValues, omit } from "lodash-es"
import { getIngressApiVersion, supportedIngressApiVersions } from "./container/ingress.js"
import type { Log } from "../../logger/log-entry.js"
import type { DeployStatusMap } from "../../plugin/handlers/Deploy/get-status.js"
import { isProviderEphemeralKubernetes } from "./ephemeral/ephemeral.js"

const dockerAuthSecretType = "kubernetes.io/dockerconfigjson"
const dockerAuthDocsLink = `
See https://kubernetes.io/docs/tasks/configure-pod-container/pull-image-private-registry/ for how to create
a registry auth secret.
`

interface KubernetesProviderOutputs extends PrimitiveMap {
  "app-namespace": string
  "default-hostname": string | null
}

interface KubernetesEnvironmentDetail {
  deployStatuses: DeployStatusMap
  systemReady: boolean
  systemServiceState: DeployState
  systemCertManagerReady: boolean
  systemManagedCertificatesReady: boolean
}

type KubernetesEnvironmentStatus = EnvironmentStatus<KubernetesProviderOutputs, KubernetesEnvironmentDetail>

/**
 * Checks system service statuses (if provider has system services)
 *
 * Returns ready === true if all the above are ready.
 */
export async function getEnvironmentStatus({
  ctx,
  log,
}: GetEnvironmentStatusParams): Promise<KubernetesEnvironmentStatus> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const api = await KubeApi.factory(log, ctx, provider)

  const namespaces = await prepareNamespaces({ ctx, log })
  const systemServiceNames = k8sCtx.provider.config._systemServices
  const systemNamespace = await getSystemNamespace(k8sCtx, k8sCtx.provider, log)

  const detail: KubernetesEnvironmentDetail = {
    deployStatuses: {},
    systemReady: true,
    systemServiceState: <DeployState>"unknown",
    systemCertManagerReady: true,
    systemManagedCertificatesReady: true,
  }

  const ingressApiVersion = await getIngressApiVersion(log, api, supportedIngressApiVersions)
  const ingressWarnings = await getIngressMisconfigurationWarnings(
    provider.config.ingressClass,
    ingressApiVersion,
    log,
    api
  )
  ingressWarnings.forEach((w) => log.warn(w))

  const namespaceNames = mapValues(namespaces, (s) => s.namespaceName)
  const result: KubernetesEnvironmentStatus = {
    ready: true,
    detail,
    outputs: {
      ...namespaceNames,
      "default-hostname": provider.config.defaultHostname || null,
    },
  }

  if (
    // No need to continue if we don't need any system services
    systemServiceNames.length === 0 ||
    // Make sure we don't recurse infinitely
    provider.config.namespace?.name === systemNamespace
  ) {
    return result
  }

  const variables = getKubernetesSystemVariables(provider.config)
  const sysGarden = await getSystemGarden(k8sCtx, variables || {}, log)

  // Check if builder auth secret is up-to-date
  let secretsUpToDate = true

  if (provider.config.buildMode !== "local-docker") {
    const authSecret = await prepareDockerAuth(api, provider, systemNamespace)
    const comparison = await compareDeployedResources({
      ctx: k8sCtx,
      api,
      namespace: systemNamespace,
      manifests: [authSecret],
      log,
    })
    secretsUpToDate = comparison.state === "ready"
  }

  // Get system service statuses
  const systemServiceStatus = await getSystemServiceStatus({
    ctx: k8sCtx,
    log,
    sysGarden,
    namespace: systemNamespace,
    names: systemServiceNames,
  })

  if (!secretsUpToDate || systemServiceStatus.state !== "ready") {
    result.ready = false
    detail.systemReady = false
  }

  detail.deployStatuses = mapValues(systemServiceStatus.serviceStatuses, (s) => omit(s, "executedAction"))
  detail.systemServiceState = systemServiceStatus.state

  sysGarden.log.success("Done")

  return result
}

export async function getIngressMisconfigurationWarnings(
  customIngressClassName: string | undefined,
  ingressApiVersion: string | undefined,
  log: Log,
  api: KubeApi
): Promise<string[]> {
  if (!customIngressClassName) {
    return []
  }

  const warnings: string[] = []

  if (ingressApiVersion === "networking.k8s.io/v1") {
    // Note: We do not create the IngressClass resource automatically here so add a warning if it's not there!
    const ingressclasses = await api.listResources<KubernetesResource<V1IngressClass>>({
      apiVersion: ingressApiVersion,
      kind: "IngressClass",
      log,
      namespace: "all",
    })
    const ingressclassWithCorrectName = ingressclasses.items.find((ic) => ic.metadata.name === customIngressClassName)
    if (!ingressclassWithCorrectName) {
      warnings.push(deline`An ingressClass “${customIngressClassName}" was set in the provider config for the Kubernetes provider
        but no matching IngressClass resource was found in the cluster.
        IngressClass resources are typically created by your Ingress Controller so this may suggest that it has not been properly set up.`)
    }
  }

  return warnings
}

/**
 * Deploys system services (if any)
 */
export async function prepareEnvironment(
  params: PrepareEnvironmentParams<KubernetesConfig, KubernetesEnvironmentStatus>
): Promise<PrepareEnvironmentResult> {
  const { ctx, log, status } = params
  const k8sCtx = <KubernetesPluginContext>ctx

  // Prepare system services
  await prepareSystem({ ...params, clusterInit: false })
  const nsStatus = await getNamespaceStatus({ ctx: k8sCtx, log, provider: k8sCtx.provider })
  ctx.events.emit("namespaceStatus", nsStatus)
  return { status: { ready: true, outputs: status.outputs } }
}

export async function prepareSystem({
  ctx,
  log,
  force,
  status,
  clusterInit,
}: PrepareEnvironmentParams<KubernetesConfig, KubernetesEnvironmentStatus> & { clusterInit: boolean }) {
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const variables = getKubernetesSystemVariables(provider.config)

  const systemReady = status.detail && !!status.detail.systemReady && !force
  const systemServiceNames = k8sCtx.provider.config._systemServices

  if (systemServiceNames.length === 0 || systemReady) {
    return {}
  }

  const deployStatuses: DeployStatusMap = (status.detail && status.detail.deployStatuses) || {}
  const serviceStates = Object.values(deployStatuses).map((s) => s.detail?.state || "unknown")
  const combinedState = combineStates(serviceStates)

  const remoteCluster = provider.name !== "local-kubernetes"

  // Don't attempt to prepare environment automatically when running the init or uninstall commands
  if (
    !clusterInit &&
    ctx.command?.name === "plugins" &&
    (ctx.command?.args.command === "uninstall-garden-services" || ctx.command?.args.command === "cluster-init")
  ) {
    return {}
  }

  // We require manual init if we're installing any system services to remote clusters unless the remote cluster
  // is an ephemeral cluster, to avoid conflicts between users or unnecessary work.
  if (!clusterInit && remoteCluster && !isProviderEphemeralKubernetes(provider)) {
    const initCommand = chalk.white.bold(`garden --env=${ctx.environmentName} plugins kubernetes cluster-init`)

    if (combinedState === "ready") {
      return {}
    } else if (
      combinedState === "deploying" ||
      combinedState === "unhealthy" ||
      serviceStates.includes("missing") ||
      serviceStates.includes("unknown")
    ) {
      // If any of the services are not ready or missing, we throw, since builds and deployments are likely to fail.
      throw new KubernetesError({
        message: deline`
          One or more cluster-wide system services are missing or not ready. You need to run ${initCommand}
          to initialize them, or contact a cluster admin to do so, before deploying services to this cluster.
        `,
      })
    } else {
      // If system services are outdated but none are *missing*, we warn instead of flagging as not ready here.
      // This avoids blocking users where there's variance in configuration between users of the same cluster,
      // that often doesn't affect usage.
      log.warn(deline`
        One or more cluster-wide system services are outdated or their configuration does not match your current
        configuration. You may want to run ${initCommand} to update them, or contact a cluster admin to do so.
      `)

      return {}
    }
  }

  const sysGarden = await getSystemGarden(k8sCtx, variables || {}, log)
  const sysProvider = <KubernetesProvider>await sysGarden.resolveProvider(log, provider.name)
  const systemNamespace = await getSystemNamespace(k8sCtx, sysProvider, log)
  const sysApi = await KubeApi.factory(log, ctx, sysProvider)

  await sysGarden.clearBuilds()

  // Set auth secret for in-cluster builder
  if (provider.config.buildMode !== "local-docker") {
    log.info("Updating builder auth secret")
    const authSecret = await prepareDockerAuth(sysApi, sysProvider, systemNamespace)
    await sysApi.upsert({ kind: "Secret", namespace: systemNamespace, obj: authSecret, log })
  }

  // Install system services
  await prepareSystemServices({
    log,
    sysGarden,
    namespace: systemNamespace,
    force,
    ctx: k8sCtx,
    names: systemServiceNames,
  })

  sysGarden.log.success("Done")

  return {}
}

export async function cleanupEnvironment({
  ctx,
  log,
}: CleanupEnvironmentParams<KubernetesConfig>): Promise<CleanupEnvironmentResult> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const api = await KubeApi.factory(log, ctx, provider)
  const namespace = await getAppNamespace(k8sCtx, log, provider)

  // Here, we only want to delete namespaces generated by Garden.
  const namespacesToDelete = // TODO: This is only mapping over a single thing
    // so it should be rewritten to not map
    (
      await Promise.all(
        [namespace].map(async (ns) => {
          try {
            const annotations = (await api.core.readNamespace({ name: ns })).metadata.annotations || {}
            return annotations[gardenAnnotationKey("generated")] === "true" ? ns : null
          } catch (err) {
            if (!(err instanceof KubernetesError)) {
              throw err
            }
            if (err.responseStatusCode === 404) {
              return null
            } else {
              throw err
            }
          }
        })
      )
    ).filter(Boolean)

  if (namespacesToDelete.length === 0) {
    return {}
  }

  let nsDescription: string
  if (namespacesToDelete.length === 1) {
    nsDescription = `namespace ${namespacesToDelete[0]}`
  } else {
    nsDescription = `namespaces ${namespacesToDelete[0]} and ${namespacesToDelete[1]}`
  }

  const entry = log
    .createLog({
      name: "kubernetes",
    })
    .info(`Deleting ${nsDescription} (this may take a while)`)

  await deleteNamespaces(<string[]>namespacesToDelete, api, entry)

  // Since we've deleted one or more namespaces, we invalidate the NS cache for this provider instance.
  clearNamespaceCache(provider)

  ctx.events.emit("namespaceStatus", { namespaceName: namespace, state: "missing", pluginName: provider.name })

  return {}
}

export function getKubernetesSystemVariables(config: KubernetesConfig) {
  const systemNamespace = config.gardenSystemNamespace
  const systemTolerations: V1Toleration[] = [
    {
      key: "garden-system",
      operator: "Equal",
      value: "true",
      effect: "NoSchedule",
    },
  ]

  return {
    "namespace": systemNamespace,

    "builder-mode": config.buildMode,

    "builder-limits-cpu": millicpuToString(config.resources.builder.limits.cpu),
    "builder-limits-memory": megabytesToString(config.resources.builder.limits.memory),
    "builder-requests-cpu": millicpuToString(config.resources.builder.requests.cpu),
    "builder-requests-memory": megabytesToString(config.resources.builder.requests.memory),

    "ingress-http-port": config.ingressHttpPort,
    "ingress-https-port": config.ingressHttpsPort,

    "system-tolerations": <PrimitiveMap[]>systemTolerations,
    "system-node-selector": config.systemNodeSelector,
  }
}

interface DockerConfigJson {
  experimental: string
  auths: { [registry: string]: { [key: string]: string } }
  credHelpers: { [registry: string]: any }
}
export async function buildDockerAuthConfig(
  imagePullSecrets: ProviderSecretRef[],
  api: KubeApi
): Promise<DockerConfigJson> {
  const decodedSecrets = await Promise.all(
    imagePullSecrets.map(async (secretRef): Promise<DockerConfigJson> => {
      const secret = await readSecret(api, secretRef)
      if (secret.type !== dockerAuthSecretType) {
        throw new ConfigurationError({
          message: dedent`
        Configured imagePullSecret '${secret.metadata.name}' does not appear to be a valid registry secret, because
        it does not have \`type: ${dockerAuthSecretType}\`.
        ${dockerAuthDocsLink}
        `,
        })
      }

      // Decode the secret
      const encoded = secret.data && secret.data![dockerAuthSecretKey]

      if (!encoded) {
        throw new ConfigurationError({
          message: dedent`
        Configured imagePullSecret '${secret.metadata.name}' does not appear to be a valid registry secret, because
        it does not contain a ${dockerAuthSecretKey} key.
        ${dockerAuthDocsLink}
        `,
        })
      }

      let decoded: any

      try {
        decoded = JSON.parse(Buffer.from(encoded, "base64").toString())
      } catch (err) {
        throw new ConfigurationError({
          message: dedent`
        Could not parse configured imagePullSecret '${secret.metadata.name}' as a JSON docker authentication file:
        ${err}.
        ${dockerAuthDocsLink}
        `,
        })
      }
      if (!decoded.auths && !decoded.credHelpers) {
        throw new ConfigurationError({
          message: dedent`
        Could not parse configured imagePullSecret '${secret.metadata.name}' as a valid docker authentication file,
        because it is missing an "auths" or "credHelpers" key.
        ${dockerAuthDocsLink}
        `,
        })
      }

      return decoded
    })
  )

  const finalSecret = { experimental: "enabled", auths: {}, credHelpers: {} }

  for (const { auths, credHelpers } of decodedSecrets) {
    finalSecret.auths = { ...finalSecret.auths, ...auths }
    finalSecret.credHelpers = { ...finalSecret.credHelpers, ...credHelpers }
  }

  return finalSecret
}

export async function prepareDockerAuth(
  api: KubeApi,
  provider: KubernetesProvider,
  namespace: string
): Promise<KubernetesResource<V1Secret>> {
  // Read all configured imagePullSecrets and combine into a docker config file to use in the in-cluster builders.
  const config = await buildDockerAuthConfig(provider.config.imagePullSecrets, api)

  return {
    apiVersion: "v1",
    kind: "Secret",
    metadata: {
      name: systemDockerAuthSecretName,
      namespace,
    },
    data: {
      [dockerAuthSecretKey]: Buffer.from(JSON.stringify(config)).toString("base64"),
    },
  }
}
