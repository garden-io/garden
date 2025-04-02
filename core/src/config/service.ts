/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joiIdentifier, joiUserIdentifier, joi, joiVariables, joiSparseArray, createSchema } from "./common.js"
import { deline, dedent } from "../util/string.js"
import { memoize } from "lodash-es"
import { DEFAULT_DEPLOY_TIMEOUT_SEC } from "../constants.js"

/**
 * This interface provides a common set of Service attributes, that are also required for the higher-level
 * ServiceConfig. It is exported as a convenience for plugins.
 */
export interface CommonServiceSpec {
  name: string
  dependencies: string[]
  disabled: boolean
}

export const serviceOutputsSchema = joiVariables()

export const dependenciesSchema = memoize(() =>
  joiSparseArray(joiIdentifier()).description(deline`
    The names of any services that this service depends on at runtime, and the names of any
    tasks that should be executed before this service is deployed.
  `)
)

export const baseServiceSpecSchema = createSchema({
  name: "base-service-spec",
  description: "The required attributes of a service. This is generally further defined by plugins.",
  keys: () => ({
    name: joiUserIdentifier().required(),
    dependencies: dependenciesSchema(),
    disabled: joi
      .boolean()
      .default(false)
      .description(
        dedent`
        Set this to \`true\` to disable the service. You can use this with conditional template strings to enable/disable services based on, for example, the current environment or other variables (e.g. \`enabled: \${environment.name != "prod"}\`). This can be handy when you only need certain services for specific environments, e.g. only for development.

        Disabling a service means that it will not be deployed, and will also be ignored if it is declared as a runtime dependency for another service, test or task.

        Note however that template strings referencing the service's outputs (i.e. runtime outputs) will fail to resolve when the service is disabled, so you need to make sure to provide alternate values for those if you're using them, using conditional expressions.
      `
      ),
    timeout: joi
      .number()
      .integer()
      .min(1)
      .default(DEFAULT_DEPLOY_TIMEOUT_SEC)
      .description("Maximum duration (in seconds) of the service's deployment execution.")
      .meta({ internal: true }),
  }),
  allowUnknown: true,
  meta: { extendable: true },
})

export interface ServiceConfig<T extends {} = {}> extends CommonServiceSpec {
  sourceModuleName?: string

  // Plugins can add custom fields that are kept here
  spec: T
}

export const serviceConfigSchema = createSchema({
  name: "service-config",
  description: "The configuration for a module's service.",
  extend: baseServiceSpecSchema,
  keys: () => ({
    sourceModuleName: joiIdentifier().optional().description(deline`
      The \`validate\` module action should populate this, if the service's code sources are contained in a separate module from the parent module. For example, when the service belongs to a module that contains manifests (e.g. a Helm chart), but the actual code lives in a different module (e.g. a container module).
    `),
    spec: joi
      .object()
      .meta({ extendable: true })
      .description("The service's specification, as defined by its provider plugin."),
  }),
  allowUnknown: true,
})
