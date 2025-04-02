/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string.js"
import type { PluginTestActionParamsBase } from "../../../plugin/base.js"
import type { TestAction } from "../../../actions/test.js"
import { joi } from "../../../config/common.js"
import { ActionTypeHandlerSpec } from "../base/base.js"
import { runBaseParams } from "../../base.js"
import type { GetTestResult } from "./get-result.js"
import { getTestResultSchema } from "./get-result.js"
import type { CommonRunParams } from "../Run/run.js"
import type { Resolved } from "../../../actions/types.js"
import { actionParamsSchema } from "../../plugin.js"

type TestActionParams<T extends TestAction> = PluginTestActionParamsBase<T> &
  CommonRunParams & {
    silent: boolean
  }

export class RunTestAction<T extends TestAction = TestAction> extends ActionTypeHandlerSpec<
  "Test",
  TestActionParams<Resolved<T>>,
  GetTestResult<T>
> {
  description = dedent`
    Run the Test action.

    This should complete the test run and return the logs from the test run, and signal whether the tests completed successfully.

    It should also store the test results and provide the accompanying \`getTestResult\` handler, so that the same version does not need to be tested multiple times.
  `

  paramsSchema = () =>
    actionParamsSchema().keys({
      ...runBaseParams(),
      silent: joi.boolean().description("Set to true if no log output should be emitted during execution"),
    })
  resultSchema = () => getTestResultSchema()
}
