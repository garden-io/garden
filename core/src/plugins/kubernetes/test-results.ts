/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { deserializeValues } from "../../util/util"
import { KubeApi } from "./api"
import { ContainerTestAction } from "../container/moduleConfig"
import { PluginContext } from "../../plugin-context"
import { KubernetesPluginContext } from "./config"
import { LogEntry } from "../../logger/log-entry"
import { TestResult } from "../../types/test"
import hasha from "hasha"
import { gardenAnnotationKey } from "../../util/string"
import { upsertConfigMap } from "./util"
import { trimRunOutput } from "./helm/common"
import { getSystemNamespace } from "./namespace"
import chalk from "chalk"
import { TestActionHandler } from "../../plugin/action-types"
import { KubernetesTestAction } from "./kubernetes-type/test"

// TODO-G2: figure out how to get rid of the any case
export const k8sGetTestResult: TestActionHandler<"getResult", any> = async (params) => {
  const { ctx, log } = params
  const action = <ContainerTestAction>params.action
  const k8sCtx = <KubernetesPluginContext>ctx
  const api = await KubeApi.factory(log, ctx, k8sCtx.provider)
  const testResultNamespace = await getSystemNamespace(k8sCtx, k8sCtx.provider, log)

  const resultKey = getTestResultKey(k8sCtx, action)

  try {
    const res = await api.core.readNamespacedConfigMap(resultKey, testResultNamespace)
    const result: any = deserializeValues(res.data!)

    // Backwards compatibility for modified result schema
    if (result.version.versionString) {
      result.version = result.version.versionString
    }

    return { result: <TestResult>result, outputs: { log: result.log || "" } }
  } catch (err) {
    if (err.statusCode === 404) {
      return { result: null, outputs: null }
    } else {
      throw err
    }
  }
}

export function getTestResultKey(ctx: PluginContext, action: ContainerTestAction | KubernetesTestAction) {
  const key = `${ctx.projectName}--${action.name}--${action.getVersionString()}`
  const hash = hasha(key, { algorithm: "sha1" })
  return `test-result--${hash.slice(0, 32)}`
}

interface StoreTestResultParams {
  ctx: PluginContext
  log: LogEntry
  action: ContainerTestAction | KubernetesTestAction
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
        [gardenAnnotationKey("module")]: action.getModuleName(),
        [gardenAnnotationKey("test")]: test.name,
        [gardenAnnotationKey("version")]: action.getVersionString(),
      },
      data,
    })
  } catch (err) {
    log.warn(chalk.yellow(`Unable to store test result: ${err.message}`))
  }

  return data
}
