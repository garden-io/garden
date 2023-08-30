/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// import { V1ServicePort } from "@kubernetes/client-node"
// import { Resolved } from "../../../actions/types"
// import { ContainerDeployAction } from "../../container/config"
// import { KubernetesProvider } from "../config"
// import { ServiceIngressWithCert } from "../container/ingress"

// export async function getEphemeralClusterIngresses(
//   action: Resolved<ContainerDeployAction>,
//   provider: KubernetesProvider
// ): Promise<ServiceIngressWithCert[]> {
//   const ingresses = action.getSpec("ingresses")
//   const portsSpec = action.getSpec("ports")
//   return ingresses.map((ingressSpec) => {
//     const ingressPort = portsSpec?.find((p) => p.name === ingressSpec.port)
//     return {
//       ...ingressSpec,
//       hostname: `${action.name}-${ingressPort?.servicePort}-${provider.config.defaultHostname}`,
//       path: ingressSpec.path,
//       port: undefined,
//       spec: ingressSpec,
//       protocol: "https",
//     }
//   })
// }

// export function addEphemeralClusterIngressAnnotation(annotations: { [name: string]: string }): {
//   [name: string]: string
// } {
//   annotations["kubernetes.namespace.so/expose"] = "true"
//   return annotations
// }

// export function addEphemeralClusterIngressPortsAnnotation(
//   servicePorts: V1ServicePort[],
//   annotations: { [name: string]: string }
// ): {
//   [name: string]: string
// } {
//   servicePorts.forEach((servicePort) => {
//     annotations[`kubernetes.namespace.so/exposed-port-${servicePort.port}`] = "noauth"
//   })
//   return annotations
// }
