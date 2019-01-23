/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { TestResult } from "../../../types/plugin/outputs"
import { TestModuleParams } from "../../../types/plugin/params"
import { DEFAULT_TEST_TIMEOUT } from "../../../constants"
import { storeTestResult } from "../test"
import { HelmModule } from "./config"
import { getAppNamespace } from "../namespace"
import { runPod } from "../run"
import { findServiceResource, getChartResources, getResourceContainer } from "./common"

export async function testHelmModule(
  { ctx, log, interactive, module, runtimeContext, testConfig }:
    TestModuleParams<HelmModule>,
): Promise<TestResult> {
  const testName = testConfig.name
  const args = testConfig.spec.args
  runtimeContext.envVars = { ...runtimeContext.envVars, ...testConfig.spec.env }
  const timeout = testConfig.timeout || DEFAULT_TEST_TIMEOUT

  const context = ctx.provider.config.context
  const namespace = await getAppNamespace(ctx, ctx.provider)

  const chartResources = await getChartResources(ctx, module, log)
  const resourceSpec = testConfig.spec.resource || module.spec.serviceResource
  const target = await findServiceResource({ ctx, log, chartResources, module, resourceSpec })
  const container = getResourceContainer(target, resourceSpec.containerName)
  const image = container.image

  const result = await runPod({
    context,
    namespace,
    module,
    envVars: runtimeContext.envVars,
    args,
    image,
    interactive,
    ignoreError: true,
    timeout,
  })

  return storeTestResult({ ctx, module, testName, result })
}
