/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { deserializeValues } from "../../util/util"
import { KubeApi } from "./api"
import { Module } from "../../types/module"
import { ModuleVersion } from "../../vcs/vcs"
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

export async function getTestResult({
  ctx,
  log,
  module,
  testName,
  testVersion,
}: GetTestResultParams<ContainerModule | HelmModule | KubernetesModule>): Promise<TestResult | null> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const api = await KubeApi.factory(log, k8sCtx.provider)
  const testResultNamespace = await getSystemNamespace(k8sCtx.provider, log)

  const resultKey = getTestResultKey(k8sCtx, module, testName, testVersion)

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
    if (err.code === 404) {
      return null
    } else {
      throw err
    }
  }
}

export function getTestResultKey(ctx: PluginContext, module: Module, testName: string, version: ModuleVersion) {
  const key = `${ctx.projectName}--${module.name}--${testName}--${version.versionString}`
  const hash = hasha(key, { algorithm: "sha1" })
  return `test-result--${hash.slice(0, 32)}`
}

interface StoreTestResultParams {
  ctx: PluginContext
  log: LogEntry
  module: Module
  testName: string
  testVersion: ModuleVersion
  result: TestResult
}

/**
 * Store a test run result as a ConfigMap in the cluster.
 *
 * TODO: Implement a CRD for this.
 */
export async function storeTestResult({
  ctx,
  log,
  module,
  testName,
  testVersion,
  result,
}: StoreTestResultParams): Promise<TestResult> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const api = await KubeApi.factory(log, k8sCtx.provider)
  const testResultNamespace = await getSystemNamespace(k8sCtx.provider, log)

  const data: TestResult = trimRunOutput(result)

  try {
    await upsertConfigMap({
      api,
      namespace: testResultNamespace,
      key: getTestResultKey(k8sCtx, module, testName, testVersion),
      labels: {
        [gardenAnnotationKey("module")]: module.name,
        [gardenAnnotationKey("test")]: testName,
        [gardenAnnotationKey("moduleVersion")]: module.version.versionString,
        [gardenAnnotationKey("version")]: testVersion.versionString,
      },
      data,
    })
  } catch (err) {
    log.warn(chalk.yellow(`Unable to store test result: ${err.message}`))
  }

  return data
}
