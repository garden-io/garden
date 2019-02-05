/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join, basename, sep, resolve } from "path"
import {
  findByName,
  getNames,
} from "../util/util"
import * as Joi from "joi"
import * as yaml from "js-yaml"
import { readFile } from "fs-extra"
import { omit } from "lodash"
import { baseModuleSpecSchema, ModuleConfig } from "./module"
import { validateWithPath } from "./common"
import { ConfigurationError } from "../exceptions"
import { defaultEnvironments, ProjectConfig, projectSchema } from "../config/project"

const CONFIG_FILENAME = "garden.yml"

export interface GardenConfig {
  dirname: string
  path: string
  modules?: ModuleConfig[]
  project?: ProjectConfig
}

export const configSchema = Joi.object()
  .keys({
    dirname: Joi.string().meta({ internal: true }),
    path: Joi.string().meta({ internal: true }),
    module: baseModuleSpecSchema,
    project: projectSchema,
  })
  .optionalKeys(["module", "project"])
  .required()
  .description("The garden.yml config file.")

const baseModuleSchemaKeys = Object.keys(baseModuleSpecSchema.describe().children)

export async function loadConfig(projectRoot: string, path: string): Promise<GardenConfig | undefined> {
  // TODO: nicer error messages when load/validation fails
  const absPath = join(path, CONFIG_FILENAME)
  let fileData
  let rawSpecs: any[]

  // loadConfig returns undefined if config file is not found in the given directory
  try {
    fileData = await readFile(absPath)
  } catch (err) {
    return undefined
  }

  try {
    rawSpecs = yaml.safeLoadAll(fileData) || []
  } catch (err) {
    throw new ConfigurationError(`Could not parse ${CONFIG_FILENAME} in directory ${path} as valid YAML`, err)
  }

  const specs: ConfigDoc[] = rawSpecs.map(s => prepareConfigDoc(s, path, projectRoot))

  const projectSpecs = specs.filter(s => s.project)

  if (projectSpecs.length > 1) {
    throw new ConfigurationError(`Multiple project declarations in ${path}`, { projectSpecs })
  }

  const project = projectSpecs[0] ? projectSpecs[0].project : undefined
  const modules: ModuleConfig[] = specs.filter(s => s.module).map(s => s.module!)

  const dirname = basename(path)

  return {
    dirname,
    path,
    modules: modules.length > 0 ? modules : undefined,
    project,
  }
}

type ConfigDoc = {
  module?: ModuleConfig,
  project?: ProjectConfig,
}

/**
 * Each YAML document in a garden.yml file consists of a project definition and/or a module definition.
 */
function prepareConfigDoc(spec: any, path: string, projectRoot: string): ConfigDoc {
  if (spec.project) {
    spec.project = prepareProjectConfig(spec.project, path)
  }

  if (spec.module) {
    spec.module = prepareModuleConfig(spec.module, path)
  }

  return validateWithPath({
    config: spec,
    schema: configSchema,
    configType: "config",
    path,
    projectRoot,
  })
}

function prepareProjectConfig(projectSpec: any, path: string): ProjectConfig {

  const validatedSpec = validateWithPath({
    config: projectSpec,
    schema: projectSchema,
    configType: "project",
    path,
    projectRoot: path, // If there's a project spec, we can assume path === projectRoot.
  })

  if (!validatedSpec.environments) {
    validatedSpec.environments = defaultEnvironments
  }

  // we include the default local environment unless explicitly overridden
  for (const env of defaultEnvironments) {
    if (!findByName(validatedSpec.environments, env.name)) {
      validatedSpec.environments.push(env)
    }
  }

  // the default environment is the first specified environment in the config, unless specified
  const defaultEnvironment = validatedSpec.defaultEnvironment

  if (defaultEnvironment === "") {
    validatedSpec.defaultEnvironment = validatedSpec.environments[0].name
  } else {
    if (!findByName(validatedSpec.environments, defaultEnvironment)) {
      throw new ConfigurationError(`The specified default environment ${defaultEnvironment} is not defined`, {
        defaultEnvironment,
        availableEnvironments: getNames(validatedSpec.environments),
      })
    }
  }

  return validatedSpec
}

function prepareModuleConfig(moduleSpec: any, path: string): ModuleConfig {
  // Built-in keys are validated here and the rest are put into the `spec` field
  const module = {
    apiVersion: moduleSpec.apiVersion,
    allowPublish: moduleSpec.allowPublish,
    build: moduleSpec.build,
    description: moduleSpec.description,
    name: moduleSpec.name,
    outputs: {},
    path,
    repositoryUrl: moduleSpec.repositoryUrl,
    serviceConfigs: [],
    spec: omit(moduleSpec, baseModuleSchemaKeys),
    testConfigs: [],
    type: moduleSpec.type,
    taskConfigs: [],
  }

  /*
    We allow specifying modules by name only as a shorthand:

      dependencies:
        - foo-module
        - name: foo-module // same as the above
    */
  if (module.build && module.build.dependencies) {
    module.build.dependencies = module.build.dependencies
      .map(dep => (typeof dep) === "string" ? { name: dep } : dep)
  }

  return module
}

export async function findProjectConfig(path: string): Promise<GardenConfig | undefined> {
  let config: GardenConfig | undefined

  let sepCount = path.split(sep).length - 1
  for (let i = 0; i < sepCount; i++) {
    config = await loadConfig(path, path)
    if (!config || !config.project) {
      path = resolve(path, "..")
    } else if (config.project) {
      return config
    }
  }

  return config
}
