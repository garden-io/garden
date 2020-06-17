/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { extend } from "lodash"
import { findByName } from "../../../util/util"
import { ContainerService, ContainerIngressSpec } from "../../container/config"
import { IngressTlsCertificate, KubernetesProvider } from "../config"
import { ServiceIngress, ServiceProtocol } from "../../../types/service"
import { KubeApi } from "../api"
import { ConfigurationError, PluginError } from "../../../exceptions"
import { ensureSecret } from "../secrets"
import { getHostnamesFromPem } from "../../../util/tls"
import { KubernetesResource } from "../types"
import { V1Secret } from "@kubernetes/client-node"
import { LogEntry } from "../../../logger/log-entry"

interface ServiceIngressWithCert extends ServiceIngress {
  spec: ContainerIngressSpec
  certificate?: IngressTlsCertificate
}

const certificateHostnames: { [name: string]: string[] } = {}

export async function createIngressResources(
  api: KubeApi,
  provider: KubernetesProvider,
  namespace: string,
  service: ContainerService,
  log: LogEntry
) {
  if (service.spec.ingresses.length === 0) {
    return []
  }

  const allIngresses = await getIngressesWithCert(service, api, provider)

  return Bluebird.map(allIngresses, async (ingress, index) => {
    const rules = [
      {
        host: ingress.hostname,
        http: {
          paths: [
            {
              path: ingress.path,
              backend: {
                serviceName: service.name,
                servicePort: findByName(service.spec.ports, ingress.spec.port)!.servicePort,
              },
            },
          ],
        },
      },
    ]

    const cert = ingress.certificate

    const annotations = {
      "ingress.kubernetes.io/force-ssl-redirect": !!cert + "",
    }

    if (provider.config.ingressClass) {
      annotations["kubernetes.io/ingress.class"] = provider.config.ingressClass
    }

    extend(annotations, ingress.spec.annotations)

    const spec: any = { rules }

    if (!!cert) {
      // make sure the TLS secrets exist in this namespace
      await ensureSecret(api, cert.secretRef, namespace, log)

      spec.tls = [
        {
          secretName: cert.secretRef.name,
        },
      ]
    }

    return {
      apiVersion: "extensions/v1beta1",
      kind: "Ingress",
      metadata: {
        name: `${service.name}-${index}`,
        annotations,
        namespace,
      },
      spec,
    }
  })
}

async function getIngress(
  service: ContainerService,
  api: KubeApi,
  provider: KubernetesProvider,
  spec: ContainerIngressSpec
): Promise<ServiceIngressWithCert> {
  const hostname = spec.hostname || provider.config.defaultHostname

  if (!hostname) {
    // this should be caught when parsing the module
    throw new PluginError(`Missing hostname in ingress spec`, { serviceSpec: service.spec, ingressSpec: spec })
  }

  const certificate = await pickCertificate(service, api, provider, hostname)
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
  service: ContainerService,
  api: KubeApi,
  provider: KubernetesProvider
): Promise<ServiceIngressWithCert[]> {
  return Bluebird.map(service.spec.ingresses, (spec) => getIngress(service, api, provider, spec))
}

export async function getIngresses(
  service: ContainerService,
  api: KubeApi,
  provider: KubernetesProvider
): Promise<ServiceIngress[]> {
  return (await getIngressesWithCert(service, api, provider)).map((ingress) => ({
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
  service: ContainerService,
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
        `configured on service '${service.name}' and forceSsl flag is set.`,
      {
        serviceName: service.name,
        hostname,
      }
    )
  }

  return undefined
}
