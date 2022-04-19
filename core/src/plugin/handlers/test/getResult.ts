/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent, deline } from "../../../util/string"
import { PluginTestActionParamsBase, actionParamsSchema } from "../../../plugin/base"
import { moduleVersionSchema } from "../../../config/common"
import { TestActionSpec } from "../../../actions/test"
import { testResultSchema } from "../../../types/test"

export interface GetTestResultParams<T extends TestActionSpec = TestActionSpec> extends PluginTestActionParamsBase<T> {}

export const testVersionSchema = () =>
  moduleVersionSchema().description(deline`
    The test run's version. In addition to the parent module's version, this also
    factors in the module versions of the test's runtime dependencies (if any).`)

export const getTestResult = () => ({
  description: dedent`
    Retrieve the test result for the specified version. Use this along with the \`testModule\` handler
    to avoid testing the same code repeatedly.

    Note that the version string provided to this handler may be a hash of the module's version, as
    well as any runtime dependencies configured for the test, so it may not match the current version
    of the module itself.
  `,

  paramsSchema: actionParamsSchema(),

  resultSchema: testResultSchema().allow(null),
})
