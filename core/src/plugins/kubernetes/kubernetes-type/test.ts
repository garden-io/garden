/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { storeTestResult } from "../test-results"
import { KubernetesPluginContext } from "../config"
import { getActionNamespaceStatus } from "../namespace"
import { runOrTest } from "./common"
import { KubernetesRunActionSpec, KubernetesRunOutputs, kubernetesRunOutputsSchema, kubernetesRunSchema } from "./run"
import { TestAction, TestActionConfig } from "../../../actions/test"
import { TestActionDefinition } from "../../../plugin/action-types"
import { dedent } from "../../../util/string"
import { k8sGetTestResult } from "../test-results"
import { runResultToActionState } from "../../../actions/base"

interface KubernetesTestOutputs extends KubernetesRunOutputs {}
const kubernetesTestOutputsSchema = () => kubernetesRunOutputsSchema()

interface KubernetesTestActionSpec extends KubernetesRunActionSpec {}
export type KubernetesTestActionConfig = TestActionConfig<"kubernetes-pod", KubernetesTestActionSpec>
export type KubernetesTestAction = TestAction<KubernetesTestActionConfig, KubernetesTestOutputs>

const kubernetesTestSchema = () => kubernetesRunSchema()

export const kubernetesTestDefinition = (): TestActionDefinition<KubernetesTestAction> => ({
  name: "kubernetes-pod",
  docs: dedent`
    Run a test in an ad-hoc instance of a Kubernetes Pod.

    TODO-G2
  `,
  schema: kubernetesTestSchema(),
  runtimeOutputsSchema: kubernetesTestOutputsSchema(),
  handlers: {
    run: async (params) => {
      // TODO-G2: dedupe code from Run handler, does a lot of the same thing
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
        testName: action.name,
        namespaceStatus,
        ...res,
      }

      await storeTestResult({
        ctx: k8sCtx,
        log,
        action,
        result: detail,
      })

      return { state: runResultToActionState(detail), detail, outputs: { log: res.log } }
    },

    getResult: k8sGetTestResult,
  },
})
