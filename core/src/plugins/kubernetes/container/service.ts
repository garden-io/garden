/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { V1Service, V1ServicePort } from "@kubernetes/client-node"
import { ServicePortSpec } from "../../container/moduleConfig"
import { ContainerDeployAction } from "../../container/moduleConfig"
import { getDeploymentSelector } from "./deployment"
import { KubernetesResource } from "../types"
import { find } from "lodash"
import { Resolved } from "../../../actions/types"
import { KubernetesConfig } from "../config"
import { Provider } from "../../../config/provider"
import { EPHEMERAL_KUBERNETES_PROVIDER_NAME } from "../ephemeral/ephemeral"
import { addEphemeralClusterIngressAnnotation } from "../ephemeral/ingress"

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
  action: Resolved<ContainerDeployAction>,
  namespace: string,
  provider?: Provider<KubernetesConfig>
): Promise<any> {
  const specPorts = action.getSpec("ports")

  if (!specPorts.length) {
    return []
  }

  const createServiceResource = (containerAction: Resolved<ContainerDeployAction>): KubernetesResource<V1Service> => {
    const serviceType =
      provider?.name === EPHEMERAL_KUBERNETES_PROVIDER_NAME
        ? "LoadBalancer"
        : !!find(specPorts, (portSpec) => !!portSpec.nodePort)
        ? "NodePort"
        : "ClusterIP"
    const servicePorts = specPorts.map(toServicePort)

    const serviceMetadataAnnotations = containerAction.getSpec("annotations")
    if (provider?.name === EPHEMERAL_KUBERNETES_PROVIDER_NAME) {
      addEphemeralClusterIngressAnnotation(serviceMetadataAnnotations)
    }

    return {
      apiVersion: "v1",
      kind: "Service",
      metadata: {
        name: containerAction.name,
        annotations: serviceMetadataAnnotations,
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
