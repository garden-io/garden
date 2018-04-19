/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ContainerService } from "../container"

export async function createServices(service: ContainerService) {
  const services: any = []
  const { versionString } = await service.module.getVersion()

  const addService = (name: string, type: string, servicePorts: any[]) => {
    services.push({
      apiVersion: "v1",
      kind: "Service",
      metadata: {
        name,
        annotations: {
          "garden.io/generated": "true",
          "garden.io/version": versionString,
        },
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
  const internalPorts: any = []
  const ports = Object.entries(service.config.ports)

  for (const [portName, portSpec] of ports) {
    internalPorts.push({
      name: portName,
      protocol: portSpec.protocol,
      targetPort: portSpec.containerPort,
      port: portSpec.containerPort,
    })
  }

  if (internalPorts.length) {
    addService(service.name, "ClusterIP", internalPorts)
  }

  // optionally add a NodePort service for externally open ports, if applicable
  // TODO: explore nicer ways to do this
  const exposedPorts = ports.filter(([_, portSpec]) => portSpec.nodePort)

  if (exposedPorts.length > 0) {
    addService(service.name + "-nodeport", "NodePort", exposedPorts.map(([portName, portSpec]) => ({
      // TODO: do the parsing and defaults when loading the yaml
      name: portName,
      protocol: portSpec.protocol,
      port: portSpec.containerPort,
      nodePort: portSpec.nodePort,
    })))
  }

  return services
}
