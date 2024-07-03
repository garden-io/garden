/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dotenv from "dotenv"
import { sep, resolve, relative, basename, dirname, join } from "path"
import { load } from "js-yaml"
import { lint } from "yaml-lint"
import fsExtra from "fs-extra"

const { pathExists, readFile } = fsExtra
import { omit, isPlainObject, isArray } from "lodash-es"
import type { BuildDependencyConfig, ModuleConfig } from "./module.js"
import { coreModuleSpecSchema, baseModuleSchemaKeys } from "./module.js"
import { ConfigurationError, FilesystemError, ParameterError } from "../exceptions.js"
import { DEFAULT_BUILD_TIMEOUT_SEC, GardenApiVersion } from "../constants.js"
import type { ProjectConfig } from "../config/project.js"
import { validateWithPath } from "./validation.js"
import { defaultDotIgnoreFile, listDirectory } from "../util/fs.js"
import { isConfigFilename } from "../util/fs.js"
import type { ConfigTemplateKind } from "./config-template.js"
import { isNotNull, isTruthy } from "../util/util.js"
import type { DeepPrimitiveMap, PrimitiveMap } from "./common.js"
import { createSchema, joi } from "./common.js"
import { emitNonRepeatableWarning } from "../warnings.js"
import type { ActionKind, BaseActionConfig } from "../actions/types.js"
import { actionKinds } from "../actions/types.js"
import { mayContainTemplateString } from "../template-string/template-string.js"
import type { Log } from "../logger/log-entry.js"
import type { Document, DocumentOptions } from "yaml"
import { parseAllDocuments } from "yaml"
import { dedent, deline } from "../util/string.js"
import { makeDocsLinkStyled } from "../docs/common.js"

export const configTemplateKind = "ConfigTemplate"
export const renderTemplateKind = "RenderTemplate"
export const noTemplateFields = ["apiVersion", "kind", "type", "name", "internal"]

export const varfileDescription = `
The format of the files is determined by the configured file's extension:

* \`.yaml\`/\`.yml\` - YAML. The file must consist of a YAML document, which must be a map (dictionary). Keys may contain any value type. YAML format is used by default.
* \`.env\` - Standard "dotenv" format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
* \`.json\` - JSON. Must contain a single JSON _object_ (not an array).

_NOTE: The default varfile format was changed to YAML in Garden v0.13, since YAML allows for definition of nested objects and arrays._
`.trim()

export type ObjectPath = (string | number)[]

export interface YamlDocumentWithSource extends Document {
  source: string
}

export function getEffectiveConfigFileLocation(actionConfig: BaseActionConfig): string {
  const internal = actionConfig.internal
  return !!internal.configFilePath ? dirname(internal.configFilePath) : internal.basePath
}

export interface GardenResourceInternalFields {
  /**
   * The path/working directory where commands and operations relating to the config should be executed. This is
   * most commonly the directory containing the config file.
   *
   * Note: When possible, use {@link BaseAction.sourcePath()} instead, since it factors in remote source paths
   * and source  overrides (i.e. {@link BaseActionConfig.source.path}).
   * This is a lower-level field that doesn't contain template strings,
   * and can thus be used early in the resolution flow.
   */
  basePath: string
  /**
   * The path to the resource's config file, if any.
   *
   * Configs that are read from a file should always have this set, but generated configs (e.g. from templates
   * or `augmentGraph` handlers) don't necessarily have a path on disk.
   */
  configFilePath?: string
  // -> set by templates
  inputs?: DeepPrimitiveMap
  parentName?: string
  templateName?: string
  // Used to map fields to specific doc and location
  yamlDoc?: YamlDocumentWithSource
}

export interface BaseGardenResource {
  apiVersion?: GardenApiVersion
  kind: string
  name: string
  internal: GardenResourceInternalFields
}

export const baseInternalFieldsSchema = createSchema({
  name: "base-internal-fields",
  keys: () => ({
    basePath: joi.string().required().meta({ internal: true }),
    configFilePath: joi.string().optional().meta({ internal: true }),
    inputs: joi.object().optional().meta({ internal: true }),
    parentName: joi.string().optional().meta({ internal: true }),
    templateName: joi.string().optional().meta({ internal: true }),
    yamlDoc: joi.any().optional().meta({ internal: true }),
  }),
  allowUnknown: true,
  meta: { internal: true },
})

// Note: Avoiding making changes to ModuleConfig and ProjectConfig for now, because of
// the blast radius.
export type GardenResource = BaseGardenResource | ModuleConfig | ProjectConfig

export type RenderTemplateKind = typeof renderTemplateKind
export type ConfigKind = "Module" | "Workflow" | "Project" | ConfigTemplateKind | RenderTemplateKind | ActionKind

export const allConfigKinds = ["Module", "Workflow", "Project", configTemplateKind, renderTemplateKind, ...actionKinds]

/**
 * Attempts to parse content as YAML, and applies a linter to produce more informative error messages when
 * content is not valid YAML.
 *
 * @param content - The contents of the file as a string.
 * @param sourceDescription - A description of the location of the yaml file, e.g. "bar.yaml at directory /foo/".
 * @param version - YAML standard version. Defaults to "1.2"
 */
export async function loadAndValidateYaml(
  content: string,
  sourceDescription: string,
  version: DocumentOptions["version"] = "1.2"
): Promise<YamlDocumentWithSource[]> {
  try {
    return Array.from(parseAllDocuments(content, { merge: true, strict: false, version }) || []).map((doc) => {
      if (doc.errors.length > 0) {
        throw doc.errors[0]
      }
      // Workaround: Call toJS might throw an error that is not listed in the errors above.
      // See also https://github.com/eemeli/yaml/issues/497
      // We call this here to catch this error early and prevent crashes later on.
      doc.toJS()

      const docWithSource = doc as YamlDocumentWithSource
      docWithSource.source = content

      return docWithSource
    })
  } catch (loadErr) {
    // We try to find the error using a YAML linter
    try {
      await lint(content)
    } catch (linterErr) {
      throw new ConfigurationError({
        message: `Could not parse ${sourceDescription} as valid YAML: ${linterErr}`,
      })
    }
    // ... but default to throwing a generic error, in case the error wasn't caught by yaml-lint.
    throw new ConfigurationError({
      message: dedent`
        Failed to load YAML from ${sourceDescription}.

        Linting the file did not yield any errors. This is all we know: ${loadErr}
      `,
    })
  }
}

export async function loadConfigResources(
  log: Log,
  projectRoot: string,
  configPath: string,
  allowInvalid = false
): Promise<GardenResource[]> {
  const fileData = await readConfigFile(configPath, projectRoot)

  const resources = await validateRawConfig({
    log,
    rawConfig: fileData.toString(),
    configPath,
    projectRoot,
    allowInvalid,
  })

  return resources
}

export async function validateRawConfig({
  log,
  rawConfig,
  configPath,
  projectRoot,
  allowInvalid = false,
}: {
  log: Log
  rawConfig: string
  configPath: string
  projectRoot: string
  allowInvalid?: boolean
}) {
  let rawSpecs = await loadAndValidateYaml(rawConfig, `${basename(configPath)} in directory ${dirname(configPath)}`)

  // Ignore empty resources
  rawSpecs = rawSpecs.filter(Boolean)

  const resources = rawSpecs
    .map((s) => {
      const relPath = relative(projectRoot, configPath)
      const description = `config at ${relPath}`
      return prepareResource({ log, doc: s, configFilePath: configPath, projectRoot, description, allowInvalid })
    })
    .filter(isNotNull)
  return resources
}

export async function readConfigFile(configPath: string, projectRoot: string) {
  try {
    return await readFile(configPath)
  } catch (err) {
    throw new FilesystemError({
      message: `Could not find configuration file at ${configPath}. Project root directory: ${projectRoot}`,
    })
  }
}

export function prepareResource({
  log,
  doc,
  configFilePath,
  projectRoot,
  description,
  allowInvalid = false,
}: {
  log: Log
  doc: YamlDocumentWithSource
  configFilePath: string
  projectRoot: string
  description: string
  allowInvalid?: boolean
}): GardenResource | ModuleConfig | null {
  const relPath = relative(projectRoot, configFilePath)

  const spec = doc.toJS()

  if (spec === null) {
    return null
  }

  if (!isPlainObject(spec)) {
    throw new ConfigurationError({
      message: `Invalid configuration found in ${description}. Expected mapping object but got ${typeof spec}.`,
    })
  }

  let kind = spec.kind

  const basePath = dirname(configFilePath)

  if (!allowInvalid) {
    for (const field of noTemplateFields) {
      if (spec[field] && mayContainTemplateString(spec[field])) {
        throw new ConfigurationError({
          message: `Resource in ${relPath} has a template string in field '${field}', which does not allow templating.`,
        })
      }
    }
    if (spec.internal !== undefined) {
      throw new ConfigurationError({
        message: `Found invalid key "internal" in config at ${relPath}`,
      })
    }
  }

  // Allow this for backwards compatibility
  if (kind === "ModuleTemplate") {
    spec.kind = kind = configTemplateKind
  }

  if (kind === "Project") {
    spec.path = basePath
    spec.configPath = configFilePath
    spec.internal = {
      basePath,
      yamlDoc: doc,
    }
    return prepareProjectResource(log, spec)
  } else if (
    actionKinds.includes(kind) ||
    kind === "Command" ||
    kind === "Workflow" ||
    kind === configTemplateKind ||
    kind === renderTemplateKind
  ) {
    spec.internal = {
      basePath,
      configFilePath,
      yamlDoc: doc,
    }
    return spec
  } else if (kind === "Module") {
    spec.path = basePath
    spec.configPath = configFilePath
    delete spec.internal
    return prepareModuleResource(spec, configFilePath, projectRoot)
  } else if (allowInvalid) {
    return spec
  } else if (!kind) {
    throw new ConfigurationError({
      message: `Missing \`kind\` field in ${description}`,
    })
  } else {
    throw new ConfigurationError({
      message: `Unknown kind ${kind} in ${description}`,
    })
  }
}

// TODO-0.14: remove these deprecation handlers in 0.14
type DeprecatedConfigHandler = (log: Log, spec: ProjectConfig) => ProjectConfig

function handleDotIgnoreFiles(log: Log, projectSpec: ProjectConfig) {
  // If the project config has an explicitly defined `dotIgnoreFile` field,
  // it means the config has already been updated to 0.13 format.
  if (!!projectSpec.dotIgnoreFile) {
    return projectSpec
  }

  const dotIgnoreFiles = projectSpec.dotIgnoreFiles
  // If the project config has neither new `dotIgnoreFile` nor old `dotIgnoreFiles` fields
  // then there is nothing to do.
  if (!dotIgnoreFiles) {
    return projectSpec
  }

  if (dotIgnoreFiles.length === 0) {
    return { ...projectSpec, dotIgnoreFile: defaultDotIgnoreFile }
  }

  if (dotIgnoreFiles.length === 1) {
    emitNonRepeatableWarning(
      log,
      deline`Multi-valued project configuration field \`dotIgnoreFiles\` is deprecated in 0.13 and will be removed in 0.14. Please use single-valued \`dotIgnoreFile\` instead.`
    )
    return { ...projectSpec, dotIgnoreFile: dotIgnoreFiles[0] }
  }

  throw new ConfigurationError({
    message: `Cannot auto-convert array-field \`dotIgnoreFiles\` to scalar \`dotIgnoreFile\`: multiple values found in the array [${dotIgnoreFiles.join(
      ", "
    )}]`,
  })
}

function handleProjectModules(log: Log, projectSpec: ProjectConfig): ProjectConfig {
  // Field 'modules' was intentionally removed from the internal interface `ProjectConfig`,
  // but it still can be presented in the runtime if the old config format is used.
  if (projectSpec["modules"]) {
    emitNonRepeatableWarning(
      log,
      "Project configuration field `modules` is deprecated in 0.13 and will be removed in 0.14. Please use the `scan` field instead."
    )
    const scanConfig = projectSpec.scan || {}
    for (const key of ["include", "exclude"]) {
      if (projectSpec["modules"][key]) {
        if (!scanConfig[key]) {
          scanConfig[key] = projectSpec["modules"][key]
        } else {
          log.warn(
            `Project-level \`${key}\` is set both in \`modules.${key}\` and \`scan.${key}\`. The value from \`scan.${key}\` will be used (and the value from \`modules.${key}\` will not have any effect).`
          )
        }
      }
    }
    projectSpec.scan = scanConfig
    delete projectSpec["modules"]
  }

  return projectSpec
}

function handleMissingApiVersion(log: Log, projectSpec: ProjectConfig): ProjectConfig {
  // We conservatively set the apiVersion to be compatible with 0.12.
  if (projectSpec["apiVersion"] === undefined) {
    emitNonRepeatableWarning(
      log,
      `"apiVersion" is missing in the Project config. Assuming "${
        GardenApiVersion.v0
      }" for backwards compatibility with 0.12. The "apiVersion"-field is mandatory when using the new action Kind-configs. A detailed migration guide is available at ${makeDocsLinkStyled("guides/migrating-to-bonsai")}`
    )

    return { ...projectSpec, apiVersion: GardenApiVersion.v0 }
  } else {
    if (projectSpec["apiVersion"] === GardenApiVersion.v0) {
      emitNonRepeatableWarning(
        log,
        `Project is configured with \`apiVersion: ${GardenApiVersion.v0}\`, running with backwards compatibility.`
      )
    } else if (projectSpec["apiVersion"] !== GardenApiVersion.v1) {
      throw new ConfigurationError({
        message: `Project configuration with \`apiVersion: ${projectSpec["apiVersion"]}\` is not supported. Valid values are ${GardenApiVersion.v1} or ${GardenApiVersion.v0}.`,
      })
    }
  }

  return projectSpec
}

const bonsaiDeprecatedConfigHandlers: DeprecatedConfigHandler[] = [
  handleMissingApiVersion,
  handleDotIgnoreFiles,
  handleProjectModules,
]

export function prepareProjectResource(log: Log, spec: any): ProjectConfig {
  let projectSpec = <ProjectConfig>spec
  for (const handler of bonsaiDeprecatedConfigHandlers) {
    projectSpec = handler(log, projectSpec)
  }
  return projectSpec
}

export function prepareModuleResource(spec: any, configPath: string, projectRoot: string): ModuleConfig {
  // We allow specifying modules by name only as a shorthand:
  //   dependencies:
  //   - foo-module
  //   - name: foo-module // same as the above
  // Empty strings and nulls are omitted from the array.
  let dependencies: BuildDependencyConfig[] = spec.build?.dependencies || []

  if (spec.build && spec.build.dependencies && isArray(spec.build.dependencies)) {
    // We call `prepareBuildDependencies` on `spec.build.dependencies` again in `resolveModuleConfig` to ensure that
    // any dependency configs whose module names resolved to null get filtered out.
    dependencies = prepareBuildDependencies(spec.build.dependencies)
  }

  const cleanedSpec = {
    ...omit(spec, baseModuleSchemaKeys()),
    build: { ...spec.build, dependencies },
  }

  // Had a bit of a naming conflict in the terraform module type with the new module variables concept...
  if (spec.type === "terraform") {
    cleanedSpec["variables"] = spec.variables
  }

  // Built-in keys are validated here and the rest are put into the `spec` field
  const path = dirname(configPath)
  const config: ModuleConfig = {
    apiVersion: spec.apiVersion || GardenApiVersion.v0,
    kind: "Module",
    allowPublish: spec.allowPublish,
    build: {
      dependencies,
      timeout: spec.build?.timeout || DEFAULT_BUILD_TIMEOUT_SEC,
    },
    local: spec.local,
    configPath,
    description: spec.description,
    disabled: spec.disabled,
    generateFiles: spec.generateFiles,
    include: spec.include,
    exclude: spec.exclude,
    name: spec.name,
    path,
    repositoryUrl: spec.repositoryUrl,
    serviceConfigs: [],
    spec: cleanedSpec,
    testConfigs: [],
    type: spec.type,
    taskConfigs: [],
    variables: spec.variables,
    varfile: spec.varfile,
  }

  validateWithPath({
    config,
    schema: coreModuleSpecSchema(),
    path: configPath,
    projectRoot,
    configType: "module",
    ErrorClass: ConfigurationError,
    source: undefined,
  })

  return config
}

/**
 * Normalizes build dependencies such that the string / module name shorthand is converted into the map form,
 * and removes any null entries (or entries with null names, which can appear after template resolution).
 */
export function prepareBuildDependencies(buildDependencies: any[]): BuildDependencyConfig[] {
  return buildDependencies
    .map((dep) => {
      if (!dep || (dep && dep.name === null)) {
        return null
      }
      return {
        name: dep.name ? dep.name : dep,
        copy: dep.copy ? dep.copy : [],
      }
    })
    .filter(isTruthy)
}

export async function findProjectConfig({
  log,
  path,
  allowInvalid = false,
  scan = true,
}: {
  log: Log
  path: string
  allowInvalid?: boolean
  scan?: boolean
}): Promise<ProjectConfig | undefined> {
  const sepCount = path.split(sep).length - 1

  let allProjectSpecs: GardenResource[] = []

  for (let i = 0; i < sepCount; i++) {
    const configFiles = (await listDirectory(path, { recursive: false })).filter(isConfigFilename)

    for (const configFile of configFiles) {
      const resources = await loadConfigResources(log, path, join(path, configFile), allowInvalid)

      const projectSpecs = resources.filter((s) => s.kind === "Project")

      if (projectSpecs.length > 1 && !allowInvalid) {
        throw new ConfigurationError({
          message: `Multiple project declarations found in ${path}/${configFile}`,
        })
      } else if (projectSpecs.length > 0) {
        allProjectSpecs = allProjectSpecs.concat(projectSpecs)
      }
    }

    if (allProjectSpecs.length > 1 && !allowInvalid) {
      const configPaths = allProjectSpecs.map((c) => `- ${(c as ProjectConfig).configPath}`)
      throw new ConfigurationError({
        message: `Multiple project declarations found at paths:\n${configPaths.join("\n")}`,
      })
    } else if (allProjectSpecs.length === 1) {
      return <ProjectConfig>allProjectSpecs[0]
    }

    if (!scan) {
      break
    }

    path = resolve(path, "..")
  }

  return
}

export async function loadVarfile({
  configRoot,
  path,
  defaultPath,
  optional = false,
}: {
  // project root (when resolving project config) or module root (when resolving module config)
  configRoot: string
  path: string | undefined
  defaultPath: string | undefined
  optional?: boolean
}): Promise<PrimitiveMap> {
  if (!path && !defaultPath) {
    throw new ParameterError({
      message: `Neither a path nor a defaultPath was provided. Config root: ${configRoot}`,
    })
  }
  const resolvedPath = resolve(configRoot, <string>(path || defaultPath))
  const exists = await pathExists(resolvedPath)

  if (!exists && path && path !== defaultPath && !optional) {
    throw new ConfigurationError({
      message: `Could not find varfile at path '${path}'. Absolute path: ${resolvedPath}`,
    })
  }

  if (!exists) {
    return {}
  }

  try {
    const data = await readFile(resolvedPath)
    const relPath = relative(configRoot, resolvedPath)
    const filename = basename(resolvedPath.toLowerCase())

    if (filename.endsWith(".json")) {
      // JSON parser throws a JSON syntax error on completely empty input file,
      // and returns an empty object for an empty JSON.
      const parsed = JSON.parse(data.toString())
      if (!isPlainObject(parsed)) {
        throw new ConfigurationError({
          message: `Configured variable file ${relPath} must be a valid plain JSON object. Got: ${typeof parsed}`,
        })
      }
      return parsed as PrimitiveMap
    } else if (filename.endsWith(".yml") || filename.endsWith(".yaml")) {
      // YAML parser returns `undefined` for empty files, we interpret that as an empty object.
      const parsed = load(data.toString()) || {}
      if (!isPlainObject(parsed)) {
        throw new ConfigurationError({
          message: `Configured variable file ${relPath} must be a single plain YAML mapping. Got: ${typeof parsed}`,
        })
      }
      return parsed as PrimitiveMap
    } else {
      // Note: For backwards-compatibility we fall back on using .env as a default format,
      // and don't specifically validate the extension for that.
      // The dotenv parser returns an empty object for invalid or empty input file.
      const parsed = dotenv.parse(data)
      return parsed as PrimitiveMap
    }
  } catch (error) {
    throw new ConfigurationError({
      message: `Unable to load varfile at '${path}': ${error}`,
    })
  }
}
