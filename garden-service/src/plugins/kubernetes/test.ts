/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { TestResult, RunResult } from "../../types/plugin/outputs"
import { GetTestResultParams } from "../../types/plugin/params"
import { ContainerModule } from "../container/config"
import { deserializeValues, serializeValues } from "../../util/util"
import { KubeApi } from "./api"
import { Module } from "../../types/module"
import { ModuleVersion } from "../../vcs/base"
import { HelmModule } from "./helm/config"
import { PluginContext } from "../../plugin-context"
import { KubernetesPluginContext } from "./kubernetes"
import { systemMetadataNamespace } from "./system"

const testResultNamespace = systemMetadataNamespace

export async function getTestResult(
  { ctx, module, testName, testVersion }: GetTestResultParams<ContainerModule | HelmModule>,
): Promise<TestResult | null> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const api = new KubeApi(k8sCtx.provider.config.context)
  const resultKey = getTestResultKey(k8sCtx, module, testName, testVersion)

  try {
    const res = await api.core.readNamespacedConfigMap(resultKey, testResultNamespace)
    return <TestResult>deserializeValues(res.body.data)
  } catch (err) {
    if (err.code === 404) {
      return null
    } else {
      throw err
    }
  }
}

export function getTestResultKey(ctx: PluginContext, module: Module, testName: string, version: ModuleVersion) {
  return `test-result--${ctx.projectName}--${module.name}--${testName}--${version.versionString}`
}

/**
 * Store a test run result as a ConfigMap in the cluster.
 *
 * TODO: Implement a CRD for this.
 */
export async function storeTestResult(
  { ctx, module, testName, testVersion, result }:
    { ctx: PluginContext, module: Module, testName: string, testVersion: ModuleVersion, result: RunResult },
): Promise<TestResult> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const api = new KubeApi(k8sCtx.provider.config.context)

  const testResult: TestResult = {
    ...result,
    testName,
  }

  const resultKey = getTestResultKey(k8sCtx, module, testName, testVersion)
  const body = {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: {
      name: resultKey,
      annotations: {
        "garden.io/generated": "true",
      },
    },
    data: serializeValues(testResult),
  }

  try {
    await api.core.createNamespacedConfigMap(testResultNamespace, <any>body)
  } catch (err) {
    if (err.code === 409) {
      await api.core.patchNamespacedConfigMap(resultKey, testResultNamespace, body)
    } else {
      throw err
    }
  }

  return testResult
}
