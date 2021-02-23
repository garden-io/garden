/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
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
import { containerHelpers } from "../../container/helpers"
import { makePodName } from "../util"
import { getAppNamespace } from "../namespace"
import { KubernetesPluginContext } from "../config"

export async function testContainerModule(params: TestModuleParams<ContainerModule>): Promise<TestResult> {
  const { ctx, module, test, log } = params
  const { command, args, artifacts, env, volumes } = test.config.spec
  const testName = test.name
  const timeout = test.config.timeout || DEFAULT_TEST_TIMEOUT
  const k8sCtx = ctx as KubernetesPluginContext

  const image = containerHelpers.getDeploymentImageId(module, module.version, ctx.provider.config.deploymentRegistry)
  const namespace = await getAppNamespace(k8sCtx, log, k8sCtx.provider)

  const result = await runAndCopy({
    ...params,
    command,
    args,
    artifacts,
    envVars: env,
    image,
    namespace,
    podName: makePodName("test", module.name, testName),
    description: `Test '${testName}' in container module '${module.name}'`,
    timeout,
    version: test.version,
    volumes,
  })

  return storeTestResult({
    ctx,
    log,
    module,
    test,
    result: {
      testName,
      ...result,
    },
  })
}
