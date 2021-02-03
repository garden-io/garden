/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
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
import { WorkflowResource } from "./workflow"
import { listDirectory } from "../util/fs"
import { isConfigFilename } from "../util/fs"
import { TemplateKind, templateKind, ModuleTemplateResource } from "./module-template"

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

  if (kind === "Project") {
    return prepareProjectConfig(spec, configPath)
  } else if (kind === "Module") {
    return prepareModuleResource(spec, configPath, projectRoot)
  } else if (kind === "Workflow") {
    return prepareWorkflowResource(spec, configPath)
  } else if (kind === templateKind) {
    return prepareTemplateResource(spec, configPath)
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

function prepareProjectConfig(spec: any, configPath: string): ProjectResource {
  if (!spec.apiVersion) {
    spec.apiVersion = DEFAULT_API_VERSION
  }

  spec.kind = "Project"
  spec.path = dirname(configPath)
  spec.configPath = configPath

  return spec
}

export function prepareModuleResource(spec: any, configPath: string, projectRoot: string): ModuleResource {
  /**
   * We allow specifying modules by name only as a shorthand:
   *   dependencies:
   *   - foo-module
   *   - name: foo-module // same as the above
   */
  let dependencies: BuildDependencyConfig[] = spec.build?.dependencies || []

  if (spec.build && spec.build.dependencies && isArray(spec.build.dependencies)) {
    dependencies = spec.build.dependencies.map((dep: any) => (typeof dep === "string" ? { name: dep, copy: [] } : dep))
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
    spec: {
      ...omit(spec, baseModuleSchemaKeys()),
      build: { ...spec.build, dependencies },
    },
    testConfigs: [],
    type: spec.type,
    taskConfigs: [],
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

export function prepareWorkflowResource(spec: any, configPath: string): WorkflowResource {
  if (!spec.apiVersion) {
    spec.apiVersion = DEFAULT_API_VERSION
  }

  spec.kind = "Workflow"
  spec.path = dirname(configPath)
  spec.configPath = configPath

  return spec
}

export function prepareTemplateResource(spec: any, configPath: string): ModuleTemplateResource {
  if (!spec.apiVersion) {
    spec.apiVersion = DEFAULT_API_VERSION
  }

  spec.kind = templateKind
  spec.path = dirname(configPath)
  spec.configPath = configPath

  return spec
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
