/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ContainerModule } from "../../container/config"
import { DEFAULT_TEST_TIMEOUT } from "../../../constants"
import { runContainerModule } from "./run"
import { storeTestResult } from "../test"
import { TestModuleParams } from "../../../types/plugin/module/testModule"
import { TestResult } from "../../../types/plugin/module/getTestResult"

export async function testContainerModule(
  { ctx, interactive, module, runtimeContext, testConfig, testVersion, log }:
    TestModuleParams<ContainerModule>,
): Promise<TestResult> {
  const testName = testConfig.name
  const command = testConfig.spec.args
  runtimeContext.envVars = { ...runtimeContext.envVars, ...testConfig.spec.env }
  const timeout = testConfig.timeout || DEFAULT_TEST_TIMEOUT

  const result = await runContainerModule({
    ctx,
    module,
    command,
    interactive,
    ignoreError: true, // to ensure results get stored when an error occurs
    runtimeContext,
    timeout,
    log,
  })

  return storeTestResult({ ctx, log, module, testName, testVersion, result })
}
