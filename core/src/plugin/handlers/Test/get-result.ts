/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string.js"
import type { PluginTestActionParamsBase } from "../../base.js"
import { actionParamsSchema } from "../../base.js"
import type { TestAction } from "../../../actions/test.js"
import type { TestResult } from "../../../types/test.js"
import { testResultSchema } from "../../../types/test.js"
import { ActionTypeHandlerSpec } from "../base/base.js"
import { actionStatusSchema } from "../../../actions/base.js"
import type { ActionStatus, ActionStatusMap, Resolved } from "../../../actions/types.js"
import { createSchema } from "../../../config/common.js"

type GetTestResultParams<T extends TestAction> = PluginTestActionParamsBase<T>

export type GetTestResult<T extends TestAction = TestAction> = ActionStatus<T, TestResult>

export interface TestStatusMap extends ActionStatusMap<TestAction> {
  [key: string]: GetTestResult
}

export const getTestResultSchema = createSchema({
  name: "get-test-result",
  keys: () => ({
    detail: testResultSchema().allow(null),
  }),
  extend: actionStatusSchema,
})

export class GetTestActionResult<T extends TestAction = TestAction> extends ActionTypeHandlerSpec<
  "Test",
  GetTestResultParams<Resolved<T>>,
  GetTestResult<T>
> {
  description = dedent`
    Retrieve the test result for the specified version. Use this along with the \`testAction\` handler to avoid testing the same code repeatedly.
  `

  paramsSchema = () => actionParamsSchema()
  resultSchema = () => getTestResultSchema()
}
