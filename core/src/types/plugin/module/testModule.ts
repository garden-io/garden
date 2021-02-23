/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string"
import { GardenModule } from "../../module"
import { PluginModuleActionParamsBase, artifactsPathSchema } from "../base"
import { RuntimeContext } from "../../../runtime-context"
import { runModuleBaseSchema } from "./runModule"
import { testResultSchema } from "./getTestResult"
import { GardenTest, testSchema } from "../../test"

export interface TestModuleParams<T extends GardenModule = GardenModule> extends PluginModuleActionParamsBase<T> {
  artifactsPath: string
  interactive: boolean
  runtimeContext: RuntimeContext
  silent: boolean
  test: GardenTest<T>
}

export const testModule = () => ({
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
  paramsSchema: runModuleBaseSchema().keys({
    artifactsPath: artifactsPathSchema(),
    test: testSchema(),
  }),
  resultSchema: testResultSchema(),
})
