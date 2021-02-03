/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
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
  findServiceResource,
  getResourceContainer,
  makePodName,
  getResourcePodSpec,
} from "../util"
import { getModuleNamespace } from "../namespace"

export async function testHelmModule(params: TestModuleParams<HelmModule>): Promise<TestResult> {
  const { ctx, log, module, testConfig, testVersion } = params
  const k8sCtx = <KubernetesPluginContext>ctx

  // Get the container spec to use for running
  const manifests = await getChartResources(k8sCtx, module, false, log)
  const baseModule = getBaseModule(module)
  const resourceSpec = testConfig.spec.resource || getServiceResourceSpec(module, baseModule)
  const target = await findServiceResource({ ctx: k8sCtx, log, manifests, module, baseModule, resourceSpec })
  const container = getResourceContainer(target, resourceSpec.containerName)
  const namespace = await getModuleNamespace({
    ctx: k8sCtx,
    log,
    module,
    provider: k8sCtx.provider,
  })

  const testName = testConfig.name
  const { command, args } = testConfig.spec
  const image = container.image!
  const timeout = testConfig.timeout || DEFAULT_TEST_TIMEOUT

  const result = await runAndCopy({
    ...params,
    container,
    podSpec: getResourcePodSpec(target),
    command,
    args,
    artifacts: testConfig.spec.artifacts,
    envVars: testConfig.spec.env,
    image,
    namespace,
    podName: makePodName("test", module.name, testName),
    description: `Test '${testName}' in container module '${module.name}'`,
    timeout,
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
