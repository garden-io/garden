/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../../util/string"
import { PluginTestActionParamsBase, actionParamsSchema } from "../../../plugin/base"
import { TestActionConfig } from "../../../actions/test"
import { testResultSchema } from "../../../types/test"

export interface GetTestResultParams<T extends TestActionConfig = TestActionConfig> extends PluginTestActionParamsBase<T> {}

export const getTestResult = () => ({
  description: dedent`
    Retrieve the test result for the specified version. Use this along with the \`testAction\` handler to avoid testing the same code repeatedly.
  `,

  paramsSchema: actionParamsSchema(),

  resultSchema: testResultSchema().allow(null),
})
