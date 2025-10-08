/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ObjectSchema } from "@hapi/joi"
import { runResultToActionState } from "../../../actions/base.js"
import type { RunAction, RunActionConfig } from "../../../actions/run.js"
import type { TestAction, TestActionConfig } from "../../../actions/test.js"
import type { Resolved } from "../../../actions/types.js"
import { createSchema, joi } from "../../../config/common.js"
import { ConfigurationError } from "../../../exceptions.js"
import type { Log } from "../../../logger/log-entry.js"
import type { PluginContext } from "../../../plugin-context.js"
import type { RunActionDefinition, TestActionDefinition } from "../../../plugin/action-types.js"
import type { RunResult } from "../../../plugin/base.js"
import { dedent } from "../../../util/string.js"
import { KubernetesError } from "../api.js"
import type { KubernetesPluginContext, KubernetesTargetResourceSpec } from "../config.js"
import { namespaceNameSchema, runPodResourceSchema } from "../config.js"
import { getActionNamespaceStatus } from "../namespace.js"
import type { SyncableResource } from "../types.js"
import { execInWorkload, getTargetResource } from "../util.js"
import type { KubernetesRunOutputs } from "./config.js"
import { kubernetesRunOutputsSchema } from "./config.js"

// RUN //

export interface KubernetesExecRunActionSpec {
  resource: KubernetesTargetResourceSpec
  command: string[]
  namespace?: string
}

export type KubernetesExecRunActionConfig = RunActionConfig<"kubernetes-exec", KubernetesExecRunActionSpec>
export type KubernetesExecRunAction = RunAction<KubernetesExecRunActionConfig, KubernetesRunOutputs>

// Maintaining this cache to avoid errors when `kubernetesRunExecSchema` is called more than once with the same `kind`.
const runSchemas: { [name: string]: ObjectSchema } = {}

export const kubernetesExecRunSchema = (kind: string) => {
  const name = `${kind}:kubernetes-exec`
  if (runSchemas[name]) {
    return runSchemas[name]
  }
  const schema = createSchema({
    name,
    keys: () => ({
      command: joi
        .sparseArray()
        .items(joi.string().allow(""))
        .description("The command to run inside the kubernetes workload.")
        .example(["npm", "run", "test:integ"]),
      resource: runPodResourceSchema(kind).required(),
      namespace: namespaceNameSchema(),
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
  schema: kubernetesExecRunSchema("Run"),
  runtimeOutputsSchema: kubernetesRunOutputsSchema(),
  handlers: {
    run: async (params) => {
      const { ctx, log, action } = params
      const result = await readAndExec({ ctx, log, action, interactive: false })
      // Note: We don't store a result for this action type, since there's no clear underlying version to use.
      return { state: runResultToActionState(result), detail: result, outputs: { log: result.log } }
    },

    /**
     * We do not cache Run results of `kubernetes-exec` action type.
     */
    getResult: async ({}) => {
      return { state: "not-ready", detail: null, outputs: { log: "" } }
    },
  },
})

// TEST //

export type KubernetesExecTestActionSpec = KubernetesExecRunActionSpec
export type KubernetesExecTestActionConfig = TestActionConfig<"kubernetes-exec", KubernetesExecTestActionSpec>
export type KubernetesExecTestAction = TestAction<KubernetesExecTestActionConfig, KubernetesRunOutputs>

export const kubernetesExecTestDefinition = (): TestActionDefinition<KubernetesExecTestAction> => ({
  name: "kubernetes-exec",
  docs: dedent`
    Executes a Test in an already deployed Kubernetes Pod and waits for it to complete.

    The \`resource\` field is used to find the target Pod in the cluster.
  `,
  schema: kubernetesExecRunSchema("Test"),
  runtimeOutputsSchema: kubernetesRunOutputsSchema(),
  handlers: {
    run: async (params) => {
      const { ctx, log, action, interactive } = params
      const result = await readAndExec({ ctx, log, action, interactive })
      // Note: We don't store a result for this action type, since there's no clear underlying version to use.
      return { state: runResultToActionState(result), detail: result, outputs: { log: result.log } }
    },

    /**
     * We do not cache Test results of `kubernetes-exec` action type.
     */
    getResult: async ({}) => {
      return { state: "not-ready", detail: null, outputs: { log: "" } }
    },
  },
})

// helpers //

async function readAndExec({
  ctx,
  log,
  action,
  interactive,
}: {
  ctx: PluginContext
  log: Log
  action: Resolved<KubernetesExecRunAction | KubernetesExecTestAction>
  interactive: boolean
}): Promise<RunResult> {
  const { resource, command } = action.getSpec()
  const k8sCtx = <KubernetesPluginContext>ctx
  const provider = k8sCtx.provider
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
    target = await getTargetResource({
      ctx,
      log,
      provider,
      action,
      query: resource,
    })
  } catch (err) {
    if (!(err instanceof KubernetesError)) {
      throw err
    }
    if (err.responseStatusCode === 404) {
      throw new ConfigurationError({
        message: dedent`
            ${action.longDescription()} specifies target resource ${targetKind}/${targetName}, which could not be found in namespace ${namespace}.

            Hint: This action may be missing a dependency on a Deploy in this project that deploys the target resource. If so, adding that dependency will ensure that the Deploy is run before this action.`,
      })
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
    containerName: resource.containerName,
    command,
    interactive,
    streamLogs: true,
  })
  const completedAt = new Date()
  const execLog = res.output || ""

  return {
    success: res.code === 0,
    exitCode: res.code,
    startedAt,
    completedAt,
    log: execLog,
  }
}
