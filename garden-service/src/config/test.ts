/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joiArray, joiUserIdentifier, joi } from "./common"
import { deline, dedent } from "../util/string"

export interface BaseTestSpec {
  name: string
  dependencies: string[]
  disabled: boolean
  timeout: number | null
}

export const baseTestSpecSchema = joi.object().keys({
  name: joiUserIdentifier()
    .required()
    .description("The name of the test."),
  dependencies: joiArray(joi.string()).description(deline`
        The names of any services that must be running, and the names of any
        tasks that must be executed, before the test is run.
      `),
  disabled: joi
    .boolean()
    .default(false)
    .description(
      dedent`
        Set this to \`true\` to disable the test. You can use this with conditional template strings to
        enable/disable tests based on, for example, the current environment or other variables (e.g.
        \`enabled: \${environment.name != "prod"}\`). This is handy when you only want certain tests to run in
        specific environments, e.g. only during CI.
      `
    ),
  timeout: joi
    .number()
    .allow(null)
    .default(null)
    .description("Maximum duration (in seconds) of the test run."),
})

export interface TestConfig<T extends {} = {}> extends BaseTestSpec {
  // Plugins can add custom fields that are kept here
  spec: T
}

export const testConfigSchema = baseTestSpecSchema
  .keys({
    spec: joi
      .object()
      .meta({ extendable: true })
      .description("The configuration for the test, as specified by its module's provider."),
  })
  .description("Configuration for a module test.")
