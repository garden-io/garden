/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ServiceConfig, serviceConfigSchema } from "./service"
import {
  joiArray,
  joiIdentifier,
  joiRepositoryUrl,
  joiUserIdentifier,
  joi,
  includeGuideLink,
  apiVersionSchema,
  DeepPrimitiveMap,
  joiVariables,
  joiSparseArray,
} from "./common"
import { TestConfig, testConfigSchema } from "./test"
import { TaskConfig, taskConfigSchema } from "./task"
import { dedent, stableStringify } from "../util/string"
import { templateKind } from "./module-template"

export interface BuildCopySpec {
  source: string
  target: string
}

// TODO: allow : delimited string (e.g. some.file:some-dir/)
// FIXME: target should not default to source if source contains wildcards
const copySchema = () =>
  joi.object().keys({
    // TODO: allow array of strings here
    source: joi
      .posixPath()
      .allowGlobs()
      .subPathOnly()
      .required()
      .description("POSIX-style path or filename of the directory or file(s) to copy to the target."),
    target: joi.posixPath().subPathOnly().default("").description(dedent`
        POSIX-style path or filename to copy the directory or file(s), relative to the build directory.
        Defaults to to same as source path.
      `),
  })

export interface BuildDependencyConfig {
  name: string
  plugin?: string
  copy: BuildCopySpec[]
}

export const buildDependencySchema = () =>
  joi.object().keys({
    name: joi.string().required().description("Module name to build ahead of this module."),
    plugin: joi.string().meta({ internal: true }).description("The name of plugin that provides the build dependency."),
    copy: joiSparseArray(copySchema()).description(
      "Specify one or more files or directories to copy from the built dependency to this module."
    ),
  })

export interface BaseBuildSpec {
  dependencies: BuildDependencyConfig[]
}

export interface ModuleFileSpec {
  sourcePath?: string
  targetPath: string
  value?: string
}

export interface ModuleSpec {}

interface ModuleSpecCommon {
  apiVersion?: string
  allowPublish?: boolean
  build?: BaseBuildSpec
  description?: string
  disabled?: boolean
  exclude?: string[]
  generateFiles?: ModuleFileSpec[]
  include?: string[]
  name: string
  path?: string
  repositoryUrl?: string
  type: string
  variables?: DeepPrimitiveMap
}

export interface AddModuleSpec extends ModuleSpecCommon {
  [key: string]: any
}

export interface BaseModuleSpec extends ModuleSpecCommon {
  apiVersion: string
  kind?: "Module"
  allowPublish: boolean
  build: BaseBuildSpec
  disabled: boolean
}

const generatedFileSchema = () =>
  joi
    .object()
    .keys({
      sourcePath: joi
        .posixPath()
        .relativeOnly()
        .description(
          dedent`
          POSIX-style filename to read the source file contents from, relative to the path of the module (or the ${templateKind} configuration file if one is being applied).
          This file may contain template strings, much like any other field in the configuration.
          `
        ),
      targetPath: joi
        .posixPath()
        .relativeOnly()
        .subPathOnly()
        .required()
        .description(
          dedent`
          POSIX-style filename to write the resolved file contents to, relative to the path of the module source directory (for remote modules this means the root of the module repository, otherwise the directory of the module configuration).

          Note that any existing file with the same name will be overwritten. If the path contains one or more directories, they will be automatically created if missing.
          `
        ),
      value: joi.string().description("The desired file contents as a string."),
    })
    .xor("value", "sourcePath")

export const baseBuildSpecSchema = () =>
  joi
    .object()
    .keys({
      dependencies: joiSparseArray(buildDependencySchema())
        .description("A list of modules that must be built before this module is built.")
        .example([{ name: "some-other-module-name" }]),
    })
    .default(() => ({ dependencies: [] }))
    .description("Specify how to build the module. Note that plugins may define additional keys on this object.")

// These fields are validated immediately when loading the config file
const coreModuleSpecKeys = () => ({
  apiVersion: apiVersionSchema(),
  kind: joi.string().default("Module").valid("Module"),
  type: joiIdentifier().required().description("The type of this module.").example("container"),
  name: joiUserIdentifier().required().description("The name of this module.").example("my-sweet-module"),
})

export const coreModuleSpecSchema = () =>
  joi
    .object()
    .keys(coreModuleSpecKeys())
    .unknown(true)
    .description("Configure a module whose sources are located in this directory.")
    .meta({ extendable: true })

// These fields may be resolved later in the process, and allow for usage of template strings
export const baseModuleSpecKeys = () => ({
  build: baseBuildSpecSchema().unknown(true),
  description: joi.string().description("A description of the module."),
  disabled: joi
    .boolean()
    .default(false)
    .description(
      dedent`
      Set this to \`true\` to disable the module. You can use this with conditional template strings to disable modules based on, for example, the current environment or other variables (e.g. \`disabled: \${environment.name == "prod"}\`). This can be handy when you only need certain modules for specific environments, e.g. only for development.

      Disabling a module means that any services, tasks and tests contained in it will not be deployed or run. It also means that the module is not built _unless_ it is declared as a build dependency by another enabled module (in which case building this module is necessary for the dependant to be built).

      If you disable the module, and its services, tasks or tests are referenced as _runtime_ dependencies, Garden will automatically ignore those dependency declarations. Note however that template strings referencing the module's service or task outputs (i.e. runtime outputs) will fail to resolve when the module is disabled, so you need to make sure to provide alternate values for those if you're using them, using conditional expressions.
    `
    ),
  include: joi
    .array()
    .items(joi.posixPath().allowGlobs().subPathOnly())
    .description(
      dedent`
      Specify a list of POSIX-style paths or globs that should be regarded as the source files for this module. Files that do *not* match these paths or globs are excluded when computing the version of the module, when responding to filesystem watch events, and when staging builds.

      Note that you can also _exclude_ files using the \`exclude\` field or by placing \`.gardenignore\` files in your source tree, which use the same format as \`.gitignore\` files. See the [Configuration Files guide](${includeGuideLink}) for details.

      Also note that specifying an empty list here means _no sources_ should be included.`
    )
    .example(["Dockerfile", "my-app.js"]),
  exclude: joi
    .array()
    .items(joi.posixPath().allowGlobs().subPathOnly())
    .description(
      dedent`
      Specify a list of POSIX-style paths or glob patterns that should be excluded from the module. Files that match these paths or globs are excluded when computing the version of the module, when responding to filesystem watch events, and when staging builds.

      Note that you can also explicitly _include_ files using the \`include\` field. If you also specify the \`include\` field, the files/patterns specified here are filtered from the files matched by \`include\`. See the [Configuration Files guide](${includeGuideLink}) for details.

      Unlike the \`modules.exclude\` field in the project config, the filters here have _no effect_ on which files and directories are watched for changes. Use the project \`modules.exclude\` field to affect those, if you have large directories that should not be watched for changes.
      `
    )
    .example(["tmp/**/*", "*.log"]),
  repositoryUrl: joiRepositoryUrl().description(
    dedent`
    ${(<any>joiRepositoryUrl().describe().flags).description}

    Garden will import the repository source code into this module, but read the module's config from the local garden.yml file.`
  ),
  allowPublish: joi
    .boolean()
    .default(true)
    .description("When false, disables pushing this module to remote registries."),
  generateFiles: joiSparseArray(generatedFileSchema()).description(dedent`
    A list of files to write to the module directory when resolving this module. This is useful to automatically generate (and template) any supporting files needed for the module.
  `),
  variables: joiVariables().default(() => undefined).description(dedent`
    A map of variables scoped to this particular module. These are resolved before any other parts of the module configuration and take precedence over project-scoped variables. They may reference project-scoped variables, and generally use any template strings normally allowed when resolving modules.
  `),
})

export const baseModuleSpecSchema = () => coreModuleSpecSchema().keys(baseModuleSpecKeys())

export interface ModuleConfig<M extends {} = any, S extends {} = any, T extends {} = any, W extends {} = any>
  extends BaseModuleSpec {
  path: string
  configPath?: string
  plugin?: string // used to identify modules that are bundled as part of a plugin
  buildConfig?: object
  serviceConfigs: ServiceConfig<S>[]
  testConfigs: TestConfig<T>[]
  taskConfigs: TaskConfig<W>[]

  // set by ModuleTemplates for templated modules
  parentName?: string
  templateName?: string
  inputs?: DeepPrimitiveMap

  // Plugins can add custom fields that are kept here
  spec: M
}

export const modulePathSchema = () => joi.string().description("The filesystem path of the module.")

export const moduleConfigSchema = () =>
  baseModuleSpecSchema()
    .keys({
      path: modulePathSchema(),
      configPath: joi.string().description("The filesystem path of the module config file."),
      plugin: joiIdentifier()
        .meta({ internal: true })
        .description("The name of a the parent plugin of the module, if applicable."),
      buildConfig: joi
        .object()
        .unknown(true)
        .description(
          dedent`
          The resolved build configuration of the module. If this is returned by the configure handler for the module type, we can provide more granular versioning for the module, with a separate build version (i.e. module version), as well as separate service, task and test versions, instead of applying the same version to all of them.

          When this is specified, it is **very important** that this field contains all configurable (or otherwise dynamic) parameters that will affect the built artifacts/images, aside from source files that is (the hash of those is separately computed).
          `
        ),
      serviceConfigs: joiArray(serviceConfigSchema()).description("List of services configured by this module."),
      taskConfigs: joiArray(taskConfigSchema()).description("List of tasks configured by this module."),
      testConfigs: joiArray(testConfigSchema()).description("List of tests configured by this module."),
      spec: joi.object().meta({ extendable: true }).description("The module spec, as defined by the provider plugin."),
      generateFiles: joi
        .array()
        .items(
          generatedFileSchema().keys({
            // Allowing any file path for resolved configs
            sourcePath: joi.string(),
          })
        )
        .description("Files to write upon resolution, defined by a ModuleTemplate.")
        .meta({ internal: true }),
      parentName: joiIdentifier().description(
        "The name of the parent module (e.g. a templated module that generated this module), if applicable."
      ),
      templateName: joiIdentifier().description("The module template that generated the module, if applicable."),
      inputs: joiVariables().description(
        "Inputs provided when rendering the module from a module template, if applicable."
      ),
      _config: joi.object().meta({ internal: true }),
    })
    .description("The configuration for a module.")
    .unknown(false)

export const baseModuleSchemaKeys = () =>
  Object.keys(baseModuleSpecSchema().describe().keys).concat([
    "kind",
    "name",
    "type",
    "path",
    "configPath",
    "serviceConfigs",
    "taskConfigs",
    "testConfigs",
    "_config",
  ])

export function serializeConfig(moduleConfig: Partial<ModuleConfig>) {
  return stableStringify(moduleConfig)
}

export interface ModuleResource extends ModuleConfig {
  kind: "Module"
}
