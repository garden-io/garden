/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { KubeApi, KubernetesError } from "./api.js"
import {
  getAppNamespace,
  prepareNamespace,
  deleteNamespaces,
  getSystemNamespace,
  namespaceExists,
} from "./namespace.js"
import type { KubernetesPluginContext, KubernetesConfig, KubernetesProvider, ProviderSecretRef } from "./config.js"
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
import { deline, dedent, gardenAnnotationKey } from "../../util/string.js"
import { ConfigurationError } from "../../exceptions.js"
import { readSecret } from "./secrets.js"
import { systemDockerAuthSecretName, dockerAuthSecretKey } from "./constants.js"
import type { V1IngressClass, V1Secret, V1Toleration } from "@kubernetes/client-node"
import type { KubernetesResource } from "./types.js"
import type { PrimitiveMap } from "../../config/common.js"
import { getIngressApiVersion, supportedIngressApiVersions } from "./container/ingress.js"
import type { Log } from "../../logger/log-entry.js"
import { ensureIngressController, ingressControllerReady } from "./nginx/ingress-controller.js"
import { styles } from "../../logger/styles.js"
import { isTruthy } from "../../util/util.js"

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
 * Checks if namespace and secrets exist and whether ingress is ready (if applicable).
 *
 * TODO @eysi: Check secret statuses
 */
export async function getEnvironmentStatus({
  ctx,
  log,
}: GetEnvironmentStatusParams): Promise<KubernetesEnvironmentStatus> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const api = await KubeApi.factory(log, ctx, provider)
  // TODO @eysi: Avoid casting (the namespace is ensured though when the provider config is resolved)
  const namespaceName = provider.config.namespace!.name
  const namespaceReady = await namespaceExists(api, ctx, namespaceName)

  const detail: KubernetesEnvironmentDetail = {
    systemReady: true,
    systemCertManagerReady: true,
    systemManagedCertificatesReady: true,
  }

  const result: KubernetesEnvironmentStatus = {
    ready: namespaceReady,
    detail,
    outputs: {
      "app-namespace": namespaceName,
      "default-hostname": provider.config.defaultHostname || null,
    },
  }

  if (provider.config.setupIngressController === "nginx") {
    const ingressControllerReadiness = await ingressControllerReady(ctx, log)
    result.ready = ingressControllerReadiness && namespaceReady
    detail.systemReady = ingressControllerReadiness
    log.info(
      `${styles.highlight("nginx")} Ingress Controller ${ingressControllerReadiness ? "is ready" : "is not ready"}`
    )
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
 * Deploys system services (if any) and creates the default app namespace.
 *
 * TODO @eysi: Ensure secrets here
 */
export async function prepareEnvironment(
  params: PrepareEnvironmentParams<KubernetesConfig>
): Promise<PrepareEnvironmentResult> {
  const { ctx, log } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const config = provider.config
  const api = await KubeApi.factory(log, ctx, provider)

  // create default app namespace if it doesn't exist
  const nsStatus = await prepareNamespace({ ctx, log })
  // make sure that the system namespace exists
  await getSystemNamespace(ctx, ctx.provider, log)

  // TODO-0.15: remove this option for remote kubernetes clusters?
  if (config.setupIngressController === "nginx") {
    await ensureIngressController(k8sCtx, log)
  } else {
    // We only need to warn about missing ingress classes if we're not using Garden installed nginx
    const ingressApiVersion = await getIngressApiVersion(log, api, supportedIngressApiVersions)
    const ingressWarnings = await getIngressMisconfigurationWarnings(
      provider.config.ingressClass,
      ingressApiVersion,
      log,
      api
    )
    ingressWarnings.forEach((w) => log.warn(w))
  }

  return {
    status: {
      ready: true,
      outputs: {
        "app-namespace": nsStatus["app-namespace"].namespaceName,
        "default-hostname": provider.config.defaultHostname || null,
      },
    },
  }
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
    ).filter(isTruthy)

  if (namespacesToDelete.length === 0) {
    return {}
  }

  let nsDescription: string
  if (namespacesToDelete.length === 1) {
    nsDescription = `namespace ${namespacesToDelete[0]}`
  } else {
    nsDescription = `namespaces ${namespacesToDelete[0]} and ${namespacesToDelete[1]}`
  }

  const k8sLog = log
    .createLog({
      name: "kubernetes",
    })
    .info(`Deleting ${nsDescription} (this may take a while)`)

  await deleteNamespaces({ namespaces: namespacesToDelete, ctx, api, log: k8sLog })

  return {}
}

export function getKubernetesSystemVariables(config: KubernetesConfig) {
  const systemNamespace = config.gardenSystemNamespace
  const systemTolerations: V1Toleration[] = [
    {
      key: systemNamespace,
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

export type SystemVars = ReturnType<typeof getKubernetesSystemVariables>

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
