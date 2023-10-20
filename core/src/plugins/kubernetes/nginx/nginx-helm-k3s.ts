/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { SystemVars } from "../init"
import { NginxHelmValuesGetter } from "./nginx-helm"

export const getK3sNginxHelmValues: NginxHelmValuesGetter = (systemVars: SystemVars) => {
  return {
    name: "ingress-controller",
    controller: {
      extraArgs: {
        "default-backend-service": `${systemVars.namespace}/default-backend`,
      },
      kind: "Deployment",
      replicaCount: 1,
      updateStrategy: {
        type: "RollingUpdate",
        rollingUpdate: {
          maxUnavailable: 1,
        },
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
    },
    defaultBackend: {
      enabled: false,
    },
  }
}
