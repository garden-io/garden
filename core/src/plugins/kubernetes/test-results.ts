/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { KubeApi } from "./api"
import { ContainerTestAction } from "../container/moduleConfig"
import { PluginContext } from "../../plugin-context"
import { KubernetesPluginContext } from "./config"
import { Log } from "../../logger/log-entry"
import { TestResult } from "../../types/test"
import hasha from "hasha"
import { trimRunOutput } from "./helm/common"
import { getSystemNamespace } from "./namespace"
import { TestActionHandler } from "../../plugin/action-types"
import { runResultToActionState } from "../../actions/base"
import { HelmPodTestAction } from "./helm/config"
import { KubernetesTestAction } from "./kubernetes-type/config"

// TODO: figure out how to get rid of the any cast
export const k8sGetTestResult: TestActionHandler<"getResult", any> = async (params) => {
  const { ctx, log } = params
  const action = <ContainerTestAction>params.action
  const k8sCtx = <KubernetesPluginContext>ctx
  const api = await KubeApi.factory(log, ctx, k8sCtx.provider)
  const testResultNamespace = await getSystemNamespace(k8sCtx, k8sCtx.provider, log)

  const resultKey = getTestResultKey(k8sCtx, action)

  // try {
    // const res = await api.core.readNamespacedConfigMap(resultKey, testResultNamespace)
    // const result: any = deserializeValues(res.data!)
    interface ResultData {
      status: "success" | "error"
      data?: TestResult
    }

    const res = await ctx.cloudApi?.get<ResultData>(`cache/test-results/${resultKey}`)
    const result = res?.data

    if (result && result.startedAt) {
      return { state: runResultToActionState(result), detail: <TestResult>result, outputs: { log: result.log || "" } }
    } else {
      return { state: "not-ready", detail: null, outputs: {} }
    }

    // // Backwards compatibility for modified result schema
    // if (result.version?.versionString) {
    //   result.version = result.version.versionString
    // }

    // return { state: runResultToActionState(result), detail: <TestResult>result, outputs: { log: result.log || "" } }
  // } catch (err) {
  //   if (err.statusCode === 404) {
  //     return { state: "not-ready", detail: null, outputs: {} }
  //   } else {
  //     throw err
  //   }
  // }
}

export function getTestResultKey(ctx: PluginContext, action: StoreTestResultParams["action"]) {
  const key = `${ctx.projectName}--${action.name}--${action.versionString()}`
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
export async function storeTestResult({ ctx, log, action, result }: StoreTestResultParams): Promise<TestResult> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const api = await KubeApi.factory(log, ctx, k8sCtx.provider)
  const testResultNamespace = await getSystemNamespace(k8sCtx, k8sCtx.provider, log)

  const data = trimRunOutput(result)

  const body = {
    key: getTestResultKey(k8sCtx, action),
    command: ctx.command.name,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    exitCode: result.exitCode,
    namespaceStatus: result.namespaceStatus,
    success: result.success
  }

  await ctx.cloudApi?.post("cache/test-results", {body})

  // try {
  //   await upsertConfigMap({
  //     api,
  //     namespace: testResultNamespace,
  //     key: getTestResultKey(k8sCtx, action),
  //     labels: {
  //       [gardenAnnotationKey("action")]: action.key(),
  //       [gardenAnnotationKey("actionType")]: action.type,
  //       [gardenAnnotationKey("version")]: action.versionString(),
  //     },
  //     data,
  //   })
  // } catch (err) {
  //   log.warn(chalk.yellow(`Unable to store test result: ${err}`))
  // }

  return data
}
