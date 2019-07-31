/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { V1ServicePort } from "@kubernetes/client-node"
import { ContainerService } from "../../container/config"

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
          service: service.name,
        },
        type,
      },
    })
  }

  // first add internally exposed (ClusterIP) service
  const ports = service.spec.ports

  if (ports.length) {
    addService(service.name, "ClusterIP", ports.map(portSpec => ({
      name: portSpec.name,
      protocol: portSpec.protocol,
      targetPort: portSpec.containerPort,
      port: portSpec.servicePort,
    })))
  }

  // optionally add a NodePort service for externally open ports, if applicable
  const exposedPorts = ports.filter(portSpec => portSpec.nodePort)

  if (exposedPorts.length > 0) {
    const nodePorts = exposedPorts.map(portSpec => {
      const port: V1ServicePort = {
        name: portSpec.name,
        protocol: portSpec.protocol,
        port: portSpec.servicePort,
        targetPort: portSpec.containerPort,
      }
      if (portSpec.nodePort !== true) {
        port.nodePort = portSpec.nodePort
      }
      return port
    })

    addService(service.name + "-nodeport", "NodePort", nodePorts)
  }

  return services
}

export function rsyncPortName(serviceName) {
  return `garden-rsync-${serviceName}`
}
