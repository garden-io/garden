/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { sep, resolve, relative, basename } from "path"
import yaml from "js-yaml"
import { readFile } from "fs-extra"
import { omit, flatten, isPlainObject, find } from "lodash"
import { ModuleResource, moduleConfigSchema } from "./module"
import { ConfigurationError } from "../exceptions"
import { DEFAULT_API_VERSION } from "../constants"
import { ProjectResource } from "../config/project"
import { getConfigFilePath } from "../util/fs"

export interface GardenResource {
  apiVersion: string
  kind: string
  name: string
  path: string
}

const baseModuleSchemaKeys = Object.keys(moduleConfigSchema.describe().children).concat(["kind"])

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

  const resources: GardenResource[] = flatten(rawSpecs.map((s) => prepareResources(s, path, configPath, projectRoot)))

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
function prepareResources(spec: any, path: string, configPath: string, projectRoot: string): GardenResource[] {
  if (!isPlainObject(spec)) {
    throw new ConfigurationError(`Invalid configuration found in ${path}`, {
      spec,
      path,
    })
  }

  if (spec.kind) {
    return [prepareFlatConfigDoc(spec, path, configPath, projectRoot)]
  } else {
    return prepareScopedConfigDoc(spec, path, configPath)
  }
}

/**
 * The new / flat configuration style.
 *
 * The spec defines either a project or a module (determined by its "kind" field).
 */
function prepareFlatConfigDoc(spec: any, path: string, configPath: string, projectRoot: string): GardenResource {
  const kind = spec.kind

  if (kind === "Project") {
    return prepareProjectConfig(spec, path, configPath)
  } else if (kind === "Module") {
    return prepareModuleResource(spec, path, configPath)
  } else {
    const relPath = `${relative(projectRoot, path)}/garden.yml`
    throw new ConfigurationError(`Unknown config kind ${kind} in ${relPath}`, {
      kind,
      path: relPath,
    })
  }
}

/**
 * The old / nested configuration style.
 *
 * The spec defines a project and/or a module, with the config for each nested under the "project" / "module" field,
 * respectively.
 */
function prepareScopedConfigDoc(spec: any, path: string, configPath: string): GardenResource[] {
  const resources: GardenResource[] = []

  if (spec.project) {
    resources.push(prepareProjectConfig(spec.project, path, configPath))
  }

  if (spec.module) {
    resources.push(prepareModuleResource(spec.module, path, configPath))
  }

  return resources
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

function prepareModuleResource(spec: any, path: string, configPath: string): ModuleResource {
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
  return {
    apiVersion: spec.apiVersion || DEFAULT_API_VERSION,
    kind: "Module",
    allowPublish: spec.allowPublish,
    build: {
      dependencies,
    },
    configPath,
    description: spec.description,
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
