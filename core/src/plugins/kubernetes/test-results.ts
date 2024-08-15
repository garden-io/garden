/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { deserializeValues } from "../../util/serialization.js"
import { KubeApi, KubernetesError } from "./api.js"
import type { ContainerTestAction } from "../container/moduleConfig.js"
import type { PluginContext } from "../../plugin-context.js"
import type { KubernetesPluginContext } from "./config.js"
import type { Log } from "../../logger/log-entry.js"
import type { TestResult } from "../../types/test.js"
import { hashSync } from "hasha"
import { gardenAnnotationKey } from "../../util/string.js"
import { upsertConfigMap } from "./util.js"
import { trimRunOutput } from "./helm/common.js"
import { getSystemNamespace } from "./namespace.js"
import type { TestActionHandler } from "../../plugin/action-types.js"
import { runResultToActionState } from "../../actions/base.js"
import type { HelmPodTestAction } from "./helm/config.js"
import type { KubernetesTestAction } from "./kubernetes-type/config.js"
import { GardenError } from "../../exceptions.js"

// TODO: figure out how to get rid of the any cast
export const k8sGetTestResult: TestActionHandler<"getResult", any> = async (params) => {
  const { ctx, log } = params
  const action = <ContainerTestAction>params.action
  const k8sCtx = <KubernetesPluginContext>ctx
  const api = await KubeApi.factory(log, ctx, k8sCtx.provider)
  const testResultNamespace = await getSystemNamespace(k8sCtx, k8sCtx.provider, log)

  const resultKey = getTestResultKey(k8sCtx, action)

  try {
    const res = await api.core.readNamespacedConfigMap({ name: resultKey, namespace: testResultNamespace })
    const result: any = deserializeValues(res.data!)

    // Backwards compatibility for modified result schema
    if (result.version?.versionString) {
      result.version = result.version.versionString
    }

    return { state: runResultToActionState(result), detail: <TestResult>result, outputs: { log: result.log || "" } }
  } catch (err) {
    if (!(err instanceof KubernetesError)) {
      throw err
    }
    if (err.responseStatusCode === 404) {
      return { state: "not-ready", detail: null, outputs: {} }
    } else {
      throw err
    }
  }
}

export function getTestResultKey(ctx: PluginContext, action: StoreTestResultParams["action"]) {
  // change the result format version if the result format changes breaking backwards-compatibility e.g. serialization format
  const resultFormatVersion = 2
  const key = `${ctx.projectName}--${action.name}--${action.versionString()}--${resultFormatVersion}`
  const hash = hashSync(key, { algorithm: "sha1" })
  return `test-result--${hash.slice(0, 32)}`
}

interface StoreTestResultParams {
  ctx: PluginContext
  log: Log
  action: ContainerTestAction | KubernetesTestAction | HelmPodTestAction
  result: TestResult
}

/**
 * Store a test run result as a ConfigMap in the cluster.
 *
 * TODO: Implement a CRD for this.
 */
export async function storeTestResult({ ctx, log, action, result }: StoreTestResultParams): Promise<TestResult> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const api = await KubeApi.factory(log, ctx, k8sCtx.provider)
  const testResultNamespace = await getSystemNamespace(k8sCtx, k8sCtx.provider, log)

  const data = trimRunOutput(result)

  try {
    await upsertConfigMap({
      api,
      namespace: testResultNamespace,
      key: getTestResultKey(k8sCtx, action),
      labels: {
        [gardenAnnotationKey("action")]: action.key(),
        [gardenAnnotationKey("actionType")]: action.type,
        [gardenAnnotationKey("version")]: action.versionString(),
      },
      data,
    })
  } catch (err) {
    if (!(err instanceof GardenError)) {
      throw err
    }
    log.warn(`Unable to store test result: ${err}`)
  }

  return data
}
