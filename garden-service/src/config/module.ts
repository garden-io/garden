/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import stableStringify = require("json-stable-stringify")
import { ServiceConfig, serviceConfigSchema } from "./service"
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
import { TestConfig, testConfigSchema } from "./test"
import { TaskConfig, taskConfigSchema } from "./task"
import { DEFAULT_API_VERSION } from "../constants"
import { joiVariables } from "./common"
import { dedent } from "../util/string"

export interface BuildCopySpec {
  source: string
  target: string
}

// TODO: allow : delimited string (e.g. some.file:some-dir/)
// FIXME: target should not default to source if source contains wildcards
const copySchema = joi.object().keys({
  // TODO: allow array of strings here
  source: joi
    .posixPath()
    .allowGlobs()
    .subPathOnly()
    .required()
    .description("POSIX-style path or filename of the directory or file(s) to copy to the target."),
  target: joi
    .posixPath()
    .subPathOnly()
    .default("").description(dedent`
        POSIX-style path or filename to copy the directory or file(s), relative to the build directory.
        Defaults to to same as source path.
      `),
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

export interface AddModuleSpec {
  apiVersion?: string
  allowPublish?: boolean
  build?: BaseBuildSpec
  description?: string
  exclude?: string[]
  include?: string[]
  name: string
  path: string
  repositoryUrl?: string
  type: string
}

export interface BaseModuleSpec extends AddModuleSpec {
  apiVersion: string
  allowPublish: boolean
  build: BaseBuildSpec
  disabled: boolean
}

export const baseBuildSpecSchema = joi
  .object()
  .keys({
    dependencies: joiArray(buildDependencySchema)
      .description("A list of modules that must be built before this module is built.")
      .example([{ name: "some-other-module-name" }]),
  })
  .default(() => ({ dependencies: [] }))
  .description("Specify how to build the module. Note that plugins may define additional keys on this object.")

// These fields are validated immediately when loading the config file
export const coreModuleSpecSchema = joi
  .object()
  .keys({
    apiVersion: joi
      .string()
      .default(DEFAULT_API_VERSION)
      .valid(DEFAULT_API_VERSION)
      .description("The schema version of this module's config (currently not used)."),
    kind: joi
      .string()
      .default("Module")
      .valid("Module"),
    type: joiIdentifier()
      .required()
      .description("The type of this module.")
      .example("container"),
    name: joiUserIdentifier()
      .required()
      .description("The name of this module.")
      .example("my-sweet-module"),
  })
  .required()
  .unknown(true)
  .description("Configure a module whose sources are located in this directory.")
  .meta({ extendable: true })

// These fields may be resolved later in the process, and allow for usage of template strings
export const baseModuleSpecSchema = coreModuleSpecSchema.keys({
  description: joi.string(),
  disabled: joi
    .boolean()
    .default(false)
    .description(
      dedent`
        Set this to \`true\` to disable the module. You can use this with conditional template strings to
        disable modules based on, for example, the current environment or other variables (e.g.
        \`disabled: \${environment.name == "prod"}\`). This can be handy when you only need certain modules for
        specific environments, e.g. only for development.

        Disabling a module means that any services, tasks and tests contained in it will not be deployed or run.
        It also means that the module is not built _unless_ it is declared as a build dependency by another enabled
        module (in which case building this module is necessary for the dependant to be built).

        If you disable the module, and its services, tasks or tests are referenced as _runtime_ dependencies, Garden
        will automatically ignore those dependency declarations. Note however that template strings referencing the
        module's service or task outputs (i.e. runtime outputs) will fail to resolve when the module is disabled,
        so you need to make sure to provide alternate values for those if you're using them, using conditional
        expressions.
      `
    ),
  include: joi
    .array()
    .items(
      joi
        .posixPath()
        .allowGlobs()
        .subPathOnly()
    )
    .description(
      dedent`Specify a list of POSIX-style paths or globs that should be regarded as the source files for this
        module. Files that do *not* match these paths or globs are excluded when computing the version of the module,
        when responding to filesystem watch events, and when staging builds.

        Note that you can also _exclude_ files using the \`exclude\` field or by placing \`.gardenignore\` files in your
        source tree, which use the same format as \`.gitignore\` files. See the
        [Configuration Files guide](${includeGuideLink}) for details.

        Also note that specifying an empty list here means _no sources_ should be included.`
    )
    .example(["Dockerfile", "my-app.js"]),
  exclude: joi
    .array()
    .items(
      joi
        .posixPath()
        .allowGlobs()
        .subPathOnly()
    )
    .description(
      dedent`Specify a list of POSIX-style paths or glob patterns that should be excluded from the module. Files that
        match these paths or globs are excluded when computing the version of the module, when responding to filesystem
        watch events, and when staging builds.

        Note that you can also explicitly _include_ files using the \`include\` field. If you also specify the
        \`include\` field, the files/patterns specified here are filtered from the files matched by \`include\`. See the
        [Configuration Files guide](${includeGuideLink})for details.

        Unlike the \`modules.exclude\` field in the project config, the filters here have _no effect_ on which files
        and directories are watched for changes. Use the project \`modules.exclude\` field to affect those, if you have
        large directories that should not be watched for changes.
        `
    )
    .example(["tmp/**/*", "*.log"]),
  repositoryUrl: joiRepositoryUrl().description(
    dedent`${(<any>joiRepositoryUrl().describe().flags).description}

        Garden will import the repository source code into this module, but read the module's
        config from the local garden.yml file.`
  ),
  allowPublish: joi
    .boolean()
    .default(true)
    .description("When false, disables pushing this module to remote registries."),
  build: baseBuildSpecSchema.unknown(true),
})

export interface ModuleConfig<M extends {} = any, S extends {} = any, T extends {} = any, W extends {} = any>
  extends BaseModuleSpec {
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

export const modulePathSchema = joi.string().description("The filesystem path of the module.")

export const moduleConfigSchema = baseModuleSpecSchema
  .keys({
    outputs: joiVariables().description("The outputs defined by the module (referenceable in other module configs)."),
    path: modulePathSchema,
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

export const baseModuleSchemaKeys = Object.keys(moduleConfigSchema.describe().keys).concat(["kind"])

export function serializeConfig(moduleConfig: Partial<ModuleConfig>) {
  return stableStringify(moduleConfig)
}

export interface ModuleResource extends ModuleConfig {
  kind: "Module"
}
