/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { V1Service, V1ServicePort } from "@kubernetes/client-node"
import type { ServicePortSpec } from "../../container/moduleConfig.js"
import type { ContainerDeployAction } from "../../container/moduleConfig.js"
import { getDeploymentSelector } from "./deployment.js"
import type { KubernetesResource } from "../types.js"
import { find } from "lodash-es"
import type { Resolved } from "../../../actions/types.js"

function toServicePort(portSpec: ServicePortSpec): V1ServicePort {
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
}

// todo: consider returning Promise<KubernetesResource<V1Service>[]>
export async function createServiceResources(action: Resolved<ContainerDeployAction>, namespace: string): Promise<any> {
  const specPorts = action.getSpec("ports")

  if (!specPorts.length) {
    return []
  }

  const createServiceResource = (containerAction: Resolved<ContainerDeployAction>): KubernetesResource<V1Service> => {
    const serviceType = !!find(specPorts, (portSpec) => !!portSpec.nodePort) ? "NodePort" : "ClusterIP"
    const servicePorts = specPorts.map(toServicePort)

    return {
      apiVersion: "v1",
      kind: "Service",
      metadata: {
        name: containerAction.name,
        annotations: containerAction.getSpec("annotations"),
        namespace,
      },
      spec: {
        ports: servicePorts,
        selector: getDeploymentSelector(action),
        type: serviceType,
      },
    }
  }

  return [createServiceResource(action)]
}
