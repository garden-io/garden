/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ObjectSchema } from "@hapi/joi"
import chalk from "chalk"
import { runResultToActionState } from "../../../actions/base"
import { RunAction, RunActionConfig } from "../../../actions/run"
import { TestAction, TestActionConfig } from "../../../actions/test"
import { Resolved } from "../../../actions/types"
import { createSchema } from "../../../config/common"
import { ConfigurationError } from "../../../exceptions"
import { Log } from "../../../logger/log-entry"
import { PluginContext } from "../../../plugin-context"
import { RunActionDefinition, TestActionDefinition } from "../../../plugin/action-types"
import { RunResult } from "../../../plugin/base"
import { dedent, deline } from "../../../util/string"
import { KubeApi } from "../api"
import {
  kubernetesCommonRunSchemaKeys,
  KubernetesCommonRunSpec,
  KubernetesPluginContext,
  KubernetesTargetResourceSpec,
  runPodResourceSchema,
} from "../config"
import { getActionNamespaceStatus } from "../namespace"
import { k8sGetRunResult } from "../run-results"
import { SyncableResource } from "../types"
import { execInWorkload, readTargetResource } from "../util"
import { KubernetesRunOutputs, kubernetesRunOutputsSchema } from "./config"

// RUN //

export interface KubernetesExecRunActionSpec extends Omit<KubernetesCommonRunSpec, "artifacts" | "command"> {
  resource: KubernetesTargetResourceSpec
}
export type KubernetesExecRunActionConfig = RunActionConfig<"kubernetes-exec", KubernetesExecRunActionSpec>
export type KubernetesExecRunAction = RunAction<KubernetesExecRunActionConfig, KubernetesRunOutputs>

// Maintaining this cache to avoid errors when `kubernetesRunExecSchema` is called more than once with the same `kind`.
const runSchemas: { [name: string]: ObjectSchema } = {}

export const kuberneteExecRunSchema = (kind: string) => {
  const name = `${kind}:kubernetes-exec`
  if (runSchemas[name]) {
    return runSchemas[name]
  }
  const schema = createSchema({
    name,
    keys: () => ({
      ...kubernetesCommonRunSchemaKeys(),
      resource: runPodResourceSchema(kind).required(),
    }),
  })()
  runSchemas[name] = schema
  return schema
}

export const kubernetesExecRunDefinition = (): RunActionDefinition<KubernetesExecRunAction> => ({
  name: "kubernetes-exec",
  docs: dedent`
    Executes a Run in an already deployed Kubernetes Pod and waits for it to complete.

    The \`resource\` field is used to find the target Pod in the cluster.
  `,
  schema: kuberneteExecRunSchema("Run"),
  runtimeOutputsSchema: kubernetesRunOutputsSchema(),
  handlers: {
    run: async (params) => {
      const { ctx, log, action } = params
      const result = await readAndExec({ ctx, log, action })
      // Note: We don't store a result for this action type, since there's no clear underlying version to use.
      return { state: runResultToActionState(result), detail: result, outputs: { log: result.log } }
    },

    getResult: k8sGetRunResult,
  },
})

// TEST //

export interface KubernetesExecTestActionSpec extends KubernetesExecRunActionSpec {}
export type KubernetesExecTestActionConfig = TestActionConfig<"kubernetes-exec", KubernetesExecTestActionSpec>
export type KubernetesExecTestAction = TestAction<KubernetesExecTestActionConfig, KubernetesRunOutputs>

export const kubernetesExecTestDefinition = (): TestActionDefinition<KubernetesExecTestAction> => ({
  name: "kubernetes-exec",
  docs: dedent`
    Executes a Test in an already deployed Kubernetes Pod and waits for it to complete.

    The \`resource\` field is used to find the target Pod in the cluster.
  `,
  schema: kuberneteExecRunSchema("Test"),
  runtimeOutputsSchema: kubernetesRunOutputsSchema(),
  handlers: {
    run: async (params) => {
      const { ctx, log, action } = params
      const result = await readAndExec({ ctx, log, action })
      // Note: We don't store a result for this action type, since there's no clear underlying version to use.
      return { state: runResultToActionState(result), detail: result, outputs: { log: result.log } }
    },

    getResult: k8sGetRunResult,
  },
})

// helpers //

async function readAndExec({
  ctx,
  log,
  action,
}: {
  ctx: PluginContext
  log: Log
  action: Resolved<KubernetesExecRunAction | KubernetesExecTestAction>
}): Promise<RunResult> {
  const { resource, args } = action.getSpec()
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
  const api = await KubeApi.factory(log, k8sCtx, provider)
  const namespaceStatus = await getActionNamespaceStatus({
    ctx: k8sCtx,
    log,
    action,
    provider,
  })
  const namespace = namespaceStatus.namespaceName

  const { kind: targetKind, name: targetName } = resource
  let target: SyncableResource

  try {
    target = await readTargetResource({
      api,
      namespace,
      query: resource,
    })
  } catch (err) {
    if (err.statusCode === 404) {
      throw new ConfigurationError(
        chalk.red(
          deline`${action.longDescription()} specifies target resource ${targetKind}/${targetName}, which could not
          be found in namespace ${namespace}. Hint: This action may be missing a dependency on a Deploy in this
          project that deploys the target resource. If so, adding that dependency will ensure that the Deploy is run
          before this action.`
        ),
        { resource, namespace }
      )
    } else {
      throw err
    }
  }

  const startedAt = new Date()
  const res = await execInWorkload({
    ctx,
    provider,
    log,
    namespace,
    workload: target,
    command: args,
    interactive: false,
    streamLogs: true,
  })
  const completedAt = new Date()
  const execLog = res.output || ""

  return {
    success: res.code === 0,
    exitCode: res.code,
    startedAt,
    completedAt,
    namespaceStatus,
    log: execLog,
  }
}
