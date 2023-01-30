/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string"
import { PluginTestActionParamsBase, actionParamsSchema } from "../../base"
import { TestAction } from "../../../actions/test"
import { TestResult, testResultSchema } from "../../../types/test"
import { ActionTypeHandlerSpec } from "../base/base"
import { actionStatusSchema } from "../../../actions/base"
import { ActionStatus, ActionStatusMap, Resolved } from "../../../actions/types"
import { createSchema } from "../../../config/common"

interface GetTestResultParams<T extends TestAction> extends PluginTestActionParamsBase<T> {}

export type GetTestResult<T extends TestAction = TestAction> = ActionStatus<T, TestResult>

export interface TestStatusMap extends ActionStatusMap<TestAction> {
  [key: string]: GetTestResult
}

export const getTestResultSchema = createSchema({
  name: "get-test-result",
  keys: {
    detail: testResultSchema().allow(null),
  },
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
