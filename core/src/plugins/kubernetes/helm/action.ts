/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { DeployActionDefinition } from "../../../plugin/action-types.js"
import { dedent } from "../../../util/string.js"
import type { KubernetesPluginContext } from "../config.js"
import { getPortForwardHandler } from "../port-forward.js"
import { getActionNamespace } from "../namespace.js"
import type { HelmDeployAction } from "./config.js"
import { helmDeploySchema } from "./config.js"
import { deleteHelmDeploy, helmDeploy } from "./deployment.js"
import { execInHelmDeploy } from "./exec.js"
import { getHelmDeployLogs } from "./logs.js"
import { getHelmDeployStatus } from "./status.js"
import { posix } from "path"
import { k8sContainerStopSync } from "../container/sync.js"
import { helmGetSyncStatus, helmStartSync } from "./sync.js"
import { makeDocsLinkPlain } from "../../../docs/common.js"
import { helmVersion } from "./helm-cli.js"
import type { ActionModes } from "../../../actions/types.js"
import { reportDeprecatedFeatureUsage } from "../../../util/deprecations.js"

export const getHelmDeployDocs = () => dedent`
  Specify a Helm chart (either in your repository or remote from a registry) to deploy.

  Refer to the [Helm guide](${makeDocsLinkPlain`garden-for/kubernetes/install-helm-chart`}) for usage instructions.

  Garden uses Helm ${helmVersion}.
`

export const helmDeployDefinition = (): DeployActionDefinition<HelmDeployAction> => ({
  name: "helm",
  docs: getHelmDeployDocs(),
  schema: helmDeploySchema(),
  // outputsSchema: helmDeployOutputsSchema(),
  handlers: {
    deploy: helmDeploy,
    delete: deleteHelmDeploy,
    exec: execInHelmDeploy,
    getLogs: getHelmDeployLogs,
    getStatus: getHelmDeployStatus,

    startSync: helmStartSync,
    stopSync: k8sContainerStopSync,
    getSyncStatus: helmGetSyncStatus,

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

    configure: async ({ config, log }) => {
      if (config.spec["localMode"]) {
        reportDeprecatedFeatureUsage({ log, deprecation: "localMode" })
      }

      const chartPath = config.spec.chart?.path
      const containsSources = !!chartPath

      // Automatically set the include if not explicitly set
      if (chartPath && !(config.include || config.exclude)) {
        const valueFiles = config.spec.valueFiles || []
        config.include = containsSources
          ? ["*", "charts/**/*", "templates/**/*", ...valueFiles]
          : ["*.yaml", "*.yml", ...valueFiles]

        config.include = config.include.map((path) => posix.join(chartPath, path))
      }

      return { config, supportedModes: { sync: !!config.spec.sync } satisfies ActionModes }
    },
  },
})
