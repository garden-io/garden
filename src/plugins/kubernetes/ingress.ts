/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginContext } from "../../plugin-context"
import { ContainerService } from "../container"
import { KubernetesProvider } from "./index"

export async function createIngress(ctx: PluginContext, provider: KubernetesProvider, service: ContainerService) {
  // FIXME: ingresses don't get updated when deployment is already running (rethink status check)
  if (service.config.endpoints.length === 0) {
    return null
  }

  const rules = service.config.endpoints.map(e => {
    const rule: any = {}

    // TODO: support separate hostnames per endpoint
    rule.host = getServiceHostname(ctx, provider, service)

    const backend = {
      serviceName: service.name,
      servicePort: service.config.ports[e.port].containerPort,
    }

    rule.http = {
      paths: (e.paths || ["/"]).map(p => ({
        path: p,
        backend,
      })),
    }

    return rule
  })

  const { versionString } = await service.module.getVersion()
  const ingressClass = provider.config.ingressClass

  const annotations = {
    "garden.io/generated": "true",
    "garden.io/version": versionString,
    "ingress.kubernetes.io/force-ssl-redirect": provider.config.forceSsl,
  }

  if (ingressClass) {
    annotations["kubernetes.io/ingress.class"] = ingressClass
  }

  return {
    apiVersion: "extensions/v1beta1",
    kind: "Ingress",
    metadata: {
      name: service.name,
      annotations,
    },
    spec: {
      rules,
    },
  }
}

export function getServiceHostname(ctx: PluginContext, provider: KubernetesProvider, service: ContainerService) {
  const baseHostname = provider.config.ingressHostname

  return `${service.name}.${ctx.projectName}.${baseHostname}`
}
