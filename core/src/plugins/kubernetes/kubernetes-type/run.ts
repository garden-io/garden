/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  kubernetesCommonRunSchemaKeys,
  KubernetesCommonRunSpec,
  KubernetesPluginContext,
  KubernetesTargetResourceSpec,
  runPodSpecWhitelistDescription,
  targetResourceSpecSchema,
} from "../config"
import { k8sGetRunResult, storeRunResult } from "../run-results"
import { getActionNamespaceStatus } from "../namespace"
import { STATIC_DIR } from "../../../constants"
import type { RunActionDefinition } from "../../../plugin/action-types"
import { dedent } from "../../../util/string"
import type { RunAction, RunActionConfig } from "../../../actions/run"
import { joi } from "../../../config/common"
import { containerRunOutputSchema } from "../../container/config"
import type { V1PodSpec } from "@kubernetes/client-node"
import { readFileSync } from "fs"
import { join } from "path"
import { runOrTest } from "./common"
import { runResultToActionState } from "../../../actions/base"

export interface KubernetesRunOutputs {
  log: string
}
export const kubernetesRunOutputsSchema = () => containerRunOutputSchema()

export interface KubernetesRunActionSpec extends KubernetesCommonRunSpec {
  resource?: KubernetesTargetResourceSpec
  podSpec?: V1PodSpec
}
export type KubernetesRunActionConfig = RunActionConfig<"kubernetes", KubernetesRunActionSpec>
export type KubernetesRunAction = RunAction<KubernetesRunActionConfig, KubernetesRunOutputs>

// Need to use a sync read to avoid having to refactor createGardenPlugin()
// The `pod-v1.json` file is copied from the handy
// kubernetes-json-schema repo (https://github.com/instrumenta/kubernetes-json-schema/tree/master/v1.18.1-standalone).
const jsonSchema = () =>
  JSON.parse(readFileSync(join(STATIC_DIR, "kubernetes", "persistentvolumeclaim.json")).toString())

export const kubernetesRunSchema = () =>
  joi
    .object()
    .keys({
      ...kubernetesCommonRunSchemaKeys(),
      resource: targetResourceSpecSchema()
        .required()
        .description(
          dedent`
          Specify a Kubernetes resource to derive the Pod spec from for the run.

          This resource will be fetched from the target namespace, so you'll need to make sure it's been deployed previously (say, by configuring a dependency on a \`helm\` or \`kubernetes\` Deploy).

          The following fields from the Pod will be used (if present) when executing the task:
          ${runPodSpecWhitelistDescription()}
          `
        ),
      // TODO: allow reading the pod spec from a file
      podSpec: joi
        .object()
        .jsonSchema({ ...jsonSchema().properties.spec, type: "object" })
        .description(
          dedent`
          Supply a custom Pod specification. This should be a normal Kubernetes Pod manifest. Note that the spec will be modified for the run, including overriding with other fields you may set here (such as \`args\` and \`env\`), and removing certain fields that are not supported.

          The following Pod spec fields from the will be used (if present) when executing the task:
          ${runPodSpecWhitelistDescription()}
        `
        ),
    })
    .xor("resource", "podSpec")

export const kubernetesRunDefinition = (): RunActionDefinition<KubernetesRunAction> => ({
  name: "kubernetes-pod",
  docs: dedent`
    Run an ad-hoc instance of a Kubernetes Pod and wait for it to complete.

    TODO-G2
  `,
  schema: kubernetesRunSchema(),
  outputs: {
    schema: kubernetesRunOutputsSchema(),
  },
  handlers: {
    run: async (params) => {
      const { ctx, log, action } = params
      const k8sCtx = <KubernetesPluginContext>ctx
      const namespaceStatus = await getActionNamespaceStatus({
        ctx: k8sCtx,
        log,
        action,
        provider: k8sCtx.provider,
      })
      const namespace = namespaceStatus.namespaceName

      const res = await runOrTest({ ...params, ctx: k8sCtx, namespace })

      const detail = {
        ...res,
        namespaceStatus,
        taskName: action.name,
        outputs: {
          log: res.log || "",
        },
      }

      if (action.getSpec("cacheResult")) {
        await storeRunResult({
          ctx,
          log,
          action,
          result: detail,
        })
      }

      return { state: runResultToActionState(detail), detail, outputs: detail.outputs }
    },

    getResult: k8sGetRunResult,
  },
})
