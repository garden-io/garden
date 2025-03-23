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
import type { KubernetesDeployAction, KubernetesDeployActionConfig } from "./config.js"
import { kubernetesManifestFilesSchema } from "./config.js"
import { kubernetesDeploySchema, kubernetesManifestTemplatesSchema } from "./config.js"
import { execInKubernetesDeploy } from "./exec.js"
import {
  deleteKubernetesDeploy,
  getKubernetesDeployLogs,
  getKubernetesDeployStatus,
  kubernetesDeploy,
} from "./handlers.js"
import { ConfigurationError, GardenError } from "../../../exceptions.js"
import { uniq } from "lodash-es"
import { DOCS_BASE_URL } from "../../../constants.js"
import { kubernetesGetSyncStatus, kubernetesStartSync } from "./sync.js"
import { k8sContainerStopSync } from "../container/sync.js"
import { validateSchema } from "../../../config/validation.js"
import type { PluginContext } from "../../../plugin-context.js"
import type { ResolvedTemplate } from "../../../template/types.js"
import type { ArraySchema } from "@hapi/joi"
import type { KubernetesDeployActionSpecFileSources } from "./common.js"
import { getSpecFiles } from "./common.js"

export const kubernetesDeployDocs = dedent`
  Specify one or more Kubernetes manifests to deploy.

  You can either (or both) specify the manifests as part of the \`garden.yml\` configuration, or you can refer to one or more files with existing manifests.

  Note that if you include the manifests in the \`garden.yml\` file, you can use [template strings](${DOCS_BASE_URL}/config-guides/variables-and-templating) to interpolate values into the manifests.

  If you need more advanced templating features you can use the [helm](./helm.md) Deploy type.
`

export function evaluateKubernetesDeploySpecFiles({
  ctx,
  config,
  filesFieldName,
  filesFieldSchema,
}: {
  ctx: PluginContext
  config: KubernetesDeployActionConfig
  filesFieldName: keyof KubernetesDeployActionSpecFileSources
  filesFieldSchema: () => ArraySchema
}): string[] {
  let evaluatedFiles: ResolvedTemplate
  try {
    evaluatedFiles = ctx.deepEvaluate(config.spec[filesFieldName])
  } catch (error) {
    if (!(error instanceof GardenError)) {
      throw error
    }
    throw new ConfigurationError({
      message: `The spec.${filesFieldName} field in Deploy action ${config.name} contains a template string which could not be resolved. Note that some template variables are not available for the field. Error: ${error}`,
      wrappedErrors: [error],
    })
  }

  return validateSchema<string[]>(evaluatedFiles, filesFieldSchema(), {
    source: {
      yamlDoc: config.internal.yamlDoc,
      path: ["spec", filesFieldName],
    },
  })
}

export function getFileSources({
  ctx,
  config,
}: {
  ctx: PluginContext
  config: KubernetesDeployActionConfig
}): KubernetesDeployActionSpecFileSources {
  const manifestFiles = evaluateKubernetesDeploySpecFiles({
    ctx,
    config,
    filesFieldName: "manifestFiles",
    filesFieldSchema: kubernetesManifestFilesSchema,
  })
  const manifestTemplates = evaluateKubernetesDeploySpecFiles({
    ctx,
    config,
    filesFieldName: "manifestTemplates",
    filesFieldSchema: kubernetesManifestTemplatesSchema,
  })

  return { manifestFiles, manifestTemplates }
}

export const kubernetesDeployDefinition = (): DeployActionDefinition<KubernetesDeployAction> => ({
  name: "kubernetes",
  docs: kubernetesDeployDocs,
  schema: kubernetesDeploySchema(),
  // outputsSchema: kubernetesDeployOutputsSchema(),
  handlers: {
    configure: async ({ ctx, config }) => {
      if (!config.spec.kustomize) {
        if (!config.include) {
          config.include = []
        }

        const { manifestFiles, manifestTemplates } = getSpecFiles({
          actionRef: config,
          fileSources: getFileSources({ ctx, config }),
        })

        config.include = uniq([...config.include, ...manifestTemplates, ...manifestFiles])
      }

      return { config, supportedModes: { sync: !!config.spec.sync, local: !!config.spec.localMode } }
    },

    deploy: kubernetesDeploy,
    delete: deleteKubernetesDeploy,
    exec: execInKubernetesDeploy,
    getLogs: getKubernetesDeployLogs,
    getStatus: getKubernetesDeployStatus,

    startSync: kubernetesStartSync,
    stopSync: k8sContainerStopSync,
    getSyncStatus: kubernetesGetSyncStatus,

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
