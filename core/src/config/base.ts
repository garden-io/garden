/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { sep, resolve, relative, basename, dirname, join } from "path"
import yaml from "js-yaml"
import yamlLint from "yaml-lint"
import { readFile } from "fs-extra"
import { omit, isPlainObject, isArray } from "lodash"
import { ModuleResource, coreModuleSpecSchema, baseModuleSchemaKeys, BuildDependencyConfig } from "./module"
import { ConfigurationError, FilesystemError } from "../exceptions"
import { DEFAULT_API_VERSION } from "../constants"
import { ProjectResource } from "../config/project"
import { validateWithPath } from "./validation"
import { listDirectory } from "../util/fs"
import { isConfigFilename } from "../util/fs"
import { TemplateKind, templateKind } from "./module-template"
import { isTruthy } from "../util/util"

export interface GardenResource {
  apiVersion: string
  kind: string
  name: string
  path: string
  configPath?: string
}

export type ConfigKind = "Module" | "Workflow" | "Project" | TemplateKind

/**
 * Attempts to parse content as YAML, and applies a linter to produce more informative error messages when
 * content is not valid YAML.
 *
 * @param content - The contents of the file as a string.
 * @param path - The path to the file.
 */
export async function loadAndValidateYaml(content: string, path: string): Promise<any[]> {
  try {
    return yaml.safeLoadAll(content) || []
  } catch (err) {
    // We try to find the error using a YAML linter
    try {
      await yamlLint(content)
    } catch (linterErr) {
      throw new ConfigurationError(
        `Could not parse ${basename(path)} in directory ${path} as valid YAML: ${err.message}`,
        linterErr
      )
    }
    // ... but default to throwing a generic error, in case the error wasn't caught by yaml-lint.
    throw new ConfigurationError(`Could not parse ${basename(path)} in directory ${path} as valid YAML.`, err)
  }
}

export async function loadConfigResources(
  projectRoot: string,
  configPath: string,
  allowInvalid = false
): Promise<GardenResource[]> {
  let fileData: Buffer

  try {
    fileData = await readFile(configPath)
  } catch (err) {
    throw new FilesystemError(`Could not find configuration file at ${configPath}`, { projectRoot, configPath })
  }

  let rawSpecs = await loadAndValidateYaml(fileData.toString(), configPath)

  // Ignore empty resources
  rawSpecs = rawSpecs.filter(Boolean)

  const resources = <GardenResource[]>(
    rawSpecs.map((s) => prepareResource({ spec: s, configPath, projectRoot, allowInvalid })).filter(Boolean)
  )

  return resources
}

/**
 * Each YAML document in a garden.yml file defines a project, a module or a workflow.
 */
function prepareResource({
  spec,
  configPath,
  projectRoot,
  allowInvalid = false,
}: {
  spec: any
  configPath: string
  projectRoot: string
  allowInvalid?: boolean
}): GardenResource | null {
  if (!isPlainObject(spec)) {
    throw new ConfigurationError(`Invalid configuration found in ${configPath}`, {
      spec,
      configPath,
    })
  }

  const kind = spec.kind
  const relPath = relative(projectRoot, configPath)

  if (!spec.apiVersion) {
    spec.apiVersion = DEFAULT_API_VERSION
  }

  spec.path = dirname(configPath)
  spec.configPath = configPath

  if (kind === "Project" || kind === "Command" || kind === "Workflow" || kind === templateKind) {
    return spec
  } else if (kind === "Module") {
    return prepareModuleResource(spec, configPath, projectRoot)
  } else if (allowInvalid) {
    return spec
  } else if (!kind) {
    throw new ConfigurationError(`Missing \`kind\` field in config at ${relPath}`, {
      kind,
      path: relPath,
    })
  } else {
    throw new ConfigurationError(`Unknown config kind ${kind} in ${relPath}`, {
      kind,
      path: relPath,
    })
  }
}

export function prepareModuleResource(spec: any, configPath: string, projectRoot: string): ModuleResource {
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
  // FIXME: remove this hack sometime after 0.13
  if (spec.type === "terraform") {
    cleanedSpec["variables"] = spec.variables
  }

  // Built-in keys are validated here and the rest are put into the `spec` field
  const config: ModuleResource = {
    apiVersion: spec.apiVersion || DEFAULT_API_VERSION,
    kind: "Module",
    allowPublish: spec.allowPublish,
    build: {
      dependencies,
    },
    configPath,
    description: spec.description,
    disabled: spec.disabled,
    generateFiles: spec.generateFiles,
    include: spec.include,
    exclude: spec.exclude,
    name: spec.name,
    path: dirname(configPath),
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

export async function findProjectConfig(path: string, allowInvalid = false): Promise<ProjectResource | undefined> {
  let sepCount = path.split(sep).length - 1

  for (let i = 0; i < sepCount; i++) {
    const configFiles = (await listDirectory(path, { recursive: false })).filter(isConfigFilename)

    for (const configFile of configFiles) {
      const resources = await loadConfigResources(path, join(path, configFile), allowInvalid)

      const projectSpecs = resources.filter((s) => s.kind === "Project")

      if (projectSpecs.length > 1 && !allowInvalid) {
        throw new ConfigurationError(`Multiple project declarations found in ${path}`, {
          projectSpecs,
        })
      } else if (projectSpecs.length > 0) {
        return <ProjectResource>projectSpecs[0]
      }
    }

    path = resolve(path, "..")
  }

  return
}
