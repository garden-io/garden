/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ContainerModule } from "../../container/config"
import { DEFAULT_TEST_TIMEOUT } from "../../../constants"
import { storeTestResult } from "../test-results"
import { TestModuleParams } from "../../../types/plugin/module/testModule"
import { TestResult } from "../../../types/plugin/module/getTestResult"
import { runAndCopy } from "../run"
import { makePodName } from "../util"
import { getAppNamespaceStatus } from "../namespace"
import { KubernetesPluginContext } from "../config"

export async function testContainerModule(params: TestModuleParams<ContainerModule>): Promise<TestResult> {
  const { ctx, module, test, log } = params
  const {
    command,
    args,
    artifacts,
    env,
    cpu,
    memory,
    volumes,
    privileged,
    addCapabilities,
    dropCapabilities,
  } = test.config.spec
  const testName = test.name
  const timeout = test.config.timeout || DEFAULT_TEST_TIMEOUT
  const k8sCtx = ctx as KubernetesPluginContext

  const image = module.outputs["deployment-image-id"]
  const namespaceStatus = await getAppNamespaceStatus(k8sCtx, log, k8sCtx.provider)

  const result = await runAndCopy({
    ...params,
    command,
    args,
    artifacts,
    envVars: env,
    resources: { cpu, memory },
    image,
    namespace: namespaceStatus.namespaceName,
    podName: makePodName("test", module.name, testName),
    description: `Test '${testName}' in container module '${module.name}'`,
    timeout,
    version: test.version,
    volumes,
    privileged,
    addCapabilities,
    dropCapabilities,
  })

  return storeTestResult({
    ctx,
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
