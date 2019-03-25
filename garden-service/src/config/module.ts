/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent = require("dedent")
import stableStringify = require("json-stable-stringify")
import * as Joi from "joi"
import { ServiceConfig, ServiceSpec } from "./service"
import {
  joiArray,
  joiIdentifier,
  joiRepositoryUrl,
  joiUserIdentifier,
  PrimitiveMap,
  joiIdentifierMap,
  joiPrimitive,
} from "./common"
import { TestConfig, TestSpec } from "./test"
import { TaskConfig, TaskSpec } from "./task"

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

export const moduleOutputsSchema = joiIdentifierMap(joiPrimitive())

export interface BuildDependencyConfig {
  name: string
  plugin?: string
  copy: BuildCopySpec[]
}

export const buildDependencySchema = Joi.object().keys({
  name: joiIdentifier().required()
    .description("Module name to build ahead of this module."),
  plugin: joiIdentifier()
    .meta({ internal: true })
    .description("The name of plugin that provides the build dependency."),
  copy: joiArray(copySchema)
    .description("Specify one or more files or directories to copy from the built dependency to this module."),
})

export interface BaseBuildSpec {
  dependencies: BuildDependencyConfig[],
}

export interface ModuleSpec { }

export interface BaseModuleSpec {
  apiVersion: string
  allowPublish: boolean
  build: BaseBuildSpec
  description?: string
  name: string
  path: string
  type: string
  repositoryUrl?: string
}

export const baseBuildSpecSchema = Joi.object()
  .keys({
    dependencies: joiArray(buildDependencySchema)
      .description("A list of modules that must be built before this module is built.")
      .example([
        [{ name: "some-other-module-name" }],
        {},
      ]),
  })
  .default(() => ({ dependencies: [] }), "{}")
  .description("Specify how to build the module. Note that plugins may define additional keys on this object.")

export const baseModuleSpecSchema = Joi.object()
  .keys({
    apiVersion: Joi.string()
      .default("garden.io/v0")
      .only("garden.io/v0")
      .description("The schema version of this module's config (currently not used)."),
    type: joiIdentifier()
      .required()
      .description("The type of this module.")
      .example("container"),
    name: joiUserIdentifier()
      .required()
      .description("The name of this module.")
      .example("my-sweet-module"),
    description: Joi.string(),
    repositoryUrl: joiRepositoryUrl()
      .description(
        dedent`${joiRepositoryUrl().describe().description}

        Garden will import the repository source code into this module, but read the module's
        config from the local garden.yml file.`,
      ),
    allowPublish: Joi.boolean()
      .default(true)
      .description("When false, disables pushing this module to remote registries."),
    build: baseBuildSpecSchema
      .unknown(true),
  })
  .required()
  .unknown(true)
  .description("Configure a module whose sources are located in this directory.")
  .meta({ extendable: true })

export interface ModuleConfig
  <
  M extends ModuleSpec = any,
  S extends ServiceSpec = any,
  T extends TestSpec = any,
  W extends TaskSpec = any,
  >
  extends BaseModuleSpec {

  plugin?: string   // used to identify modules that are bundled as part of a plugin

  outputs: PrimitiveMap
  serviceConfigs: ServiceConfig<S>[]
  testConfigs: TestConfig<T>[]
  taskConfigs: TaskConfig<W>[]

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

export function serializeConfig(moduleConfig: ModuleConfig) {
  return stableStringify(moduleConfig)
}
