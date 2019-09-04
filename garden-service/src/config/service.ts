/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import deline = require("deline")
import { joiIdentifier, joiArray, joiUserIdentifier, joi, joiVariables } from "./common"

export interface ServiceSpec {}

/**
 * This interface provides a common set of Service attributes, that are also required for the higher-level
 * ServiceConfig. It is exported as a convenience for plugins.
 */
export interface CommonServiceSpec extends ServiceSpec {
  name: string
  dependencies: string[]
}

export const serviceOutputsSchema = joiVariables()

export const dependenciesSchema = joiArray(joiIdentifier()).description(deline`
    The names of any services that this service depends on at runtime, and the names of any
    tasks that should be executed before this service is deployed.
  `)

export const baseServiceSpecSchema = joi
  .object()
  .keys({
    name: joiUserIdentifier().required(),
    dependencies: dependenciesSchema,
  })
  .unknown(true)
  .meta({ extendable: true })
  .description("The required attributes of a service. This is generally further defined by plugins.")

export interface ServiceConfig<T extends ServiceSpec = ServiceSpec> extends CommonServiceSpec {
  hotReloadable: boolean
  sourceModuleName?: string

  // Plugins can add custom fields that are kept here
  spec: T
}

export const serviceConfigSchema = baseServiceSpecSchema
  .keys({
    hotReloadable: joi
      .boolean()
      .default(false)
      .description("Set this to true if the module and service configuration supports hot reloading."),
    sourceModuleName: joiIdentifier().optional().description(deline`
        The \`validate\` module action should populate this, if the service's code sources are contained in a
        separate module from the parent module. For example, when the service belongs to a module that contains
        manifests (e.g. a Helm chart), but the actual code lives in a different module (e.g. a container module).
      `),
    spec: joi
      .object()
      .meta({ extendable: true })
      .description("The service's specification, as defined by its provider plugin."),
  })
  .description("The configuration for a module's service.")
  .unknown(false)
