/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent, deline } from "../../../util/string"
import { Module } from "../../module"
import { PluginModuleActionParamsBase, moduleActionParamsSchema, RunResult, runResultSchema } from "../base"
import { ModuleVersion, moduleVersionSchema } from "../../../vcs/vcs"
import { joi, joiPrimitive } from "../../../config/common"

export interface GetTestResultParams<T extends Module = Module> extends PluginModuleActionParamsBase<T> {
  testName: string
  testVersion: ModuleVersion
}

export interface TestResult extends RunResult {
  testName: string
}

export const testResultSchema = runResultSchema.keys({
  outputs: joi
    .object()
    .pattern(/.+/, joiPrimitive())
    .description("A map of primitive values, output from the test."),
  testName: joi
    .string()
    .required()
    .description("The name of the test that was run."),
  version: joi.string().description(deline`
        The test run's version, as a string. In addition to the parent module's version, this also
        factors in the module versions of the test's runtime dependencies (if any).`),
})

export const testVersionSchema = moduleVersionSchema.description(deline`
    The test run's version. In addition to the parent module's version, this also
    factors in the module versions of the test's runtime dependencies (if any).`)

export const getTestResult = {
  description: dedent`
    Retrieve the test result for the specified version. Use this along with the \`testModule\` handler
    to avoid testing the same code repeatedly.

    Note that the version string provided to this handler may be a hash of the module's version, as
    well as any runtime dependencies configured for the test, so it may not match the current version
    of the module itself.
  `,

  paramsSchema: moduleActionParamsSchema.keys({
    testName: joi.string().description("A unique name to identify the test run."),
    testVersion: testVersionSchema,
  }),

  resultSchema: testResultSchema.allow(null),
}
