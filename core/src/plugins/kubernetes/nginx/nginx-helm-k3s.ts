/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { SystemVars } from "../init.js"
import type { NginxHelmValues } from "./nginx-helm.js"
import { HelmGardenIngressController } from "./nginx-helm.js"

export class K3sHelmGardenIngressController extends HelmGardenIngressController {
  override getNginxHelmValues(systemVars: SystemVars): NginxHelmValues {
    return {
      name: "ingress-controller",
      controller: {
        kind: "Deployment",
        updateStrategy: {
          type: "RollingUpdate",
          rollingUpdate: {
            maxUnavailable: 1,
          },
        },
        extraArgs: {
          "default-backend-service": `${systemVars.namespace}/default-backend`,
        },
        minReadySeconds: 1,
        tolerations: systemVars["system-tolerations"],
        nodeSelector: systemVars["system-node-selector"],
        admissionWebhooks: {
          enabled: false,
        },
        ingressClassResource: {
          name: "nginx",
          enabled: true,
          default: true,
        },
        replicaCount: 1,
      },
      defaultBackend: {
        enabled: false,
      },
    }
  }
}
