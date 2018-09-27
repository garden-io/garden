/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { groupBy, omit, find } from "lodash"
import { findByName } from "../../util/util"
import { ContainerService, ContainerIngressSpec } from "../container"
import { IngressTlsCertificate } from "./kubernetes"
import { ServiceIngress, ServiceProtocol } from "../../types/service"
import * as Bluebird from "bluebird"
import { KubeApi } from "./api"
import { ConfigurationError, PluginError } from "../../exceptions"
import { certpem } from "certpem"
import { ensureSecret } from "./secrets"

interface ServiceIngressWithCert extends ServiceIngress {
  spec: ContainerIngressSpec
  certificate?: IngressTlsCertificate
}

const certificateHostnames: { [name: string]: string[] } = {}

export async function createIngresses(api: KubeApi, namespace: string, service: ContainerService) {
  if (service.spec.ingresses.length === 0) {
    return []
  }

  const allIngresses = await getIngressesWithCert(service, api)

  // first group ingress endpoints by certificate, so we can properly configure TLS
  const groupedByCert = groupBy(allIngresses, e => e.certificate ? e.certificate.name : undefined)

  return Bluebird.map(Object.values(groupedByCert), async (certIngresses) => {
    // second, group ingress endpoints by hostname
    const groupedByHostname = groupBy(certIngresses, e => e.hostname)

    const rules = Object.entries(groupedByHostname).map(([host, hostnameIngresses]) => ({
      host,
      http: {
        paths: hostnameIngresses.map(ingress => ({
          path: ingress.path,
          backend: {
            serviceName: service.name,
            servicePort: findByName(service.spec.ports, ingress.spec.port)!.containerPort,
          },
        })),
      },
    }))

    const cert = certIngresses[0].certificate

    const annotations = {
      "kubernetes.io/ingress.class": api.provider.config.ingressClass,
      "ingress.kubernetes.io/force-ssl-redirect": !!cert + "",
    }

    const spec: any = { rules }

    if (!!cert) {
      // make sure the TLS secrets exist in this namespace
      await ensureSecret(api, cert.secretRef, namespace)

      spec.tls = [{
        secretName: cert.secretRef.name,
      }]
    }

    return {
      apiVersion: "extensions/v1beta1",
      kind: "Ingress",
      metadata: {
        name: service.name,
        annotations,
        namespace,
      },
      spec,
    }
  })
}

async function getIngress(
  service: ContainerService, api: KubeApi, spec: ContainerIngressSpec,
): Promise<ServiceIngressWithCert> {
  const hostname = spec.hostname || api.provider.config.defaultHostname

  if (!hostname) {
    // this should be caught when parsing the module
    throw new PluginError(`Missing hostname in ingress spec`, { serviceSpec: service.spec, ingressSpec: spec })
  }

  const certificate = await pickCertificate(service, api, hostname)
  // TODO: support other protocols
  const protocol: ServiceProtocol = !!certificate ? "https" : "http"
  const port = !!certificate ? api.provider.config.ingressHttpsPort : api.provider.config.ingressHttpPort

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

async function getIngressesWithCert(service: ContainerService, api: KubeApi): Promise<ServiceIngressWithCert[]> {
  return Bluebird.map(service.spec.ingresses, spec => getIngress(service, api, spec))
}

export async function getIngresses(service: ContainerService, api: KubeApi): Promise<ServiceIngress[]> {
  return (await getIngressesWithCert(service, api))
    .map(e => omit(e, ["certificate", "spec"]))
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
    let res

    try {
      res = await api.core.readNamespacedSecret(cert.secretRef.name, cert.secretRef.namespace)
    } catch (err) {
      if (err.code === 404) {
        throw new ConfigurationError(
          `Cannot find Secret ${cert.secretRef.name} configured for TLS certificate ${cert.name}`,
          cert,
        )
      } else {
        throw err
      }
    }
    const secret = res.body

    if (!secret.data["tls.crt"] || !secret.data["tls.key"]) {
      throw new ConfigurationError(
        `Secret '${cert.secretRef.name}' is not a valid TLS secret (missing tls.crt and/or tls.key).`,
        cert,
      )
    }

    const crtData = Buffer.from(secret.data["tls.crt"], "base64").toString()

    try {
      // Note: Can't use the certpem.info() method here because of multiple bugs.
      // And yes, this API is insane. Crypto people are bonkers. Seriously. - JE
      const certInfo = certpem.debug(crtData)

      const hostnames: string[] = []

      const commonNameField = find(certInfo.subject.types_and_values, ["type", "2.5.4.3"])
      if (commonNameField) {
        hostnames.push(commonNameField.value.value_block.value)
      }

      for (const ext of certInfo.extensions || []) {
        if (ext.parsedValue && ext.parsedValue.altNames) {
          for (const alt of ext.parsedValue.altNames) {
            hostnames.push(alt.Name)
          }
        }
      }

      certificateHostnames[cert.name] = hostnames

      return hostnames
    } catch (error) {
      throw new ConfigurationError(
        `Unable to parse Secret '${cert.secretRef.name}' as a valid TLS certificate`,
        { ...cert, error },
      )
    }
  }
}

async function pickCertificate(
  service: ContainerService, api: KubeApi, hostname: string,
): Promise<IngressTlsCertificate | undefined> {
  for (const cert of api.provider.config.tlsCertificates) {
    const certHostnames = await getCertificateHostnames(api, cert)

    for (const certHostname of certHostnames) {
      if (
        certHostname === hostname
        || certHostname.startsWith("*") && hostname.endsWith(certHostname.slice(1))
      ) {
        return cert
      }
    }
  }

  if (api.provider.config.forceSsl) {
    throw new ConfigurationError(
      `Could not find certificate for hostname '${hostname}' ` +
      `configured on service '${service.name}' and forceSsl flag is set.`,
      {
        serviceName: service.name,
        hostname,
      },
    )
  }

  return undefined
}
