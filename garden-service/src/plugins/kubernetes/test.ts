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
import { getMetadataNamespace } from "./namespace"
import { Module } from "../../types/module"
import { ModuleVersion } from "../../vcs/base"
import { HelmModule } from "./helm/config"
import { PluginContext } from "../../plugin-context"
import { KubernetesPluginContext } from "./kubernetes"

export async function getTestResult(
  { ctx, module, testName, testVersion }: GetTestResultParams<ContainerModule | HelmModule>,
): Promise<TestResult | null> {
  const k8sCtx = <KubernetesPluginContext>ctx
  const api = new KubeApi(k8sCtx.provider.config.context)
  const ns = await getMetadataNamespace(k8sCtx, k8sCtx.provider)
  const resultKey = getTestResultKey(module, testName, testVersion)

  try {
    const res = await api.core.readNamespacedConfigMap(resultKey, ns)
    return <TestResult>deserializeValues(res.body.data)
  } catch (err) {
    if (err.code === 404) {
      return null
    } else {
      throw err
    }
  }
}

export function getTestResultKey(module: Module, testName: string, version: ModuleVersion) {
  return `test-result--${module.name}--${testName}--${version.versionString}`
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

  const ns = await getMetadataNamespace(k8sCtx, k8sCtx.provider)
  const resultKey = getTestResultKey(module, testName, testVersion)
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
    await api.core.createNamespacedConfigMap(ns, <any>body)
  } catch (err) {
    if (err.code === 409) {
      await api.core.patchNamespacedConfigMap(resultKey, ns, body)
    } else {
      throw err
    }
  }

  return testResult
}
