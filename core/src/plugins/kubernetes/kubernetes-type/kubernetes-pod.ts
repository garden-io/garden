/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
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
  runPodResourceSchema,
  runPodSpecSchema,
} from "../config"
import { k8sGetRunResult, storeRunResult } from "../run-results"
import { getActionNamespaceStatus } from "../namespace"
import type { RunActionDefinition, TestActionDefinition } from "../../../plugin/action-types"
import { dedent } from "../../../util/string"
import type { RunAction, RunActionConfig } from "../../../actions/run"
import { createSchema } from "../../../config/common"
import type { V1PodSpec } from "@kubernetes/client-node"
import { runOrTestWithPod } from "./common"
import { runResultToActionState } from "../../../actions/base"
import {
  kubernetesFilesSchema,
  kubernetesManifestsSchema,
  KubernetesRunOutputs,
  kubernetesRunOutputsSchema,
  KubernetesTestOutputs,
  kubernetesTestOutputsSchema,
} from "./config"
import { KubernetesResource } from "../types"
import { KubernetesKustomizeSpec } from "./kustomize"
import { ObjectSchema } from "@hapi/joi"
import { TestActionConfig, TestAction } from "../../../actions/test"
import { storeTestResult, k8sGetTestResult } from "../test-results"

// RUN //

export interface KubernetesPodRunActionSpec extends KubernetesCommonRunSpec {
  files: string[]
  kustomize?: KubernetesKustomizeSpec
  manifests: KubernetesResource[]
  resource?: KubernetesTargetResourceSpec
  podSpec?: V1PodSpec
}
export type KubernetesPodRunActionConfig = RunActionConfig<"kubernetes-pod", KubernetesPodRunActionSpec>
export type KubernetesPodRunAction = RunAction<KubernetesPodRunActionConfig, KubernetesRunOutputs>

// Maintaining this cache to avoid errors when `kubernetesRunPodSchema` is called more than once with the same `kind`.
const runSchemas: { [name: string]: ObjectSchema } = {}

export const kubernetesRunPodSchema = (kind: string) => {
  const name = `${kind}:kubernetes-pod`
  if (runSchemas[name]) {
    return runSchemas[name]
  }
  const schema = createSchema({
    name,
    keys: () => ({
      ...kubernetesCommonRunSchemaKeys(),
      manifests: kubernetesManifestsSchema().description(
        `List of Kubernetes resource manifests to be searched (using \`resource\`e for the pod spec for the ${kind}. If \`files\` is also specified, this is combined with the manifests read from the files.`
      ),
      files: kubernetesFilesSchema().description(
        `POSIX-style paths to YAML files to load manifests from. Each can contain multiple manifests, and can include any Garden template strings, which will be resolved before searching the manifests for the resource that contains the Pod spec for the ${kind}.`
      ),
      resource: runPodResourceSchema(kind),
      podSpec: runPodSpecSchema(kind),
    }),
    xor: [["resource", "podSpec"]],
  })()
  runSchemas[name] = schema
  return schema
}

export const kubernetesPodRunDefinition = (): RunActionDefinition<KubernetesPodRunAction> => ({
  name: "kubernetes-pod",
  docs: dedent`
    Executes a Run in an ad-hoc instance of a Kubernetes Pod and waits for it to complete.

    The pod spec can be provided directly via the \`podSpec\` field, or the \`resource\` field can be used to find the pod spec in the Kubernetes manifests provided via the \`files\` and/or \`manifests\` fields.
  `,
  schema: kubernetesRunPodSchema("Run"),
  runtimeOutputsSchema: kubernetesRunOutputsSchema(),
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

      const res = await runOrTestWithPod({ ...params, ctx: k8sCtx, namespace })

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

// TEST //

interface KubernetesPodTestActionSpec extends KubernetesPodRunActionSpec {}
export type KubernetesPodTestActionConfig = TestActionConfig<"kubernetes-pod", KubernetesPodTestActionSpec>
export type KubernetesPodTestAction = TestAction<KubernetesPodTestActionConfig, KubernetesTestOutputs>

export const kubernetesPodTestDefinition = (): TestActionDefinition<KubernetesPodTestAction> => ({
  name: "kubernetes-pod",
  docs: dedent`
    Executes a Test in an ad-hoc instance of a Kubernetes Pod and waits for it to complete.

    The pod spec can be provided directly via the \`podSpec\` field, or the \`resource\` field can be used to find the pod spec in the Kubernetes manifests provided via the \`files\` and/or \`manifests\` fields.
  `,
  schema: kubernetesRunPodSchema("Test"),
  runtimeOutputsSchema: kubernetesTestOutputsSchema(),
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

      const res = await runOrTestWithPod({ ...params, ctx: k8sCtx, namespace })

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
