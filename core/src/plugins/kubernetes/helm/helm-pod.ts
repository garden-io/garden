/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent from "dedent"
import type { Resolved } from "../../../actions/types.js"
import { ConfigurationError } from "../../../exceptions.js"
import type { Log } from "../../../logger/log-entry.js"
import type { RunActionDefinition, TestActionDefinition } from "../../../plugin/action-types.js"
import type { CommonRunParams } from "../../../plugin/handlers/Run/run.js"
import type { KubernetesPluginContext } from "../config.js"
import { getActionNamespaceStatus } from "../namespace.js"
import { k8sGetRunResult, runResultCache } from "../run-results.js"
import { getResourceContainer, getResourcePodSpec, getTargetResource, makePodName } from "../util.js"
import type { HelmPodRunAction, HelmPodTestAction } from "./config.js"
import { helmPodRunSchema } from "./config.js"
import { runAndCopy } from "../run.js"
import { filterManifests, prepareManifests, prepareTemplates } from "./common.js"
import { testResultCache } from "../test-results.js"
import { kubernetesRunOutputsSchema } from "../kubernetes-type/config.js"
import { composeCacheableResult, toActionStatus } from "../results-cache.js"

const helmRunPodOutputsSchema = kubernetesRunOutputsSchema
const helmTestPodOutputsSchema = helmRunPodOutputsSchema

export const helmPodRunDefinition = (): RunActionDefinition<HelmPodRunAction> => ({
  name: "helm-pod",
  docs: dedent`
    Executes a Run in an ad-hoc instance of a Kubernetes Pod from a Helm chart and waits for it to complete.

    The \`resource\` field is used to find the Pod spec in the Kubernetes manifests generated by rendering the Helm chart.
  `,
  schema: helmPodRunSchema("Run"),
  runtimeOutputsSchema: helmRunPodOutputsSchema(),
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

      const result = await runOrTestWithChart({ ...params, ctx: k8sCtx, namespace })

      const detail = composeCacheableResult({ result, action, namespaceStatus })

      if (action.getSpec("cacheResult")) {
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

export const helmPodTestDefinition = (): TestActionDefinition<HelmPodTestAction> => ({
  name: "helm-pod",
  docs: dedent`
    Executes a Test in an ad-hoc instance of a Kubernetes Pod from a Helm chart and waits for it to complete.

    The \`resource\` field is used to find the Pod spec in the Kubernetes manifests generated by rendering the Helm chart.
  `,
  schema: helmPodRunSchema("Test"),
  runtimeOutputsSchema: helmTestPodOutputsSchema(),
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

      const result = await runOrTestWithChart({ ...params, ctx: k8sCtx, namespace })

      const detail = composeCacheableResult({ result, action, namespaceStatus })

      if (action.getSpec("cacheResult")) {
        await testResultCache.store({
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

export async function runOrTestWithChart(
  params: CommonRunParams & {
    ctx: KubernetesPluginContext
    action: Resolved<HelmPodRunAction | HelmPodTestAction>
    log: Log
    namespace: string
  }
) {
  const { ctx, action, log, namespace } = params
  // Get the container spec to use for running
  const spec = action.getSpec()

  const resourceSpec = spec.resource

  if (!resourceSpec) {
    // Note: This will generally be caught in schema validation.
    throw new ConfigurationError({
      message: `${action.longDescription()} specified neither podSpec nor resource.`,
    })
  }
  const k8sCtx = <KubernetesPluginContext>ctx
  const preparedTemplates = await prepareTemplates({
    ctx: k8sCtx,
    action,
    log,
  })
  const preparedManifests = await prepareManifests({
    ctx: k8sCtx,
    log,
    action,
    ...preparedTemplates,
  })
  const manifests = await filterManifests(preparedManifests)
  const target = await getTargetResource({
    ctx,
    log,
    provider: k8sCtx.provider,
    action,
    manifests,
    query: resourceSpec,
  })
  const podSpec = getResourcePodSpec(target)
  const container = getResourceContainer(target, resourceSpec.containerName)

  return runAndCopy({
    ...params,
    container,
    podSpec,
    command: spec.command,
    args: spec.args,
    artifacts: spec.artifacts,
    envVars: spec.env,
    image: container.image!,
    namespace,
    podName: makePodName(action.kind.toLowerCase(), action.name),
    timeout: action.getConfig().timeout,
  })
}
