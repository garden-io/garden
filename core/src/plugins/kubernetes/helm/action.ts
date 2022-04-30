/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DOCS_BASE_URL } from "../../../constants"
import { DeployActionDefinition } from "../../../plugin/action-types"
import { dedent } from "../../../util/string"
import { KubernetesPluginContext } from "../config"
import { getPortForwardHandler } from "../port-forward"
import { getActionNamespace } from "../namespace"
import { HelmDeployAction, helmDeploySchema } from "./config"
import { deleteHelmDeploy, helmDeploy } from "./deployment"
import { execInHelmDeploy } from "./exec"
import { getHelmDeployLogs } from "./logs"
import { getHelmDeployStatus } from "./status"

export const helmDeployDocs = dedent`
  Specify a Helm chart (either in your repository or remote from a registry) to deploy.

  Refer to the [Helm guide](${DOCS_BASE_URL}/guides/using-helm-charts) for usage instructions.
`

export const helmDeployDefinition = (): DeployActionDefinition<HelmDeployAction> => ({
  name: "helm",
  docs: helmDeployDocs,
  schema: helmDeploySchema(),
  // outputsSchema: helmDeployOutputsSchema(),
  handlers: {
    deploy: helmDeploy,
    delete: deleteHelmDeploy,
    exec: execInHelmDeploy,
    getLogs: getHelmDeployLogs,
    getStatus: getHelmDeployStatus,

    getPortForward: async (params) => {
      const { ctx, log, action } = params
      const k8sCtx = <KubernetesPluginContext>ctx
      const namespace = await getActionNamespace({
        ctx: k8sCtx,
        log,
        action,
        provider: k8sCtx.provider,
        skipCreate: true,
      })
      return getPortForwardHandler({ ...params, namespace })
    },
  },
})
