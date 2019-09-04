/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
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
import { uniqByName } from "../../../util/util"
import { prepareEnvVars } from "../util"
import { V1PodSpec } from "@kubernetes/client-node"
import { containerHelpers } from "../../container/helpers"
import { KubernetesProvider } from "../config"
import { runPod } from "../run"
import { getAppNamespace } from "../namespace"

export async function testContainerModule({
  ctx,
  interactive,
  module,
  runtimeContext,
  testConfig,
  testVersion,
  log,
}: TestModuleParams<ContainerModule>): Promise<TestResult> {
  const provider = ctx.provider as KubernetesProvider
  const { command, args } = testConfig.spec
  const testName = testConfig.name
  const timeout = testConfig.timeout || DEFAULT_TEST_TIMEOUT
  const namespace = await getAppNamespace(ctx, log, provider)

  // Apply overrides
  const image = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)
  const envVars = { ...runtimeContext.envVars, ...testConfig.spec.env }
  const env = uniqByName(prepareEnvVars(envVars))

  const spec: V1PodSpec = {
    containers: [
      {
        name: "main",
        image,
        ...(command && { command }),
        ...(args && { args }),
        env,
      },
    ],
  }

  const result = await runPod({
    provider,
    image,
    interactive,
    ignoreError: true, // to ensure results get stored when an error occurs
    log,
    module,
    namespace,
    spec,
    timeout,
  })

  return storeTestResult({
    ctx,
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
