/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { extend } from "lodash"
import { findByName } from "../../../util/util"
import { ContainerIngressSpec, ContainerDeployAction } from "../../container/moduleConfig"
import { IngressTlsCertificate, KubernetesProvider } from "../config"
import { ServiceIngress, ServiceProtocol } from "../../../types/service"
import { KubeApi } from "../api"
import { ConfigurationError, PluginError } from "../../../exceptions"
import { ensureSecret } from "../secrets"
import { getHostnamesFromPem } from "../../../util/tls"
import { KubernetesResource } from "../types"
import { ExtensionsV1beta1Ingress, V1Ingress, V1Secret } from "@kubernetes/client-node"
import { LogEntry } from "../../../logger/log-entry"
import chalk from "chalk"
import { Resolved } from "../../../actions/base"

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
  log: LogEntry,
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
  log: LogEntry
) {
  const { ports, ingresses } = action.getSpec()

  if (ingresses.length === 0) {
    return []
  }

  // Detect the supported ingress version for the context
  const apiVersion = await getIngressApiVersion(log, api, supportedIngressApiVersions)

  if (!apiVersion) {
    log.warn(chalk.yellow(`Could not find a supported Ingress API version in the target cluster`))
    return []
  }

  const allIngresses = await getIngressesWithCert(action, api, provider)

  return Bluebird.map(allIngresses, async (ingress, index) => {
    const cert = ingress.certificate

    if (!!cert) {
      // make sure the TLS secrets exist in this namespace
      await ensureSecret(api, cert.secretRef, namespace, log)
    }

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
                          number: findByName(ports, ingress.spec.port)!.servicePort,
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

      const ingressResource: KubernetesResource<ExtensionsV1beta1Ingress> = {
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
                      servicePort: <any>findByName(ports, ingress.spec.port)!.servicePort,
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
    throw new PluginError(`Missing hostname in ingress spec`, { deploySpec: action.getSpec(), ingressSpec: spec })
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
  return Bluebird.map(ingresses, (spec) => getIngress(action, api, provider, spec))
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
      secret = await api.core.readNamespacedSecret(cert.secretRef.name, cert.secretRef.namespace)
    } catch (err) {
      if (err.statusCode === 404) {
        throw new ConfigurationError(
          `Cannot find Secret ${cert.secretRef.name} configured for TLS certificate ${cert.name}`,
          cert
        )
      } else {
        throw err
      }
    }

    const data = secret.data!

    if (!data["tls.crt"] || !data["tls.key"]) {
      throw new ConfigurationError(
        `Secret '${cert.secretRef.name}' is not a valid TLS secret (missing tls.crt and/or tls.key).`,
        cert
      )
    }

    const crtData = Buffer.from(data["tls.crt"], "base64").toString()

    try {
      return getHostnamesFromPem(crtData)
    } catch (error) {
      throw new ConfigurationError(`Unable to parse Secret '${cert.secretRef.name}' as a valid TLS certificate`, {
        ...cert,
        error,
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
  for (const cert of provider.config.tlsCertificates) {
    const certHostnames = await getCertificateHostnames(api, cert)

    for (const certHostname of certHostnames) {
      if (certHostname === hostname || (certHostname.startsWith("*") && hostname.endsWith(certHostname.slice(1)))) {
        return cert
      }
    }
  }

  if (provider.config.forceSsl) {
    throw new ConfigurationError(
      `Could not find certificate for hostname '${hostname}' ` +
        `configured on service '${action.name}' and forceSsl flag is set.`,
      {
        actionName: action.name,
        hostname,
      }
    )
  }

  return undefined
}
