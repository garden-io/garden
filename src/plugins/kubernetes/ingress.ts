/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginContext } from "../../plugin-context"
import { ContainerService } from "../container"

export async function createIngress(service: ContainerService, externalHostname: string) {
  if (service.config.endpoints.length === 0) {
    return null
  }

  const rules = service.config.endpoints.map(e => {
    const rule: any = {}

    // TODO: support separate hostnames per endpoint
    rule.host = externalHostname

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

  return {
    apiVersion: "extensions/v1beta1",
    kind: "Ingress",
    metadata: {
      name: service.name,
      annotations: {
        "garden.io/generated": "true",
        "garden.io/version": await service.module.getVersion(),
        "kubernetes.io/ingress.class": "nginx",
        // TODO: allow overriding this (should only be applied to localhost deployments)
        "ingress.kubernetes.io/force-ssl-redirect": "false",
      },
    },
    spec: {
      rules,
    },
  }
}

export function getProjectHostname() {
  // TODO: make configurable
  return "local.app.garden"
}

export function getServiceHostname(ctx: PluginContext, service: ContainerService) {
  return `${service.name}.${ctx.projectName}.${getProjectHostname()}`
}
