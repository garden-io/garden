/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { sep, resolve, relative, basename, dirname } from "path"
import yaml from "js-yaml"
import { readFile } from "fs-extra"
import { omit, isPlainObject, find } from "lodash"
import { ModuleResource, coreModuleSpecSchema, baseModuleSchemaKeys } from "./module"
import { ConfigurationError } from "../exceptions"
import { DEFAULT_API_VERSION } from "../constants"
import { ProjectResource } from "../config/project"
import { getConfigFilePath } from "../util/fs"
import { validateWithPath } from "./validation"

export interface GardenResource {
  apiVersion: string
  kind: string
  name: string
  path: string
}

export async function loadConfig(projectRoot: string, path: string): Promise<GardenResource[]> {
  // TODO: nicer error messages when load/validation fails
  const configPath = await getConfigFilePath(path)
  let fileData: Buffer
  let rawSpecs: any[]

  // loadConfig returns undefined if config file is not found in the given directory
  try {
    fileData = await readFile(configPath)
  } catch (err) {
    return []
  }

  try {
    rawSpecs = yaml.safeLoadAll(fileData.toString()) || []
  } catch (err) {
    throw new ConfigurationError(`Could not parse ${basename(configPath)} in directory ${path} as valid YAML`, err)
  }

  // Ignore empty resources
  rawSpecs = rawSpecs.filter(Boolean)

  const resources: GardenResource[] = rawSpecs.map((s) => prepareResource(s, path, configPath, projectRoot))

  const projectSpecs = resources.filter((s) => s.kind === "Project")

  if (projectSpecs.length > 1) {
    throw new ConfigurationError(`Multiple project declarations in ${path}`, {
      projectSpecs,
    })
  }

  return resources
}

export type ConfigKind = "Module" | "Project"

/**
 * Each YAML document in a garden.yml file consists of a project definition and/or a module definition.
 *
 * A document can be structured according to either the (old) nested or the (new) flat style.
 *
 * In the nested style, the project/module's config is nested under the project/module key respectively.
 *
 * In the flat style, the project/module's config is at the top level, and the kind key is used to indicate
 * whether the entity being configured is a project or a module (similar to the YAML syntax for k8s object
 * definitions). The kind key is removed before validation, so that specs following both styles can be validated
 * with the same schema.
 */
function prepareResource(spec: any, path: string, configPath: string, projectRoot: string): GardenResource {
  if (!isPlainObject(spec)) {
    throw new ConfigurationError(`Invalid configuration found in ${path}`, {
      spec,
      path,
    })
  }

  const kind = spec.kind
  const relPath = `${relative(projectRoot, path)}/garden.yml`

  if (kind === "Project") {
    return prepareProjectConfig(spec, path, configPath)
  } else if (kind === "Module") {
    return prepareModuleResource(spec, path, configPath, projectRoot)
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

function prepareProjectConfig(spec: any, path: string, configPath: string): ProjectResource {
  if (!spec.apiVersion) {
    spec.apiVersion = DEFAULT_API_VERSION
  }

  spec.kind = "Project"
  spec.path = path
  spec.configPath = configPath

  return spec
}

export function prepareModuleResource(
  spec: any,
  path: string,
  configPath: string,
  projectRoot: string
): ModuleResource {
  /**
   * We allow specifying modules by name only as a shorthand:
   *   dependencies:
   *   - foo-module
   *   - name: foo-module // same as the above
   */
  const dependencies =
    spec.build && spec.build.dependencies
      ? spec.build.dependencies.map((dep) => (typeof dep === "string" ? { name: dep, copy: [] } : dep))
      : []

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
    include: spec.include,
    exclude: spec.exclude,
    name: spec.name,
    outputs: {},
    path,
    repositoryUrl: spec.repositoryUrl,
    serviceConfigs: [],
    spec: {
      ...omit(spec, baseModuleSchemaKeys),
      build: { ...spec.build, dependencies },
    },
    testConfigs: [],
    type: spec.type,
    taskConfigs: [],
  }

  validateWithPath({
    config,
    schema: coreModuleSpecSchema,
    path: dirname(configPath),
    projectRoot,
    configType: "module",
    ErrorClass: ConfigurationError,
  })

  return config
}

export async function findProjectConfig(path: string, allowInvalid = false): Promise<ProjectResource | undefined> {
  let sepCount = path.split(sep).length - 1
  for (let i = 0; i < sepCount; i++) {
    try {
      const resources = await loadConfig(path, path)
      const projectResource = find(resources, (r) => r.kind === "Project")
      if (projectResource) {
        return <ProjectResource>projectResource
      }
    } catch (err) {
      if (!allowInvalid) {
        throw err
      }
    } finally {
      path = resolve(path, "..")
    }
  }

  return
}
