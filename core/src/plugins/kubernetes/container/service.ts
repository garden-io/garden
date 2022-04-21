/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { V1Service, V1ServicePort } from "@kubernetes/client-node"
import { ContainerService, ServicePortSpec } from "../../container/moduleConfig"
import { getDeploymentSelector } from "./deployment"
import { KubernetesResource } from "../types"
import { find } from "lodash"

function toServicePort(portSpec: ServicePortSpec): V1ServicePort {
  const port: V1ServicePort = {
    name: portSpec.name,
    protocol: portSpec.protocol,
    port: portSpec.servicePort,
    targetPort: <any>portSpec.containerPort,
  }

  if (portSpec.nodePort && portSpec.nodePort !== true) {
    port.nodePort = portSpec.nodePort
  }

  return port
}

// todo: consider returning Promise<KubernetesResource<V1Service>[]>
export async function createServiceResources(
  service: ContainerService,
  namespace: string,
  blueGreen: boolean
): Promise<any> {
  if (!service.spec.ports.length) {
    return []
  }

  const createServiceResource = (containerService: ContainerService): KubernetesResource<V1Service> => {
    const specPorts = service.spec.ports
    const serviceType = !!find(specPorts, (portSpec) => !!portSpec.nodePort) ? "NodePort" : "ClusterIP"
    const servicePorts = specPorts.map(toServicePort)

    return {
      apiVersion: "v1",
      kind: "Service",
      metadata: {
        name: containerService.name,
        annotations: containerService.spec.annotations,
        namespace,
      },
      spec: {
        ports: servicePorts,
        selector: getDeploymentSelector(containerService, blueGreen),
        type: serviceType,
      },
    }
  }

  return [createServiceResource(service)]
}

export function rsyncPortName(serviceName: string) {
  return `garden-rsync-${serviceName}`
}
