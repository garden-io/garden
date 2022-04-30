/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DeployActionDefinition } from "../../../plugin/action-types"
import { dedent } from "../../../util/string"
import { KubernetesPluginContext } from "../config"
import { getPortForwardHandler } from "../port-forward"
import { getActionNamespace } from "../namespace"
import { KubernetesDeployAction, kubernetesDeploySchema } from "./config"
import { execInKubernetesDeploy } from "./exec"
import {
  deleteKubernetesDeploy,
  getKubernetesDeployLogs,
  getKubernetesDeployStatus,
  kubernetesDeploy,
} from "./handlers"

export const kubernetesDeployDocs = dedent`
  Specify one or more Kubernetes manifests to deploy.

  You can either (or both) specify the manifests as part of the \`garden.yml\` configuration, or you can refer to
  one or more files with existing manifests.

  Note that if you include the manifests in the \`garden.yml\` file, you can use
  [template strings](../../using-garden/variables-and-templating.md) to interpolate values into the manifests.

  If you need more advanced templating features you can use the [helm](./helm.md) Deploy type.
`

export const kubernetesDeployDefinition = (): DeployActionDefinition<KubernetesDeployAction> => ({
  name: "kubernetes",
  docs: kubernetesDeployDocs,
  schema: kubernetesDeploySchema(),
  // outputsSchema: kubernetesDeployOutputsSchema(),
  handlers: {
    deploy: kubernetesDeploy,
    delete: deleteKubernetesDeploy,
    exec: execInKubernetesDeploy,
    getLogs: getKubernetesDeployLogs,
    getStatus: getKubernetesDeployStatus,

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

