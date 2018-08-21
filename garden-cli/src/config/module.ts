/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import { ServiceConfig, ServiceSpec } from "./service"
import {
  joiArray,
  joiIdentifier,
  joiVariables,
  PrimitiveMap,
  joiRepositoryUrl,
} from "./common"
import { TestConfig, TestSpec } from "./test"

export interface BuildCopySpec {
  source: string
  target: string
}

// TODO: allow : delimited string (e.g. some.file:some-dir/)
const copySchema = Joi.object()
  .keys({
    // TODO: allow array of strings here
    // TODO: disallow paths outside of the module root
    source: Joi.string().uri(<any>{ relativeOnly: true }).required()
      .description("POSIX-style path or filename of the directory or file(s) to copy to the target."),
    target: Joi.string().uri(<any>{ relativeOnly: true }).default("")
      .description(
        "POSIX-style path or filename to copy the directory or file(s) to (defaults to same as source path).",
      ),
  })

export interface BuildDependencyConfig {
  name: string
  plugin?: string
  copy: BuildCopySpec[]
}

export const buildDependencySchema = Joi.object().keys({
  name: joiIdentifier().required()
    .description("Module name to build ahead of this module"),
  plugin: joiIdentifier()
    .meta({ internal: true })
    .description("The name of plugin that provides the build dependency."),
  copy: joiArray(copySchema)
    .description("Specify one or more files or directories to copy from the built dependency to this module."),
})

export interface BuildConfig {
  command: string[],
  dependencies: BuildDependencyConfig[],
}

export interface ModuleSpec { }

export interface BaseModuleSpec {
  allowPush: boolean
  build: BuildConfig
  description?: string
  name: string
  path: string
  type: string
  variables: PrimitiveMap
  repositoryUrl?: string
}

export const baseModuleSpecSchema = Joi.object()
  .keys({
    type: joiIdentifier()
      .required()
      .description("The type of this module.")
      .example("container"),
    name: joiIdentifier()
      .required()
      .description("The name of this module.")
      .example("my-sweet-module"),
    description: Joi.string(),
    repositoryUrl: joiRepositoryUrl()
      .description(
        "A remote repository URL to fetch the module from. Garden will read the garden.yml config" +
        " from the local module." +
        " Currently only supports git servers.",
      ),
    variables: joiVariables()
      .description("Variables that this module can reference and expose as environment variables.")
      .example({ "my-variable": "some-value" }),
    allowPush: Joi.boolean()
      .default(true)
      .description("Set to false to disable pushing this module to remote registries."),
    build: Joi.object().keys({
      // TODO: move this out of base spec
      command: joiArray(Joi.string())
        .description("The command to run inside the module directory to perform the build.")
        .example(["npm", "run", "build"]),
      dependencies: joiArray(buildDependencySchema)
        .description("A list of modules that must be built before this module is built.")
        .example([{ name: "some-other-module-name" }]),
    })
      .default(() => ({ dependencies: [] }), "{}")
      .description("Specify how to build the module. Note that plugins may specify additional keys on this object."),
  })
  .required()
  .unknown(true)
  .description("Configure a module whose sources are located in this directory.")
  .meta({ extendable: true })

export interface ModuleConfig
  <M extends ModuleSpec = any, S extends ServiceSpec = any, T extends TestSpec = any>
  extends BaseModuleSpec {

  plugin?: string   // used to identify modules that are bundled as part of a plugin

  serviceConfigs: ServiceConfig<S>[]
  testConfigs: TestConfig<T>[]

  // Plugins can add custom fields that are kept here
  spec: M
}

export const moduleConfigSchema = baseModuleSpecSchema
  .keys({
    spec: Joi.object()
      .meta({ extendable: true })
      .description("The module spec, as defined by the provider plugin."),
  })
  .description("The configuration for a module.")
