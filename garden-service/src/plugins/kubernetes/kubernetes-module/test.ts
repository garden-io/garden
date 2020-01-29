/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { DEFAULT_TEST_TIMEOUT } from "../../../constants"
import { storeTestResult } from "../test-results"
import { KubernetesModule } from "./config"
import { runAndCopy } from "../run"
import { KubernetesPluginContext } from "../config"
import { TestModuleParams } from "../../../types/plugin/module/testModule"
import { TestResult } from "../../../types/plugin/module/getTestResult"
import { getModuleNamespace } from "../namespace"
import { KubeApi } from "../api"
import { getManifests } from "./common"
import { getServiceResourceSpec, findServiceResource, getResourceContainer, makePodName } from "../util"

export async function testKubernetesModule(params: TestModuleParams<KubernetesModule>): Promise<TestResult> {
  const { ctx, log, module, testConfig, testVersion } = params
  const k8sCtx = <KubernetesPluginContext>ctx
  const namespace = await getModuleNamespace({
    ctx: k8sCtx,
    log,
    module,
    provider: k8sCtx.provider,
  })
  const api = await KubeApi.factory(log, k8sCtx.provider)

  // Get the container spec to use for running
  const manifests = await getManifests(api, log, module, namespace)
  const resourceSpec = testConfig.spec.resource || getServiceResourceSpec(module, undefined)
  const target = await findServiceResource({ ctx: k8sCtx, log, manifests, module, resourceSpec, baseModule: undefined })
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
    namespace,
    podName: makePodName("test", module.name, testName),
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
