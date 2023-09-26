/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
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
  getNamespaceStatus,
  clearNamespaceCache,
} from "./namespace"
import { KubernetesPluginContext, KubernetesConfig, KubernetesProvider, ProviderSecretRef } from "./config"
import { GetEnvironmentStatusParams, EnvironmentStatus } from "../../plugin/handlers/Provider/getEnvironmentStatus"
import { PrepareEnvironmentParams, PrepareEnvironmentResult } from "../../plugin/handlers/Provider/prepareEnvironment"
import { CleanupEnvironmentParams, CleanupEnvironmentResult } from "../../plugin/handlers/Provider/cleanupEnvironment"
import { millicpuToString, megabytesToString } from "./util"
import { deline, dedent, gardenAnnotationKey } from "../../util/string"
import { ConfigurationError } from "../../exceptions"
import { readSecret } from "./secrets"
import { systemDockerAuthSecretName, dockerAuthSecretKey } from "./constants"
import { V1IngressClass, V1Secret, V1Toleration } from "@kubernetes/client-node"
import { KubernetesResource } from "./types"
import { PrimitiveMap } from "../../config/common"
import { mapValues } from "lodash"
import { getIngressApiVersion, supportedIngressApiVersions } from "./container/ingress"
import { Log } from "../../logger/log-entry"
import { helmNginxInstall, helmNginxStatus } from "./integrations/nginx"

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
  systemReady: boolean
  systemCertManagerReady: boolean
  systemManagedCertificatesReady: boolean
}

export type KubernetesEnvironmentStatus = EnvironmentStatus<KubernetesProviderOutputs, KubernetesEnvironmentDetail>

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

  const detail: KubernetesEnvironmentDetail = {
    systemReady: true,
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

  if (provider.config.setupIngressController === "nginx") {
    const state = await helmNginxStatus(k8sCtx, log)
    if (state !== "ready") {
      result.ready = false
      detail.systemReady = false
    }
  }

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
    const ingressClasses = await api.listResources<KubernetesResource<V1IngressClass>>({
      apiVersion: ingressApiVersion,
      kind: "IngressClass",
      log,
      namespace: "all",
    })
    const ingressClassWithCorrectName = ingressClasses.items.find((ic) => ic.metadata.name === customIngressClassName)
    if (!ingressClassWithCorrectName) {
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
  const provider = k8sCtx.provider
  const config = provider.config

  // TODO-G2: remove this option for remote kubernetes clusters?
  if (config.setupIngressController === "nginx") {
    await helmNginxInstall(k8sCtx, log)
  }

  // Prepare system services
  const nsStatus = await getNamespaceStatus({ ctx: k8sCtx, log, provider })
  ctx.events.emit("namespaceStatus", nsStatus)
  return { status: { ready: true, outputs: status.outputs } }
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
            const annotations = (await api.core.readNamespace(ns)).metadata.annotations || {}
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
