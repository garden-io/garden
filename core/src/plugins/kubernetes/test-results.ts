/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { deserializeValues } from "../../util/serialization"
import { KubeApi, KubernetesError } from "./api"
import { ContainerTestAction } from "../container/moduleConfig"
import { PluginContext } from "../../plugin-context"
import { KubernetesPluginContext } from "./config"
import { Log } from "../../logger/log-entry"
import { TestResult } from "../../types/test"
import hasha from "hasha"
import { gardenAnnotationKey } from "../../util/string"
import { upsertConfigMap } from "./util"
import { trimRunOutput } from "./helm/common"
import { getSystemNamespace } from "./namespace"
import chalk from "chalk"
import { TestActionHandler } from "../../plugin/action-types"
import { runResultToActionState } from "../../actions/base"
import { HelmPodTestAction } from "./helm/config"
import { KubernetesTestAction } from "./kubernetes-type/config"
import { DEFAULT_GARDEN_CLOUD_DOMAIN } from "../../constants"

// TODO: figure out how to get rid of the any cast
export const k8sGetTestResult: TestActionHandler<"getResult", any> = async (params) => {
  const { ctx, log } = params
  const action = <ContainerTestAction>params.action
  const k8sCtx = <KubernetesPluginContext>ctx
  const api = await KubeApi.factory(log, ctx, k8sCtx.provider)

  // enterprise
  if (ctx.projectId && ctx.cloudApi && ctx.cloudApi?.domain !== DEFAULT_GARDEN_CLOUD_DOMAIN) {
    const keyString = `${ctx.projectId}_${action.name}_${action.kind}_${action.versionString()}`
    const res = await ctx.cloudApi.getCacheStatus(keyString)
    if (res.status === "error") {
      return { state: "not-ready", detail: null, outputs: {} }
    }
    return {
      state: "ready",
      detail: <TestResult>{
        success: true,
        completedAt: res.data.completedAt,
        startedAt: res.data.startedAt,
        log: res.data.log || "",
      },
      outputs: { log: res.data.log || "" },
    }
  }

  // free-tier
  const testResultNamespace = await getSystemNamespace(k8sCtx, k8sCtx.provider, log)

  const resultKey = getTestResultKey(k8sCtx, action)

  try {
    const res = await api.core.readNamespacedConfigMap(resultKey, testResultNamespace)
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
  const resultFormatVersion = 1
  const key = `${ctx.projectName}--${action.name}--${action.versionString()}--${resultFormatVersion}`
  const hash = hasha(key, { algorithm: "sha1" })
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
export async function storeTestResult({ ctx, log, action, result }: StoreTestResultParams): Promise<TestResult | null> {
  if (ctx.cloudApi && ctx.cloudApi?.domain !== DEFAULT_GARDEN_CLOUD_DOMAIN) {
    // no need to store results for enterprise
    // automatically stored from the events that are sent to cloud
    return null
  }

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
    log.warn(chalk.yellow(`Unable to store test result: ${err}`))
  }

  return data
}
