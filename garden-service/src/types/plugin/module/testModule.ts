/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string"
import { Module } from "../../module"
import { PluginModuleActionParamsBase } from "../base"
import { RuntimeContext } from "../../../runtime-context"
import { ModuleVersion } from "../../../vcs/vcs"
import { testConfigSchema } from "../../../config/test"
import { runModuleBaseSchema } from "./runModule"
import { testResultSchema, testVersionSchema } from "./getTestResult"

export interface TestModuleParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
  interactive: boolean
  runtimeContext: RuntimeContext
  silent: boolean
  testConfig: T["testConfigs"][0]
  testVersion: ModuleVersion
}

export const testModule = {
  description: dedent`
    Run the specified test for a module.

    This should complete the test run and return the logs from the test run, and signal whether the
    tests completed successfully.

    It should also store the test results and provide the accompanying \`getTestResult\` handler,
    so that the same version does not need to be tested multiple times.

    Note that the version string provided to this handler may be a hash of the module's version, as
    well as any runtime dependencies configured for the test, so it may not match the current version
    of the module itself.
  `,
  paramsSchema: runModuleBaseSchema.keys({
    testConfig: testConfigSchema,
    testVersion: testVersionSchema,
  }),
  resultSchema: testResultSchema,
}
