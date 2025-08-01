/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dotenv from "dotenv"
import { sep, resolve, relative, basename, dirname, join } from "path"
import { lint } from "yaml-lint"
import { omit, isPlainObject } from "lodash-es"
import type { BuildDependencyConfig, ModuleConfig } from "./module.js"
import { coreModuleSpecSchema, baseModuleSchemaKeys } from "./module.js"
import { ConfigurationError, FilesystemError, isErrnoException, ParameterError } from "../exceptions.js"
import { DEFAULT_BUILD_TIMEOUT_SEC, GardenApiVersion } from "../constants.js"
import type { ProjectConfig } from "../config/project.js"
import type { ConfigSource } from "./validation.js"
import { validateWithPath } from "./validation.js"
import { defaultDotIgnoreFile, listDirectory } from "../util/fs.js"
import { isConfigFilename } from "../util/fs.js"
import type { ConfigTemplateKind } from "./config-template.js"
import { isNotNull, isTruthy } from "../util/util.js"
import type { DeepPrimitiveMap, PrimitiveMap } from "./common.js"
import { createSchema, joi } from "./common.js"
import type { ActionKind, BaseActionConfig } from "../actions/types.js"
import { actionKinds } from "../actions/types.js"
import { isUnresolved } from "../template/templated-strings.js"
import type { Log } from "../logger/log-entry.js"
import type { Document, DocumentOptions } from "yaml"
import { parseAllDocuments } from "yaml"
import { dedent } from "../util/string.js"
import { profileAsync } from "../util/profiling.js"
import { readFile } from "fs/promises"
import { LRUCache } from "lru-cache"
import { parseTemplateCollection } from "../template/templated-collections.js"
import { evaluate } from "../template/evaluate.js"
import { GenericContext } from "./template-contexts/base.js"
import { reportDeprecatedFeatureUsage } from "../util/deprecations.js"
import { resolveApiVersion } from "../project-api-version.js"

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
  filename: string | undefined
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
export async function loadAndValidateYaml({
  content,
  sourceDescription,
  filename,
  version = "1.2",
}: {
  content: string
  sourceDescription: string
  filename: string | undefined
  version?: DocumentOptions["version"]
}): Promise<YamlDocumentWithSource[]> {
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
      docWithSource.filename = filename

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
  let rawSpecs = await loadAndValidateYaml({
    content: rawConfig,
    sourceDescription: `${basename(configPath)} in directory ${dirname(configPath)}`,
    filename: configPath,
  })

  // Ignore empty resources
  rawSpecs = rawSpecs.filter(Boolean)

  const resources = rawSpecs
    .map((s) => {
      const relPath = relative(projectRoot, configPath)
      const description = `config at ${relPath}`
      return prepareResource({
        log,
        doc: s,
        spec: s.toJS(),
        parse: true,
        configFilePath: configPath,
        projectRoot,
        description,
        allowInvalid,
      })
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
  spec,
  allowInvalid = false,
  parse = false,
}: {
  log: Log
  spec: any
  doc: YamlDocumentWithSource | undefined
  configFilePath: string
  projectRoot: string
  description: string
  allowInvalid?: boolean
  parse?: boolean
}): GardenResource | ModuleConfig | null {
  const relPath = relative(projectRoot, configFilePath)

  if (spec === null) {
    return null
  }

  if (!isPlainObject(spec)) {
    throw new ConfigurationError({
      message: `Invalid configuration found in ${description}. Expected mapping object but got ${typeof spec}.`,
    })
  }

  if (parse) {
    for (const k in spec) {
      // TODO: should we do this here? would be good to do it as early as possible.
      spec[k] = parseTemplateCollection({
        value: spec[k],
        source: {
          yamlDoc: doc,
          path: [k],
        },
      })
    }
  }

  let kind = spec.kind

  const basePath = dirname(configFilePath)

  if (!allowInvalid) {
    for (const field of noTemplateFields) {
      if (spec[field] && isUnresolved(spec[field])) {
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

  reportDeprecatedFeatureUsage({
    log,
    deprecation: "dotIgnoreFiles",
  })

  if (dotIgnoreFiles.length === 0) {
    return { ...projectSpec, dotIgnoreFile: defaultDotIgnoreFile }
  }

  if (dotIgnoreFiles.length === 1) {
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
    reportDeprecatedFeatureUsage({
      log,
      deprecation: "projectConfigModules",
    })
    let scanConfig = projectSpec.scan || {}
    for (const key of ["include", "exclude"]) {
      if (projectSpec["modules"][key]) {
        if (!scanConfig[key]) {
          scanConfig = { ...scanConfig, [key]: projectSpec["modules"][key] }
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

function handleApiVersion(log: Log, projectSpec: ProjectConfig): ProjectConfig {
  return { ...projectSpec, apiVersion: resolveApiVersion(projectSpec, log) }
}

const bonsaiDeprecatedConfigHandlers: DeprecatedConfigHandler[] = [
  handleApiVersion,
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
  spec.build = evaluate(spec.build, { context: new GenericContext("empty", {}), opts: {} }).resolved

  const dependencies: BuildDependencyConfig[] = spec.build?.dependencies || []

  const cleanedSpec = {
    ...omit(spec, baseModuleSchemaKeys()),
    build: { ...spec.build, dependencies },
  }

  // Had a bit of a naming conflict in the terraform module type with the new module variables concept...
  if (spec.type === "terraform") {
    cleanedSpec["variables"] = spec.variables
  }

  // Built-in keys are validated here and the rest are put into the `spec` field
  const path = spec.path ? resolve(dirname(configPath), spec.path) : dirname(configPath)
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

type LoadedVarfile = { data: PrimitiveMap; source: ConfigSource }
const loadVarfileCache = new LRUCache<string, Promise<LoadedVarfile>>({
  max: 10000,
  ttl: 30000,
  ttlAutopurge: true,
})

export function clearVarfileCache() {
  loadVarfileCache.clear()
}

export const loadVarfile = profileAsync(async function loadVarfile({
  configRoot,
  path,
  defaultPath,
  optional = false,
  log,
}: {
  // project root (when resolving project config) or module root (when resolving module config)
  configRoot: string
  path: string | undefined
  defaultPath: string | undefined
  optional?: boolean
  log?: Log
}) {
  const pathOrDefault = path || defaultPath
  if (!pathOrDefault) {
    throw new ParameterError({
      message: `Neither a path nor a defaultPath was provided. Config root: ${configRoot}`,
    })
  }
  const resolvedPath = resolve(configRoot, pathOrDefault)

  let promise: Promise<LoadedVarfile> | undefined = loadVarfileCache.get(resolvedPath)
  if (!promise) {
    promise = loadVarfileInner()
    loadVarfileCache.set(resolvedPath, promise)
  }

  return await promise

  async function loadVarfileInner(): Promise<LoadedVarfile> {
    try {
      const fileContents = await readFile(resolvedPath)
      log?.silly(() => `Loaded ${fileContents.length} bytes from varfile ${resolvedPath}`)
      const relPath = relative(configRoot, resolvedPath)
      const filename = basename(resolvedPath.toLowerCase())

      if (filename.endsWith(".json")) {
        // JSON parser throws a JSON syntax error on completely empty input file,
        // and returns an empty object for an empty JSON.
        const parsed = JSON.parse(fileContents.toString())
        if (!isPlainObject(parsed)) {
          throw new ConfigurationError({
            message: `Configured variable file ${relPath} must be a valid plain JSON object. Got: ${typeof parsed}`,
          })
        }
        return {
          data: parsed as PrimitiveMap,
          // source mapping to JSON has not been implemented at this point
          source: { path: [] },
        }
      } else if (filename.endsWith(".yml") || filename.endsWith(".yaml")) {
        const loaded = await loadAndValidateYaml({
          content: fileContents.toString("utf-8"),
          filename: resolvedPath,
          version: "1.2",
          sourceDescription: `varfile at ${relPath}`,
        })
        if (loaded.length === 0) {
          // We treat empty documents as an empty object mapping
          return {
            data: {},
            source: {
              path: [],
            },
          }
        }
        if (loaded.length > 1) {
          throw new ConfigurationError({
            message: `Configured variable file ${relPath} must be a single YAML document. Got multiple (${loaded.length}) YAML documents`,
          })
        }
        const yamlDoc = loaded[0]
        // YAML parser returns `undefined` for empty files, we interpret that as an empty object.
        const data = yamlDoc.toJS() || {}
        if (!isPlainObject(data)) {
          throw new ConfigurationError({
            message: `Configured variable file ${relPath} must be a single plain YAML mapping. Got: ${typeof data}`,
          })
        }
        return {
          data,
          source: {
            path: [],
            yamlDoc,
          },
        }
      } else {
        // Note: For backwards-compatibility we fall back on using .env as a default format,
        // and don't specifically validate the extension for that.
        // The dotenv parser returns an empty object for invalid or empty input file.
        const parsed = dotenv.parse(fileContents)
        return {
          data: parsed as PrimitiveMap,
          // source mapping to dotenv files has not been implemented at this point
          source: { path: [] },
        }
      }
    } catch (error) {
      if (error instanceof ConfigurationError) {
        throw error
      }

      if (isErrnoException(error) && error.code === "ENOENT") {
        if (
          // if path is defined, we are loading explicitly configured varfile.
          path &&
          // if the user explicitly declares default path (e.g. garden.env) then we do not throw.
          path !== defaultPath &&
          !optional
        ) {
          throw new ConfigurationError({
            message: `Could not find varfile at path '${path}'. Absolute path: ${resolvedPath}`,
          })
        } else {
          // The default var file did not exist. In that case we return empty object.
          return {
            data: {},
            source: {
              path: [],
            },
          }
        }
      }

      throw new ConfigurationError({
        message: `Unable to load varfile at '${path}': ${error}`,
      })
    }
  }
})
