/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { extend } from "lodash-es"
import { findByName } from "../../../util/util.js"
import type { ContainerIngressSpec, ContainerDeployAction } from "../../container/moduleConfig.js"
import type { IngressTlsCertificate, KubernetesProvider } from "../config.js"
import type { ServiceIngress, ServiceProtocol } from "../../../types/service.js"
import type { KubeApi } from "../api.js"
import { KubernetesError } from "../api.js"
import { ConfigurationError, PluginError } from "../../../exceptions.js"
import { ensureSecret } from "../secrets.js"
import { getHostnamesFromPem } from "../../../util/tls.js"
import type { KubernetesResource } from "../types.js"
import type { V1Ingress, V1Secret } from "@kubernetes/client-node"
import type { Log } from "../../../logger/log-entry.js"
import type { Resolved } from "../../../actions/types.js"

// Ingress API versions in descending order of preference
export const supportedIngressApiVersions = ["networking.k8s.io/v1", "networking.k8s.io/v1beta1", "extensions/v1beta1"]

interface ServiceIngressWithCert extends ServiceIngress {
  spec: ContainerIngressSpec
  certificate?: IngressTlsCertificate
}

const certificateHostnames: { [name: string]: string[] } = {}

/**
 * Detects and returns the supported ingress version for the context (checking for api versions in the provided
 * preference order).
 */
export async function getIngressApiVersion(
  log: Log,
  api: KubeApi,
  preferenceOrder: string[]
): Promise<string | undefined> {
  for (const version of preferenceOrder) {
    const resourceInfo = await api.getApiResourceInfo(log, version, "Ingress")
    if (resourceInfo) {
      return version
    }
  }
  return undefined
}

export async function createIngressResources(
  api: KubeApi,
  provider: KubernetesProvider,
  namespace: string,
  action: Resolved<ContainerDeployAction>,
  log: Log
) {
  const { ports, ingresses } = action.getSpec()

  if (ingresses.length === 0) {
    return []
  }

  // Detect the supported ingress version for the context
  const apiVersion = await getIngressApiVersion(log, api, supportedIngressApiVersions)

  if (!apiVersion) {
    log.warn(`Could not find a supported Ingress API version in the target cluster`)
    return []
  }

  const allIngresses = await getIngressesWithCert(action, api, provider)

  return Promise.all(
    allIngresses.map(async (ingress, index) => {
      const cert = ingress.certificate

      if (!!cert) {
        // make sure the TLS secrets exist in this namespace
        await ensureSecret(api, cert.secretRef, namespace, log)
      }
      const portForIngress = findByName(ports, ingress.spec.port)
      if (!portForIngress) {
        throw new ConfigurationError({
          message: `Port with name ${ingress.spec.port} not found in service ports for ${action.name}. Did you reference the port by its name?`,
        })
      }
      const servicePortNumber = portForIngress.servicePort
      if (apiVersion === "networking.k8s.io/v1") {
        // The V1 API has a different shape than the beta API
        const ingressResource: KubernetesResource<V1Ingress> = {
          apiVersion,
          kind: "Ingress",
          metadata: {
            name: `${action.name}-${index}`,
            annotations: {
              "ingress.kubernetes.io/force-ssl-redirect": !!cert + "",
              ...ingress.spec.annotations,
            },
            namespace,
          },
          spec: {
            ingressClassName: provider.config.ingressClass,
            rules: [
              {
                host: ingress.hostname,
                http: {
                  paths: [
                    {
                      path: ingress.path,
                      pathType: "Prefix",
                      backend: {
                        service: {
                          name: action.name,
                          port: {
                            number: servicePortNumber,
                          },
                        },
                      },
                    },
                  ],
                },
              },
            ],
            tls: cert ? [{ hosts: [ingress.hostname], secretName: cert.secretRef.name }] : undefined,
          },
        }
        return ingressResource
      } else {
        const annotations = {
          "ingress.kubernetes.io/force-ssl-redirect": !!cert + "",
        }

        if (provider.config.ingressClass) {
          annotations["kubernetes.io/ingress.class"] = provider.config.ingressClass
        }

        extend(annotations, ingress.spec.annotations)

        const ingressResource: KubernetesResource<any> = {
          apiVersion: apiVersion!,
          kind: "Ingress",
          metadata: {
            name: `${action.name}-${index}`,
            annotations,
            namespace,
          },
          spec: {
            rules: [
              {
                host: ingress.hostname,
                http: {
                  paths: [
                    {
                      path: ingress.path,
                      backend: {
                        serviceName: action.name,
                        servicePort: servicePortNumber,
                      },
                    },
                  ],
                },
              },
            ],
            tls: cert ? [{ secretName: cert.secretRef.name }] : undefined,
          },
        }
        return ingressResource
      }
    })
  )
}

async function getIngress(
  action: Resolved<ContainerDeployAction>,
  api: KubeApi,
  provider: KubernetesProvider,
  spec: ContainerIngressSpec
): Promise<ServiceIngressWithCert> {
  const hostname = spec.hostname || provider.config.defaultHostname

  if (!hostname) {
    // this should be caught when parsing the module
    throw new PluginError({
      message: `No hostname configured for one of the ingresses on ${action.longDescription()}. Please configure a default hostname or specify a hostname for the ingress.`,
    })
  }

  const certificate = await pickCertificate(action, api, provider, hostname)
  // TODO: support other protocols
  const protocol: ServiceProtocol = !!certificate ? "https" : "http"
  const port = !!certificate ? provider.config.ingressHttpsPort : provider.config.ingressHttpPort

  return {
    ...spec,
    certificate,
    hostname,
    path: spec.path,
    port,
    protocol,
    spec,
  }
}

async function getIngressesWithCert(
  action: Resolved<ContainerDeployAction>,
  api: KubeApi,
  provider: KubernetesProvider
): Promise<ServiceIngressWithCert[]> {
  const ingresses = action.getSpec("ingresses")
  return Promise.all(ingresses.map((spec) => getIngress(action, api, provider, spec)))
}

export async function getIngresses(
  action: Resolved<ContainerDeployAction>,
  api: KubeApi,
  provider: KubernetesProvider
): Promise<ServiceIngress[]> {
  return (await getIngressesWithCert(action, api, provider)).map((ingress) => ({
    hostname: ingress.hostname,
    path: ingress.path,
    port: ingress.port,
    linkUrl: ingress.linkUrl,
    protocol: ingress.protocol,
  }))
}

async function getCertificateHostnames(api: KubeApi, cert: IngressTlsCertificate): Promise<string[]> {
  if (cert.hostnames) {
    // use explicitly specified hostnames, if given
    return cert.hostnames
  } else if (certificateHostnames[cert.name]) {
    // return cached hostnames if available
    return certificateHostnames[cert.name]
  } else {
    // pull secret via secret ref from k8s
    let secret: KubernetesResource<V1Secret>

    try {
      secret = await api.core.readNamespacedSecret({ name: cert.secretRef.name, namespace: cert.secretRef.namespace })
    } catch (err) {
      if (!(err instanceof KubernetesError)) {
        throw err
      }
      if (err.responseStatusCode === 404) {
        throw new ConfigurationError({
          message: `Cannot find Secret ${cert.secretRef.name} configured for TLS certificate ${cert.name}`,
        })
      } else {
        throw err
      }
    }

    const data = secret.data!

    if (!data["tls.crt"] || !data["tls.key"]) {
      throw new ConfigurationError({
        message: `Secret '${cert.secretRef.name}' is not a valid TLS secret (missing tls.crt and/or tls.key).`,
      })
    }

    const crtData = Buffer.from(data["tls.crt"], "base64").toString()

    try {
      return getHostnamesFromPem(crtData)
    } catch (error) {
      throw new ConfigurationError({
        message: `Unable to parse Secret '${cert.secretRef.name}' as a valid TLS certificate: ${error}`,
      })
    }
  }
}

async function pickCertificate(
  action: ContainerDeployAction,
  api: KubeApi,
  provider: KubernetesProvider,
  hostname: string
): Promise<IngressTlsCertificate | undefined> {
  const certs = provider.config.tlsCertificates || []
  for (const cert of certs) {
    const certHostnames = await getCertificateHostnames(api, cert)

    for (const certHostname of certHostnames) {
      if (certHostname === hostname || (certHostname.startsWith("*") && hostname.endsWith(certHostname.slice(1)))) {
        return cert
      }
    }
  }

  if (provider.config.forceSsl) {
    throw new ConfigurationError({
      message:
        `Could not find certificate for hostname '${hostname}' ` +
        `configured on service '${action.name}' and forceSsl flag is set.`,
    })
  }

  return undefined
}
