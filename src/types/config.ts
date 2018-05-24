/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join, parse, relative, sep } from "path"
import {
  findByName,
  getNames,
} from "../util"
import { baseModuleSpecSchema, ModuleConfig } from "./module"
import { joiIdentifier, validate } from "./common"
import { ConfigurationError } from "../exceptions"
import * as Joi from "joi"
import * as yaml from "js-yaml"
import { readFileSync } from "fs"
import { defaultEnvironments, ProjectConfig, projectSchema } from "./project"
import { omit } from "lodash"

const CONFIG_FILENAME = "garden.yml"

export interface GardenConfig {
  version: string
  dirname: string
  path: string
  module?: ModuleConfig
  project?: ProjectConfig
}

export const configSchema = Joi.object()
  .keys({
    // TODO: should this be called apiVersion?
    version: Joi.string().default("0").only("0"),
    dirname: Joi.string(),
    path: Joi.string(),
    module: baseModuleSpecSchema,
    project: projectSchema,
  })
  .optionalKeys(["module", "project"])
  .required()

const baseModuleSchemaKeys = Object.keys(baseModuleSpecSchema.describe().children)

export async function loadConfig(projectRoot: string, path: string): Promise<GardenConfig> {
  // TODO: nicer error messages when load/validation fails
  const absPath = join(path, CONFIG_FILENAME)
  let fileData
  let spec: any

  try {
    fileData = readFileSync(absPath)
  } catch (err) {
    throw new ConfigurationError(`Could not find ${CONFIG_FILENAME} in directory ${path}`, err)
  }

  try {
    spec = yaml.safeLoad(fileData) || {}
  } catch (err) {
    throw new ConfigurationError(`Could not parse ${CONFIG_FILENAME} in directory ${path} as valid YAML`, err)
  }

  if (spec.module) {
    /*
      We allow specifying modules by name only as a shorthand:

        dependencies:
          - foo-module
          - name: foo-module // same as the above
     */
    if (spec.module.build && spec.module.build.dependencies) {
      spec.module.build.dependencies = spec.module.build.dependencies
        .map(dep => (typeof dep) === "string" ? { name: dep } : dep)
    }
  }

  const parsed = <GardenConfig>validate(spec, configSchema, { context: relative(projectRoot, absPath) })

  const dirname = parse(absPath).dir.split(sep).slice(-1)[0]
  const project = parsed.project
  let module = parsed.module

  if (project) {
    // we include the default local environment unless explicitly overridden
    for (const env of defaultEnvironments) {
      if (!findByName(project.environments, env.name)) {
        project.environments.push(env)
      }
    }

    // the default environment is the first specified environment in the config, unless specified
    const defaultEnvironment = project.defaultEnvironment

    if (defaultEnvironment === "") {
      project.defaultEnvironment = project.environments[0].name
    } else {
      if (!findByName(project.environments, defaultEnvironment)) {
        throw new ConfigurationError(`The specified default environment ${defaultEnvironment} is not defined`, {
          defaultEnvironment,
          availableEnvironments: getNames(project.environments),
        })
      }
    }
  }

  if (module) {
    // Built-in keys are validated here and the rest are put into the `spec` field
    module = {
      allowPush: module.allowPush,
      build: module.build,
      description: module.description,
      name: module.name,
      path,
      spec: omit(module, baseModuleSchemaKeys),
      type: module.type,
      variables: module.variables,
    }

    if (!module.name) {
      try {
        module.name = validate(dirname, joiIdentifier())
      } catch (_) {
        throw new ConfigurationError(
          `Directory name ${parsed.dirname} is not a valid module name (must be valid identifier). ` +
          `Please rename the directory or specify a module name in the garden.yml file.`,
          { dirname: parsed.dirname },
        )
      }
    }
  }

  return {
    version: parsed.version,
    dirname,
    path,
    module,
    project,
  }
}
