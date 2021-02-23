/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { deserializeValues } from "../../util/util"
import { KubeApi } from "./api"
import { GardenModule } from "../../types/module"
import { ContainerModule } from "../container/config"
import { HelmModule } from "./helm/config"
import { KubernetesModule } from "./kubernetes-module/config"
import { PluginContext } from "../../plugin-context"
import { KubernetesPluginContext } from "./config"
import { LogEntry } from "../../logger/log-entry"
import { GetTestResultParams, TestResult } from "../../types/plugin/module/getTestResult"
import hasha from "hasha"
import { gardenAnnotationKey } from "../../util/string"
import { upsertConfigMap } from "./util"
import { trimRunOutput } from "./helm/common"
import { getSystemNamespace } from "./namespace"
import chalk from "chalk"
import { GardenTest } from "../../types/test"

export async function getTestResult({
  ctx,
  log,
  module,
  test,
}: GetTestResultParams<ContainerModule | HelmModule | KubernetesModule>): Promise<TestResult | null> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const api = await KubeApi.factory(log, ctx, k8sCtx.provider)
  const testResultNamespace = await getSystemNamespace(k8sCtx, k8sCtx.provider, log)

  const resultKey = getTestResultKey(k8sCtx, module, test)

  try {
    const res = await api.core.readNamespacedConfigMap(resultKey, testResultNamespace)
    const result: any = deserializeValues(res.data!)

    // Backwards compatibility for modified result schema
    if (!result.outputs) {
      result.outputs = {}
    }

    if (!result.outputs.log) {
      result.outputs.log = result.log || ""
    }

    if (result.version.versionString) {
      result.version = result.version.versionString
    }

    return <TestResult>result
  } catch (err) {
    if (err.statusCode === 404) {
      return null
    } else {
      throw err
    }
  }
}

export function getTestResultKey(ctx: PluginContext, module: GardenModule, test: GardenTest) {
  const key = `${ctx.projectName}--${module.name}--${test.name}--${test.version}`
  const hash = hasha(key, { algorithm: "sha1" })
  return `test-result--${hash.slice(0, 32)}`
}

interface StoreTestResultParams {
  ctx: PluginContext
  log: LogEntry
  module: GardenModule
  test: GardenTest
  result: TestResult
}

/**
 * Store a test run result as a ConfigMap in the cluster.
 *
 * TODO: Implement a CRD for this.
 */
export async function storeTestResult({ ctx, log, module, test, result }: StoreTestResultParams): Promise<TestResult> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const api = await KubeApi.factory(log, ctx, k8sCtx.provider)
  const testResultNamespace = await getSystemNamespace(k8sCtx, k8sCtx.provider, log)

  const data: TestResult = trimRunOutput(result)

  try {
    await upsertConfigMap({
      api,
      namespace: testResultNamespace,
      key: getTestResultKey(k8sCtx, module, test),
      labels: {
        [gardenAnnotationKey("module")]: module.name,
        [gardenAnnotationKey("test")]: test.name,
        [gardenAnnotationKey("moduleVersion")]: module.version.versionString,
        [gardenAnnotationKey("version")]: test.version,
      },
      data,
    })
  } catch (err) {
    log.warn(chalk.yellow(`Unable to store test result: ${err.message}`))
  }

  return data
}
