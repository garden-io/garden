/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { memoize } from "lodash-es"
import type { ServiceConfig } from "./service.js"
import { serviceConfigSchema } from "./service.js"
import type { DeepPrimitiveMap } from "./common.js"
import {
  createSchema,
  includeGuideLink,
  joi,
  joiArray,
  joiIdentifier,
  joiRepositoryUrl,
  joiSparseArray,
  joiUserIdentifier,
  joiVariables,
  unusedApiVersionSchema,
} from "./common.js"
import type { TestConfig } from "./test.js"
import { testConfigSchema } from "./test.js"
import type { TaskConfig } from "./task.js"
import { taskConfigSchema } from "./task.js"
import { dedent, stableStringify } from "../util/string.js"
import { configTemplateKind, varfileDescription } from "./base.js"
import type { GardenApiVersion } from "../constants.js"
import { DEFAULT_BUILD_TIMEOUT_SEC } from "../constants.js"

interface BuildCopySpec {
  source: string
  target: string
}

// TODO: allow : delimited string (e.g. some.file:some-dir/)
// FIXME: target should not default to source if source contains wildcards
const copySchema = createSchema({
  name: "copy-spec",
  keys: () => ({
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
      .default((parent) => parent.source).description(dedent`
        POSIX-style path or filename to copy the directory or file(s), relative to the build directory.
        Defaults to the same as source path.
      `),
  }),
})

export interface BuildDependencyConfig {
  name: string
  copy: BuildCopySpec[]
}

export const buildDependencySchema = createSchema({
  name: "module-build-dependency",
  keys: () => ({
    name: joi.string().required().description("Module name to build ahead of this module."),
    plugin: joi.string().meta({ internal: true }).description("The name of plugin that provides the build dependency."),
    copy: joiSparseArray(copySchema()).description(
      "Specify one or more files or directories to copy from the built dependency to this module."
    ),
  }),
})

export interface BaseBuildSpec {
  dependencies: BuildDependencyConfig[]
  timeout: number
}

export interface GenerateFileSpec {
  sourcePath?: string
  targetPath: string
  resolveTemplates: boolean
  value?: string
}

export type ModuleSpec = object

interface ModuleSpecCommon {
  apiVersion?: string
  allowPublish?: boolean
  build?: BaseBuildSpec
  local?: boolean
  description?: string
  disabled?: boolean
  exclude?: string[]
  generateFiles?: GenerateFileSpec[]
  include?: string[]
  name: string
  path?: string
  repositoryUrl?: string
  type: string
  variables?: DeepPrimitiveMap
  varfile?: string
}

export interface BaseModuleSpec extends ModuleSpecCommon {
  /**
   * the apiVersion field is unused in all Modules at the moment and hidden in the reference docs.
   */
  apiVersion: GardenApiVersion.v0
  kind?: "Module"
  allowPublish: boolean
  build: BaseBuildSpec
  disabled: boolean
}

export const generatedFileSchema = createSchema({
  name: "module-generated-file",
  keys: () => ({
    sourcePath: joi
      .posixPath()
      .relativeOnly()
      .description(
        dedent`
        POSIX-style filename to read the source file contents from, relative to the path of the module (or the ${configTemplateKind} configuration file if one is being applied).
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
    resolveTemplates: joi
      .boolean()
      .default(true)
      .description(
        "By default, Garden will attempt to resolve any Garden template strings in source files. Set this to false to skip resolving template strings. Note that this does not apply when setting the `value` field, since that's resolved earlier when parsing the configuration."
      ),
    value: joi.string().description("The desired file contents as a string."),
  }),
  xor: [["value", "sourcePath"]],
})

export const baseBuildSpecSchema = createSchema({
  name: "base-build-spec",
  description: "Specify how to build the module. Note that plugins may define additional keys on this object.",
  keys: () => ({
    dependencies: joiSparseArray(buildDependencySchema())
      .description("A list of modules that must be built before this module is built.")
      .example([{ name: "some-other-module-name" }]),
    timeout: joi
      .number()
      .integer()
      .min(1)
      .default(DEFAULT_BUILD_TIMEOUT_SEC)
      .description("Maximum time in seconds to wait for build to finish."),
  }),
  default: () => ({ dependencies: [] }),
})

// These fields are validated immediately when loading the config file
const coreModuleSpecSchemaKeys = memoize(() => ({
  apiVersion: unusedApiVersionSchema(),
  kind: joi.string().default("Module").valid("Module"),
  type: joiIdentifier().required().description("The type of this module.").example("container"),
  name: joiUserIdentifier().required().description("The name of this module.").example("my-sweet-module"),
}))
export const coreModuleSpecKeys = () => Object.keys(coreModuleSpecSchemaKeys())

export const coreModuleSpecSchema = createSchema({
  name: "core-module-spec",
  description: "Configure a module whose sources are located in this directory.",
  keys: coreModuleSpecSchemaKeys,
  allowUnknown: true,
  meta: { extendable: true },
})

// These fields may be resolved later in the process, and allow for usage of template strings
export const baseModuleSpecKeys = memoize(() => ({
  build: baseBuildSpecSchema().unknown(true),
  local: joi
    .boolean()
    .description(
      dedent`
      If set to true, Garden will run the build command, services, tests, and tasks in the module source directory,
      instead of in the Garden build directory (under .garden/build/<module-name>).

      Garden will therefore not stage the build for local modules. This means that include/exclude filters
      and ignore files are not applied to local modules, except to calculate the module/action versions.

      If you use use \`build.dependencies[].copy\` for one or more build dependencies of this module, the copied files
      will be copied to the module source directory (instead of the build directory, as is the default case when
      \`local = false\`).

      Note: This maps to the \`buildAtSource\` option in this module's generated Build action (if any).
      `
    )
    .default(false),
  description: joi.string().description("A description of the module."),
  disabled: joi
    .boolean()
    .default(false)
    .description(
      dedent`
      Set this to \`true\` to disable the module. You can use this with conditional template strings to disable modules based on, for example, the current environment or other variables (e.g. \`disabled: \${environment.name == "prod"}\`). This can be handy when you only need certain modules for specific environments, e.g. only for development.

      Disabling a module means that any services, tasks and tests contained in it will not be build, deployed or run.

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

      Unlike the \`scan.exclude\` field in the project config, the filters here have _no effect_ on which files and directories are watched for changes. Use the project \`scan.exclude\` field to affect those, if you have large directories that should not be watched for changes.
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
    .description("When false, disables pushing this module to remote registries via the publish command."),
  generateFiles: joiSparseArray(generatedFileSchema()).description(dedent`
    A list of files to write to the module directory when resolving this module. This is useful to automatically generate (and template) any supporting files needed for the module.
  `),
  variables: joiVariables().default(() => undefined).description(dedent`
    A map of variables scoped to this particular module. These are resolved before any other parts of the module configuration and take precedence over project-scoped variables. They may reference project-scoped variables, and generally use any template strings normally allowed when resolving modules.
  `),
  varfile: joi
    .posixPath()
    .description(
      dedent`
      Specify a path (relative to the module root) to a file containing variables, that we apply on top of the
      module-level \`variables\` field.

      ${varfileDescription}

      To use different module-level varfiles in different environments, you can template in the environment name
      to the varfile name, e.g. \`varfile: "my-module.\${environment.name}.env\` (this assumes that the corresponding
      varfiles exist).
    `
    )
    .example("my-module.env"),
}))

export const baseModuleSpecSchema = createSchema({
  name: "module-spec-base",
  extend: coreModuleSpecSchema,
  keys: baseModuleSpecKeys,
})

export interface ModuleConfig<M extends {} = any, S extends {} = any, T extends {} = any, W extends {} = any>
  extends BaseModuleSpec {
  path: string
  configPath?: string
  basePath?: string // The directory of the config. Disambiguates `path` when the module has a remote source.
  plugin?: string // Used to identify modules that are bundled as part of a plugin.
  buildConfig?: any
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

export const modulePathSchema = memoize(() => joi.string().description("The filesystem path of the module."))

export const moduleConfigSchema = createSchema({
  name: "module-config",
  description: "The configuration for a module.",
  extend: baseModuleSpecSchema,
  keys: () => ({
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
      .description(`Files to write upon resolution, defined by a ${configTemplateKind}.`)
      .meta({ internal: true }),
    parentName: joiIdentifier().description(
      "The name of the parent module (e.g. a templated module that generated this module), if applicable."
    ),
    templateName: joiIdentifier().description("The module template that generated the module, if applicable."),
    inputs: joiVariables().description(
      "Inputs provided when rendering the module from a module template, if applicable."
    ),
    _config: joi.object().meta({ internal: true }),
  }),
  allowUnknown: false,
})

export const baseModuleSchemaKeys = memoize(() =>
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
)

export function serializeConfig(moduleConfig: Partial<ModuleConfig>) {
  return stableStringify(moduleConfig)
}
