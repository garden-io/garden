/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { KubernetesCommonRunSpec, KubernetesPluginContext, KubernetesTargetResourceSpec } from "../config.js"
import { kubernetesCommonRunSchemaKeys, runPodResourceSchema, runPodSpecSchema } from "../config.js"
import { k8sGetRunResult } from "../run-results.js"
import { getActionNamespaceStatus } from "../namespace.js"
import type { ActionKind, RunActionDefinition, TestActionDefinition } from "../../../plugin/action-types.js"
import { dedent } from "../../../util/string.js"
import type { RunAction, RunActionConfig } from "../../../actions/run.js"
import { createSchema } from "../../../config/common.js"
import type { V1PodSpec } from "@kubernetes/client-node"
import { runOrTestWithPod } from "./common.js"
import type { KubernetesRunOutputs, KubernetesTestOutputs } from "./config.js"
import {
  kubernetesManifestFilesSchema,
  kubernetesManifestsSchema,
  kubernetesManifestTemplatesSchema,
  kubernetesPatchResourcesSchema,
  kubernetesRunOutputsSchema,
  kubernetesTestOutputsSchema,
} from "./config.js"
import type { KubernetesPatchResource, KubernetesResource } from "../types.js"
import type { KubernetesKustomizeSpec } from "./kustomize.js"
import { kustomizeSpecSchema } from "./kustomize.js"
import type { ObjectSchema } from "@hapi/joi"
import type { TestAction, TestActionConfig } from "../../../actions/test.js"
import { k8sGetTestResult } from "../test-results.js"
import { composeCacheableResult, getResultCache, toActionStatus } from "../results-cache.js"

// RUN //

export interface KubernetesPodRunActionSpec extends KubernetesCommonRunSpec {
  /**
   * TODO(0.14): remove this field
   * @deprecated in action configs, use {@link #manifestTemplates} instead.
   */
  files: string[]
  manifestFiles: string[]
  manifestTemplates: string[]
  kustomize?: KubernetesKustomizeSpec
  manifests: KubernetesResource[]
  patchResources?: KubernetesPatchResource[]
  resource?: KubernetesTargetResourceSpec
  podSpec?: V1PodSpec
}

export type KubernetesPodRunActionConfig = RunActionConfig<"kubernetes-pod", KubernetesPodRunActionSpec>
export type KubernetesPodRunAction = RunAction<KubernetesPodRunActionConfig, KubernetesRunOutputs>

// Maintaining this cache to avoid errors when `kubernetesRunPodSchema` is called more than once with the same `kind`.
const runSchemas: { [name: string]: ObjectSchema } = {}

const kubernetesPodManifestTemplatesSchema = (kind: ActionKind) =>
  kubernetesManifestTemplatesSchema().description(
    dedent`
    POSIX-style paths to YAML files to load manifests from. Each file may contain multiple manifests.

    Garden will treat each manifestTemplate file as a template string expression, resolve it and then attempt to parse the resulting string as YAML.

    Then it will find the resource matching the Pod spec for the ${kind} ([See also \`spec.resource\`](#specresource)).
    `
  )

export const kubernetesRunPodSchema = (kind: ActionKind) => {
  const name = `${kind}:kubernetes-pod`
  if (runSchemas[name]) {
    return runSchemas[name]
  }
  const schema = createSchema({
    name,
    keys: () => ({
      ...kubernetesCommonRunSchemaKeys(kind),
      kustomize: kustomizeSpecSchema(),
      patchResources: kubernetesPatchResourcesSchema(),
      manifests: kubernetesManifestsSchema().description(
        `List of Kubernetes resource manifests to be searched (using \`resource\`e for the pod spec for the ${kind}. If \`files\` is also specified, this is combined with the manifests read from the files.`
      ),
      files: kubernetesPodManifestTemplatesSchema(kind).meta({ deprecated: true }),
      manifestFiles: kubernetesManifestFilesSchema(),
      manifestTemplates: kubernetesPodManifestTemplatesSchema(kind),
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

      const result = await runOrTestWithPod({ ...params, ctx: k8sCtx, namespace })

      const detail = composeCacheableResult({ result, namespaceStatus })

      if (action.getSpec("cacheResult")) {
        const runResultCache = getResultCache(ctx.gardenDirPath)
        await runResultCache.store({
          ctx,
          log,
          action,
          result: detail,
        })
      }

      return toActionStatus(detail)
    },

    getResult: k8sGetRunResult,
  },
})

// TEST //

type KubernetesPodTestActionSpec = KubernetesPodRunActionSpec
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

      const result = await runOrTestWithPod({ ...params, ctx: k8sCtx, namespace })

      const detail = composeCacheableResult({ result, namespaceStatus })

      if (action.getSpec("cacheResult")) {
        const testResultCache = getResultCache(ctx.gardenDirPath)
        await testResultCache.store({
          ctx,
          log,
          action,
          result: detail,
        })
      }

      return toActionStatus(detail)
    },

    getResult: k8sGetTestResult,
  },
})
