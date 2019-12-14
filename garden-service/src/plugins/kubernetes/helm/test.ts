/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DEFAULT_TEST_TIMEOUT } from "../../../constants"
import { storeTestResult } from "../test-results"
import { HelmModule } from "./config"
import { runAndCopy } from "../run"
import { findServiceResource, getChartResources, getResourceContainer, getServiceResourceSpec } from "./common"
import { KubernetesPluginContext } from "../config"
import { TestModuleParams } from "../../../types/plugin/module/testModule"
import { TestResult } from "../../../types/plugin/module/getTestResult"

export async function testHelmModule(params: TestModuleParams<HelmModule>): Promise<TestResult> {
  const { ctx, log, module, testConfig, testVersion } = params
  const k8sCtx = <KubernetesPluginContext>ctx

  // Get the container spec to use for running
  const chartResources = await getChartResources(k8sCtx, module, false, log)
  const resourceSpec = testConfig.spec.resource || getServiceResourceSpec(module)
  const target = await findServiceResource({ ctx: k8sCtx, log, chartResources, module, resourceSpec })
  const container = getResourceContainer(target, resourceSpec.containerName)

  const testName = testConfig.name
  const { command, args } = testConfig.spec
  const image = container.image
  const timeout = testConfig.timeout || DEFAULT_TEST_TIMEOUT

  const result = await runAndCopy({
    ...params,
    container,
    command,
    args,
    artifacts: testConfig.spec.artifacts,
    envVars: testConfig.spec.env,
    image,
    podName: `test-${module.name}-${testName}-${Math.round(new Date().getTime())}`,
    description: `Test '${testName}' in container module '${module.name}'`,
    timeout,
    ignoreError: true, // to ensure results get stored when an error occurs
  })

  return storeTestResult({
    ctx: k8sCtx,
    log,
    module,
    testName,
    testVersion,
    result: {
      testName,
      ...result,
    },
  })
}
