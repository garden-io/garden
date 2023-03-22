/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent from "dedent"
import { runResultToActionState } from "../../../actions/base"
import { Resolved } from "../../../actions/types"
import { DEFAULT_RUN_TIMEOUT } from "../../../constants"
import { ConfigurationError } from "../../../exceptions"
import { Log } from "../../../logger/log-entry"
import { RunActionDefinition, TestActionDefinition } from "../../../plugin/action-types"
import { CommonRunParams } from "../../../plugin/handlers/Run/run"
import { KubernetesPluginContext } from "../config"
import { getActionNamespaceStatus } from "../namespace"
import { k8sGetRunResult, storeRunResult } from "../run-results"
import { getResourceContainer, getResourcePodSpec, getTargetResource, makePodName } from "../util"
import { HelmPodRunAction, helmPodRunSchema, HelmPodTestAction } from "./config"
import { runAndCopy } from "../run"
import { filterManifests, prepareManifests, prepareTemplates } from "./common"
import { storeTestResult } from "../test-results"
import { kubernetesRunOutputsSchema } from "../kubernetes-type/config"

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

      const res = await runOrTestWithChart({ ...params, ctx: k8sCtx, namespace })

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

      const res = await runOrTestWithChart({ ...params, ctx: k8sCtx, namespace })

      const detail = {
        ...res,
        namespaceStatus,
        taskName: action.name,
        outputs: {
          log: res.log || "",
        },
      }

      if (action.getSpec("cacheResult")) {
        await storeTestResult({
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
  const version = action.versionString()

  const resourceSpec = spec.resource

  if (!resourceSpec) {
    // Note: This will generally be caught in schema validation.
    throw new ConfigurationError(`${action.longDescription()} specified neither podSpec nor resource.`, { spec })
  }
  const k8sCtx = <KubernetesPluginContext>ctx
  const preparedTemplates = await prepareTemplates({
    ctx: k8sCtx,
    action,
    log,
  })
  let preparedManifests = await prepareManifests({
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

  const { timeout } = action.getConfig()

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
    timeout: timeout || DEFAULT_RUN_TIMEOUT,
    version,
  })
}
