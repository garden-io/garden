/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { KubeApi, KubernetesError } from "./api"
import {
  getAppNamespace,
  prepareNamespaces,
  deleteNamespaces,
  getSystemNamespace,
  getAppNamespaceStatus,
} from "./namespace"
import { KubernetesPluginContext, KubernetesConfig, KubernetesProvider, ProviderSecretRef } from "./config"
import { prepareSystemServices, getSystemServiceStatus, getSystemGarden } from "./system"
import { GetEnvironmentStatusParams, EnvironmentStatus } from "../../types/plugin/provider/getEnvironmentStatus"
import { PrepareEnvironmentParams, PrepareEnvironmentResult } from "../../types/plugin/provider/prepareEnvironment"
import { CleanupEnvironmentParams, CleanupEnvironmentResult } from "../../types/plugin/provider/cleanupEnvironment"
import { millicpuToString, megabytesToString } from "./util"
import chalk from "chalk"
import { deline, dedent, gardenAnnotationKey } from "../../util/string"
import { combineStates, ServiceStatusMap, ServiceState } from "../../types/service"
import {
  setupCertManager,
  checkCertManagerStatus,
  checkCertificateStatusByName,
  getCertificateName,
} from "./integrations/cert-manager"
import { ConfigurationError } from "../../exceptions"
import Bluebird from "bluebird"
import { readSecret } from "./secrets"
import { systemDockerAuthSecretName, dockerAuthSecretKey } from "./constants"
import { V1Secret, V1Toleration } from "@kubernetes/client-node"
import { KubernetesResource } from "./types"
import { compareDeployedResources } from "./status/status"
import { PrimitiveMap } from "../../config/common"
import { mapValues } from "lodash"

// Note: We need to increment a version number here if we ever make breaking changes to the NFS provisioner StatefulSet
const nfsStorageClassVersion = 2

const dockerAuthSecretType = "kubernetes.io/dockerconfigjson"
const dockerAuthDocsLink = `
See https://kubernetes.io/docs/tasks/configure-pod-container/pull-image-private-registry/ for how to create
a registry auth secret.
`

interface KubernetesProviderOutputs extends PrimitiveMap {
  "app-namespace": string
  "metadata-namespace": string
  "default-hostname": string | null
}

interface KubernetesEnvironmentDetail {
  projectHelmMigrated: boolean
  serviceStatuses: ServiceStatusMap
  systemReady: boolean
  systemServiceState: ServiceState
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

  let projectHelmMigrated = true

  const namespaces = await prepareNamespaces({ ctx, log })
  const systemServiceNames = k8sCtx.provider.config._systemServices
  const systemNamespace = await getSystemNamespace(ctx, k8sCtx.provider, log)

  const detail: KubernetesEnvironmentDetail = {
    projectHelmMigrated,
    serviceStatuses: {},
    systemReady: true,
    systemServiceState: <ServiceState>"unknown",
    systemCertManagerReady: true,
    systemManagedCertificatesReady: true,
  }

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

  if (provider.config.certManager) {
    const certManagerStatus = await checkCertManagerStatus({ ctx, provider, log })

    // A running cert-manager installation couldn't be found.
    if (certManagerStatus !== "ready") {
      if (!provider.config.certManager.install) {
        // Cert manager installation couldn't be found AND user doesn't want to let garden install it.
        throw new ConfigurationError(
          deline`
          Couldn't find a running installation of cert-manager in namespace "cert-manager".
          Please set providers[].certManager.install == true or install cert-manager manually.
        `,
          {}
        )
      } else {
        // garden will proceed with intstallation and certificate creation.
        result.ready = false
        detail.systemCertManagerReady = false
        detail.systemManagedCertificatesReady = false
      }
    } else {
      // A running cert-manager installation has been found and we can safely check for the status of the certificates.
      const certManager = provider.config.certManager
      const certificateNames = provider.config.tlsCertificates
        .filter((cert) => cert.managedBy === "cert-manager")
        .map((cert) => getCertificateName(certManager, cert))
      const certificatesStatus = await checkCertificateStatusByName({ ctx, log, provider, resources: certificateNames })
      if (!certificatesStatus) {
        // Some certificates are not ready/created and will be taken care of by the integration.
        result.ready = false
        detail.systemManagedCertificatesReady = false
      }
    }
  }

  // Check if builder auth secret is up-to-date
  let secretsUpToDate = true

  if (provider.config.buildMode !== "local-docker") {
    const authSecret = await prepareDockerAuth(api, provider, systemNamespace)
    const comparison = await compareDeployedResources(k8sCtx, api, systemNamespace, [authSecret], log)
    secretsUpToDate = comparison.state === "ready"
  }

  // Get system service statuses
  const systemServiceStatus = await getSystemServiceStatus({
    ctx: k8sCtx,
    log,
    sysGarden,
    namespace: systemNamespace,
    serviceNames: systemServiceNames,
  })

  if (!secretsUpToDate || systemServiceStatus.state !== "ready") {
    result.ready = false
    detail.systemReady = false
  }

  detail.serviceStatuses = systemServiceStatus.serviceStatuses
  detail.systemServiceState = systemServiceStatus.state

  sysGarden.log.setSuccess()

  return result
}

/**
 * Deploys system services (if any)
 */
export async function prepareEnvironment(
  params: PrepareEnvironmentParams<KubernetesEnvironmentStatus>
): Promise<PrepareEnvironmentResult> {
  const { ctx, log, status } = params
  const k8sCtx = <KubernetesPluginContext>ctx

  // Prepare system services
  await prepareSystem({ ...params, clusterInit: false })
  const ns = await getAppNamespaceStatus(k8sCtx, log, k8sCtx.provider)
  await setupCertManager({ ctx: k8sCtx, provider: k8sCtx.provider, log, status })

  return { status: { namespaceStatuses: [ns], ready: true, outputs: status.outputs } }
}

export async function prepareSystem({
  ctx,
  log,
  force,
  status,
  clusterInit,
}: PrepareEnvironmentParams<KubernetesEnvironmentStatus> & { clusterInit: boolean }) {
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const variables = getKubernetesSystemVariables(provider.config)

  const systemReady = status.detail && !!status.detail.systemReady && !force
  const systemServiceNames = k8sCtx.provider.config._systemServices

  if (systemServiceNames.length === 0 || systemReady) {
    return {}
  }

  const serviceStatuses: ServiceStatusMap = (status.detail && status.detail.serviceStatuses) || {}
  const serviceStates = Object.values(serviceStatuses).map((s) => (s && s.state) || "unknown")
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

  // We require manual init if we're installing any system services to remote clusters, to avoid conflicts
  // between users or unnecessary work.
  if (!clusterInit && remoteCluster) {
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
      throw new KubernetesError(
        deline`
        One or more cluster-wide system services are missing or not ready. You need to run ${initCommand}
        to initialize them, or contact a cluster admin to do so, before deploying services to this cluster.
      `,
        {
          status,
        }
      )
    } else {
      // If system services are outdated but none are *missing*, we warn instead of flagging as not ready here.
      // This avoids blocking users where there's variance in configuration between users of the same cluster,
      // that often doesn't affect usage.
      log.warn({
        symbol: "warning",
        msg: chalk.gray(deline`
          One or more cluster-wide system services are outdated or their configuration does not match your current
          configuration. You may want to run ${initCommand} to update them, or contact a cluster admin to do so.
        `),
      })

      return {}
    }
  }

  const sysGarden = await getSystemGarden(k8sCtx, variables || {}, log)
  const sysProvider = <KubernetesProvider>await sysGarden.resolveProvider(log, provider.name)
  const systemNamespace = await getSystemNamespace(ctx, sysProvider, log)
  const sysApi = await KubeApi.factory(log, ctx, sysProvider)

  await sysGarden.clearBuilds()

  // Set auth secret for in-cluster builder
  if (provider.config.buildMode !== "local-docker") {
    log.info("Updating builder auth secret")
    const authSecret = await prepareDockerAuth(sysApi, sysProvider, systemNamespace)
    await sysApi.upsert({ kind: "Secret", namespace: systemNamespace, obj: authSecret, log })
  }

  // We need to install the NFS provisioner separately, so that we can optionally install it
  // FIXME: when we've added an `enabled` field, we should get rid of this special case
  if (systemServiceNames.includes("nfs-provisioner")) {
    await prepareSystemServices({
      log,
      sysGarden,
      namespace: systemNamespace,
      force,
      ctx: k8sCtx,
      serviceNames: ["nfs-provisioner"],
    })
  }

  // Install system services
  await prepareSystemServices({
    log,
    sysGarden,
    namespace: systemNamespace,
    force,
    ctx: k8sCtx,
    serviceNames: systemServiceNames.filter((name) => name !== "nfs-provisioner"),
  })

  sysGarden.log.setSuccess()

  return {}
}

export async function cleanupEnvironment({ ctx, log }: CleanupEnvironmentParams): Promise<CleanupEnvironmentResult> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const api = await KubeApi.factory(log, ctx, provider)
  const namespace = await getAppNamespace(k8sCtx, log, provider)

  // Here, we only want to delete namespaces generated by Garden.
  const namespacesToDelete = (
    await Bluebird.map([namespace], async (ns) => {
      try {
        const annotations = (await api.core.readNamespace(ns)).metadata.annotations || {}
        return annotations[gardenAnnotationKey("generated")] === "true" ? ns : null
      } catch (err) {
        if (err.statusCode === 404) {
          return null
        } else {
          throw err
        }
      }
    })
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

  const entry = log.info({
    section: "kubernetes",
    msg: `Deleting ${nsDescription} (this may take a while)`,
    status: "active",
  })

  await deleteNamespaces(<string[]>namespacesToDelete, api, entry)

  return { namespaceStatuses: [{ namespaceName: namespace, state: "missing", pluginName: provider.name }] }
}

export function getNfsStorageClass(config: KubernetesConfig) {
  return `${config.gardenSystemNamespace}-nfs-v${nfsStorageClassVersion}`
}

export function getKubernetesSystemVariables(config: KubernetesConfig) {
  const nfsStorageClass = getNfsStorageClass(config)
  const syncStorageClass = config.storage.sync.storageClass || nfsStorageClass
  const systemNamespace = config.gardenSystemNamespace
  const systemTolerations: V1Toleration[] = [
    {
      key: "garden-system",
      operator: "Equal",
      value: "true",
      effect: "NoSchedule",
    },
  ]
  const registryProxyTolerations = config.registryProxyTolerations || systemTolerations

  return {
    "namespace": systemNamespace,

    "registry-hostname": getInClusterRegistryHostname(config),
    "builder-mode": config.buildMode,

    "builder-limits-cpu": millicpuToString(config.resources.builder.limits.cpu),
    "builder-limits-memory": megabytesToString(config.resources.builder.limits.memory),
    "builder-requests-cpu": millicpuToString(config.resources.builder.requests.cpu),
    "builder-requests-memory": megabytesToString(config.resources.builder.requests.memory),
    "builder-storage-size": megabytesToString(config.storage.builder.size!),
    "builder-storage-class": config.storage.builder.storageClass,

    "ingress-http-port": config.ingressHttpPort,
    "ingress-https-port": config.ingressHttpsPort,

    // We only use NFS for the build-sync volume, so we allocate the space we need for that plus 1GB for margin.
    "nfs-storage-size": megabytesToString(config.storage.sync.size! + 1024),
    "nfs-storage-class": config.storage.nfs.storageClass,

    "registry-limits-cpu": millicpuToString(config.resources.registry.limits.cpu),
    "registry-limits-memory": megabytesToString(config.resources.registry.limits.memory),
    ...(config.resources.registry.limits.ephemeralStorage
      ? { "registry-limits-ephemeralStorage": megabytesToString(config.resources.registry.limits.ephemeralStorage) }
      : {}),
    "registry-requests-cpu": millicpuToString(config.resources.registry.requests.cpu),
    "registry-requests-memory": megabytesToString(config.resources.registry.requests.memory),
    ...(config.resources.registry.requests.ephemeralStorage
      ? { "registry-requests-ephemeralStorage": megabytesToString(config.resources.registry.requests.ephemeralStorage) }
      : {}),
    "registry-storage-size": megabytesToString(config.storage.registry.size!),
    "registry-storage-class": config.storage.registry.storageClass,

    "sync-limits-cpu": millicpuToString(config.resources.sync.limits.cpu),
    "sync-limits-memory": megabytesToString(config.resources.sync.limits.memory),
    ...(config.resources.sync.limits.ephemeralStorage
      ? { "sync-limits-ephemeralStorage": megabytesToString(config.resources.sync.limits.ephemeralStorage) }
      : {}),
    "sync-requests-cpu": millicpuToString(config.resources.sync.requests.cpu),
    "sync-requests-memory": megabytesToString(config.resources.sync.requests.memory),
    ...(config.resources.sync.requests.ephemeralStorage
      ? { "sync-requests-ephemeralStorage": megabytesToString(config.resources.sync.requests.ephemeralStorage) }
      : {}),
    "sync-storage-size": megabytesToString(config.storage.sync.size!),
    "sync-storage-class": syncStorageClass,
    "sync-volume-name": `garden-sync-${syncStorageClass}`,

    "registry-proxy-tolerations": <PrimitiveMap[]>registryProxyTolerations,
    "system-tolerations": <PrimitiveMap[]>systemTolerations,
    "system-node-selector": config.systemNodeSelector,
  }
}

export function getInClusterRegistryHostname(config: KubernetesConfig) {
  const systemNamespace = config.gardenSystemNamespace
  return `garden-docker-registry.${systemNamespace}.svc.cluster.local`
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
  return Bluebird.reduce(
    imagePullSecrets,
    async (accumulator, secretRef) => {
      const secret = await readSecret(api, secretRef)
      if (secret.type !== dockerAuthSecretType) {
        throw new ConfigurationError(
          dedent`
        Configured imagePullSecret '${secret.metadata.name}' does not appear to be a valid registry secret, because
        it does not have \`type: ${dockerAuthSecretType}\`.
        ${dockerAuthDocsLink}
        `,
          { secretRef }
        )
      }

      // Decode the secret
      const encoded = secret.data && secret.data![dockerAuthSecretKey]

      if (!encoded) {
        throw new ConfigurationError(
          dedent`
        Configured imagePullSecret '${secret.metadata.name}' does not appear to be a valid registry secret, because
        it does not contain a ${dockerAuthSecretKey} key.
        ${dockerAuthDocsLink}
        `,
          { secretRef }
        )
      }

      let decoded: any

      try {
        decoded = JSON.parse(Buffer.from(encoded, "base64").toString())
      } catch (err) {
        throw new ConfigurationError(
          dedent`
        Could not parse configured imagePullSecret '${secret.metadata.name}' as a JSON docker authentication file:
        ${err.message}.
        ${dockerAuthDocsLink}
        `,
          { secretRef }
        )
      }
      if (!decoded.auths && !decoded.credHelpers) {
        throw new ConfigurationError(
          dedent`
        Could not parse configured imagePullSecret '${secret.metadata.name}' as a valid docker authentication file,
        because it is missing an "auths" or "credHelpers" key.
        ${dockerAuthDocsLink}
        `,
          { secretRef }
        )
      }
      return {
        ...accumulator,
        auths: { ...accumulator.auths, ...decoded.auths },
        credHelpers: { ...accumulator.credHelpers, ...decoded.credHelpers },
      }
    },
    { experimental: "enabled", auths: {}, credHelpers: {} }
  )
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
