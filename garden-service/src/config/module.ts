/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent = require("dedent")
import stableStringify = require("json-stable-stringify")
import { ServiceConfig, ServiceSpec, serviceConfigSchema } from "./service"
import {
  joiArray,
  joiIdentifier,
  joiRepositoryUrl,
  joiUserIdentifier,
  PrimitiveMap,
  joiIdentifierMap,
  joiPrimitive,
  joi,
  includeGuideLink,
} from "./common"
import { TestConfig, TestSpec, testConfigSchema } from "./test"
import { TaskConfig, TaskSpec, taskConfigSchema } from "./task"
import { DEFAULT_API_VERSION } from "../constants"
import { joiVariables } from "./common"

export interface BuildCopySpec {
  source: string
  target: string
}

// TODO: allow : delimited string (e.g. some.file:some-dir/)
const copySchema = joi.object().keys({
  // TODO: allow array of strings here
  source: joi
    .string()
    .posixPath({ subPathOnly: true })
    .required()
    .description("POSIX-style path or filename of the directory or file(s) to copy to the target."),
  target: joi
    .string()
    .posixPath({ subPathOnly: true })
    .default(() => "", "<same as source path>")
    .description("POSIX-style path or filename to copy the directory or file(s)."),
})

export const moduleOutputsSchema = joiIdentifierMap(joiPrimitive())

export interface BuildDependencyConfig {
  name: string
  plugin?: string
  copy: BuildCopySpec[]
}

export const buildDependencySchema = joi.object().keys({
  name: joiIdentifier()
    .required()
    .description("Module name to build ahead of this module."),
  plugin: joiIdentifier()
    .meta({ internal: true })
    .description("The name of plugin that provides the build dependency."),
  copy: joiArray(copySchema).description(
    "Specify one or more files or directories to copy from the built dependency to this module."
  ),
})

export interface BaseBuildSpec {
  dependencies: BuildDependencyConfig[]
}

export interface ModuleSpec {}

export interface BaseModuleSpec {
  apiVersion: string
  name: string
  path: string
  allowPublish: boolean
  build: BaseBuildSpec
  description?: string
  include?: string[]
  exclude?: string[]
  type: string
  repositoryUrl?: string
}

export const baseBuildSpecSchema = joi
  .object()
  .keys({
    dependencies: joiArray(buildDependencySchema)
      .description("A list of modules that must be built before this module is built.")
      .example([[{ name: "some-other-module-name" }], {}]),
  })
  .default(() => ({ dependencies: [] }), "{}")
  .description("Specify how to build the module. Note that plugins may define additional keys on this object.")

export const baseModuleSpecSchema = joi
  .object()
  .keys({
    apiVersion: joi
      .string()
      .default(DEFAULT_API_VERSION)
      .only(DEFAULT_API_VERSION)
      .description("The schema version of this module's config (currently not used)."),
    kind: joi
      .string()
      .default("Module")
      .only("Module"),
    type: joiIdentifier()
      .required()
      .description("The type of this module.")
      .example("container"),
    name: joiUserIdentifier()
      .required()
      .description("The name of this module.")
      .example("my-sweet-module"),
    description: joi.string(),
    include: joi
      .array()
      .items(joi.string().posixPath({ subPathOnly: true }))
      .description(
        dedent`Specify a list of POSIX-style paths or globs that should be regarded as the source files for this
        module. Files that do *not* match these paths or globs are excluded when computing the version of the module,
        when responding to filesystem watch events, and when staging builds.

        Note that you can also _exclude_ files using the \`exclude\` field or by placing \`.gardenignore\` files in your
        source tree, which use the same format as \`.gitignore\` files. See the
        [Configuration Files guide](${includeGuideLink}) for details.

        Also note that specifying an empty list here means _no sources_ should be included.`
      )
      .example([["Dockerfile", "my-app.js"], {}]),
    exclude: joi
      .array()
      .items(joi.string().posixPath({ subPathOnly: true }))
      .description(
        dedent`Specify a list of POSIX-style paths or glob patterns that should be excluded from the module. Files that
        match these paths or globs are excluded when computing the version of the module, when responding to filesystem
        watch events, and when staging builds.

        Note that you can also explicitly _include_ files using the \`include\` field. If you also specify the
        \`include\` field, the files/patterns specified here are filtered from the files matched by \`include\`. See the
        [Configuration Files guide](${includeGuideLink})for details.`
      )
      .example([["tmp/**/*", "*.log"], {}]),
    repositoryUrl: joiRepositoryUrl().description(
      dedent`${joiRepositoryUrl().describe().description}

        Garden will import the repository source code into this module, but read the module's
        config from the local garden.yml file.`
    ),
    allowPublish: joi
      .boolean()
      .default(true)
      .description("When false, disables pushing this module to remote registries."),
    build: baseBuildSpecSchema.unknown(true),
  })
  .required()
  .unknown(true)
  .description("Configure a module whose sources are located in this directory.")
  .meta({ extendable: true })

export interface ModuleConfig<
  M extends ModuleSpec = any,
  S extends ServiceSpec = any,
  T extends TestSpec = any,
  W extends TaskSpec = any
> extends BaseModuleSpec {
  outputs: PrimitiveMap
  path: string
  configPath?: string
  plugin?: string // used to identify modules that are bundled as part of a plugin
  serviceConfigs: ServiceConfig<S>[]
  testConfigs: TestConfig<T>[]
  taskConfigs: TaskConfig<W>[]

  // Plugins can add custom fields that are kept here
  spec: M
}

export const moduleConfigSchema = baseModuleSpecSchema
  .keys({
    outputs: joiVariables().description("The outputs defined by the module (referenceable in other module configs)."),
    path: joi.string().description("The filesystem path of the module."),
    configPath: joi.string().description("The filesystem path of the module config file."),
    plugin: joiIdentifier()
      .meta({ internal: true })
      .description("The name of a the parent plugin of the module, if applicable."),
    serviceConfigs: joiArray(serviceConfigSchema).description("List of services configured by this module."),
    taskConfigs: joiArray(taskConfigSchema).description("List of tasks configured by this module."),
    testConfigs: joiArray(testConfigSchema).description("List of tests configured by this module."),
    spec: joi
      .object()
      .meta({ extendable: true })
      .description("The module spec, as defined by the provider plugin."),
    _ConfigType: joi.object().meta({ internal: true }),
  })
  .description("The configuration for a module.")
  .unknown(false)

export function serializeConfig(moduleConfig: ModuleConfig) {
  return stableStringify(moduleConfig)
}

export interface ModuleResource extends ModuleConfig {
  kind: "Module"
}
