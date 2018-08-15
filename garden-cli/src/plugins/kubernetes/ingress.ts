/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { V1Secret } from "@kubernetes/client-node"
import { groupBy } from "lodash"
import { PluginContext } from "../../plugin-context"
import { findByName } from "../../util/util"
import { ContainerService, ContainerEndpointSpec } from "../container"
import { KubernetesProvider, IngressTlsSecret } from "./kubernetes"
import { getAppNamespace } from "./namespace"
import { ServiceEndpoint, ServiceProtocol } from "../../types/service"
import * as Bluebird from "bluebird"
import { coreApi, upsert } from "./api"
import { ConfigurationError } from "../../exceptions"

export async function createIngresses(ctx: PluginContext, provider: KubernetesProvider, service: ContainerService) {
  if (service.spec.endpoints.length === 0) {
    return []
  }

  const kubeContext = provider.config.context
  const namespace = await getAppNamespace(ctx, provider)

  // group endpoints by domain, so we can properly configure TLS
  const grouped = groupBy(service.spec.endpoints, "domain")

  return Bluebird.map(Object.entries(grouped), async ([domain, endpointSpecs]) => {
    const rules = endpointSpecs.map(endpointSpec => {
      const endpoint = getEndpoint(service, provider, endpointSpec)

      return {
        host: endpoint.hostname,
        paths: [{
          path: endpoint.path,
          backend: {
            serviceName: service.name,
            servicePort: findByName(service.spec.ports, endpointSpec.port)!.containerPort,
          },
        }],
      }
    })

    const domainConfig = findByName(provider.config.ingressDomains, domain)!
    const useTls = domainConfig.tlsSecrets.length > 0

    // make sure the TLS secrets exist in this namespace
    await Bluebird.map(domainConfig.tlsSecrets, secretRef => ensureSecret(kubeContext, secretRef, namespace))

    const annotations = {
      "kubernetes.io/ingress.class": provider.config.ingressClass,
      "ingress.kubernetes.io/force-ssl-redirect": useTls + "",
    }

    const spec: any = { rules }

    if (useTls) {
      // TODO: make sure TLS certs exist in this namespace
      spec.tls = domainConfig.tlsSecrets.map(t => t.name)
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

/**
 * Make sure the specified secret exists in the target namespace, copying it if necessary.
 *
 * @param context
 * @param secretRef
 * @param targetNamespace
 */
async function ensureSecret(context: string, secretRef: IngressTlsSecret, targetNamespace: string) {
  let secret: V1Secret

  try {
    secret = (await coreApi(context).readNamespacedSecret(secretRef.name, secretRef.namespace)).body
  } catch (err) {
    if (err.code === 404) {
      throw new ConfigurationError(
        `Could not find TLS secret '${secretRef.name}' in namespace '${secretRef.namespace}'. ` +
        `Have you correctly configured your TLS secrets?`,
        {
          secretRef,
        },
      )
    } else {
      throw err
    }
  }

  if (secretRef.namespace === targetNamespace) {
    return
  }

  secret.metadata.namespace = targetNamespace

  await upsert("Secret", targetNamespace, context, secret)
}

function getEndpointHostname(service: ContainerService, spec: ContainerEndpointSpec): string {
  if (spec.subdomain === null) {
    return spec.domain!
  } else {
    return `${spec.subdomain || service.name}.${spec.domain}`
  }
}

function getEndpoint(
  service: ContainerService, provider: KubernetesProvider, endpoint: ContainerEndpointSpec,
): ServiceEndpoint {
  const domain = findByName(provider.config.ingressDomains, endpoint.domain!)!
  // TODO: support other protocols
  const protocol: ServiceProtocol = domain.tlsSecrets.length > 0 ? "https" : "http"
  const ingressPort = provider.config.ingressPort
  const hostname = getEndpointHostname(service, endpoint)

  return {
    ...endpoint,
    domain: domain.name,
    hostname,
    path: endpoint.path,
    port: ingressPort,
    protocol,
    subdomain: endpoint.subdomain === undefined ? service.name : endpoint.subdomain,
    url: `${protocol}://${hostname}:${ingressPort}`,
  }
}

export function getEndpoints(
  service: ContainerService, provider: KubernetesProvider, endpoints: ContainerEndpointSpec[],
): ServiceEndpoint[] {
  return endpoints.map(e => getEndpoint(service, provider, e))
}
