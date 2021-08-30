/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DEFAULT_TEST_TIMEOUT } from "../../../constants"
import { storeTestResult } from "../test-results"
import { HelmModule } from "./config"
import { runAndCopy } from "../run"
import { getChartResources, getBaseModule } from "./common"
import { KubernetesPluginContext } from "../config"
import { TestModuleParams } from "../../../types/plugin/module/testModule"
import { TestResult } from "../../../types/plugin/module/getTestResult"
import {
  getServiceResourceSpec,
  getServiceResource,
  getResourceContainer,
  makePodName,
  getResourcePodSpec,
} from "../util"
import { getModuleNamespaceStatus } from "../namespace"

export async function testHelmModule(params: TestModuleParams<HelmModule>): Promise<TestResult> {
  const { ctx, log, module, test } = params
  const k8sCtx = <KubernetesPluginContext>ctx

  // Get the container spec to use for running
  const manifests = await getChartResources({
    ctx: k8sCtx,
    module,
    devMode: false,
    hotReload: false,
    log,
    version: test.version,
  })
  const baseModule = getBaseModule(module)
  const resourceSpec = test.config.spec.resource || getServiceResourceSpec(module, baseModule)
  const target = await getServiceResource({
    ctx: k8sCtx,
    log,
    provider: k8sCtx.provider,
    manifests,
    module,
    resourceSpec,
  })
  const container = getResourceContainer(target, resourceSpec.containerName)
  const namespaceStatus = await getModuleNamespaceStatus({
    ctx: k8sCtx,
    log,
    module,
    provider: k8sCtx.provider,
  })
  const namespace = namespaceStatus.namespaceName

  const testName = test.name
  const { command, args } = test.config.spec
  const image = container.image!
  const timeout = test.config.timeout || DEFAULT_TEST_TIMEOUT

  const result = await runAndCopy({
    ...params,
    container,
    podSpec: getResourcePodSpec(target),
    command,
    args,
    artifacts: test.config.spec.artifacts,
    envVars: test.config.spec.env,
    image,
    namespace,
    podName: makePodName("test", module.name, testName),
    description: `Test '${testName}' in container module '${module.name}'`,
    timeout,
    version: test.version,
  })

  return storeTestResult({
    ctx: k8sCtx,
    log,
    module,
    test,
    result: {
      testName,
      namespaceStatus,
      ...result,
    },
  })
}
