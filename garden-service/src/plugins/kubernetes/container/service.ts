/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { V1ServicePort } from "@kubernetes/client-node"
import { ContainerService } from "../../container/config"
import { gardenAnnotationKey } from "../../../util/string"

export async function createServiceResources(service: ContainerService, namespace: string) {
  const services: any = []

  const addService = (name: string, type: string, servicePorts: V1ServicePort[]) => {
    services.push({
      apiVersion: "v1",
      kind: "Service",
      metadata: {
        name,
        annotations: service.spec.annotations,
        namespace,
      },
      spec: {
        ports: servicePorts,
        selector: {
          [gardenAnnotationKey("service")]: service.name,
          [gardenAnnotationKey("version")]: service.module.version.versionString,
        },
        type,
      },
    })
  }

  // first add internally exposed (ClusterIP) service
  const ports = service.spec.ports

  if (ports.length) {
    const serviceType = ports.filter(portSpec => !!portSpec.nodePort).length > 0 ? "NodePort" : "ClusterIP"

    addService(service.name, serviceType, ports.map(portSpec => {
      const port: V1ServicePort = {
        name: portSpec.name,
        protocol: portSpec.protocol,
        port: portSpec.servicePort,
        targetPort: portSpec.containerPort,
      }

      if (portSpec.nodePort && portSpec.nodePort !== true) {
        port.nodePort = portSpec.nodePort
      }

      return port
    }))
  }

  return services
}

export function rsyncPortName(serviceName: string) {
  return `garden-rsync-${serviceName}`
}
