/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join, parse, relative, sep } from "path"
import { baseModuleSchema, ModuleConfig } from "./module"
import { joiIdentifier, validate } from "./common"
import { ConfigurationError } from "../exceptions"
import * as Joi from "joi"
import * as yaml from "js-yaml"
import { readFileSync } from "fs"
import { defaultEnvironments, ProjectConfig, projectSchema } from "./project"
import { extend } from "lodash"

const CONFIG_FILENAME = "garden.yml"

export interface Config {
  version: string
  dirname: string
  path: string
  module: ModuleConfig
  project: ProjectConfig
}

export const configSchema = Joi.object()
  .keys({
    version: Joi.string().default("0").only("0"),
    module: baseModuleSchema,
    project: projectSchema,
  })
  .optionalKeys(["module", "project"])
  .options({ allowUnknown: true })
  .required()

export async function loadConfig(projectRoot: string, path: string): Promise<Config> {
  // TODO: nicer error messages when load/validation fails
  const absPath = join(path, CONFIG_FILENAME)
  let fileData
  let config

  try {
    fileData = readFileSync(absPath)
  } catch (err) {
    throw new ConfigurationError(`Could not find ${CONFIG_FILENAME} in directory ${path}`, err)
  }

  try {
    config = <Config>yaml.safeLoad(fileData) || {}
  } catch (err) {
    throw new ConfigurationError(`Could not parse ${CONFIG_FILENAME} in directory ${path} as valid YAML`, err)
  }

  if (config.module) {
    /*
      We allow specifying modules by name only as a shorthand:

        dependencies:
          - foo-module
          - name: foo-module // same as the above
     */
    if (config.module.build && config.module.build.dependencies) {
      config.module.build.dependencies = config.module.build.dependencies
        .map(dep => (typeof dep) === "string" ? { name: dep } : dep)
    }
  }

  const parsed = <Config>validate(config, configSchema, relative(projectRoot, absPath))

  const project = parsed.project
  const module = parsed.module

  parsed.dirname = parse(absPath).dir.split(sep).slice(-1)[0]
  parsed.path = path

  if (project) {
    // we include the default local environment unless explicitly overridden
    project.environments = extend({}, defaultEnvironments, project.environments)

    // the default environment is the first specified environment in the config, unless specified
    const defaultEnvironment = project.defaultEnvironment

    if (defaultEnvironment === "") {
      project.defaultEnvironment = Object.keys(project.environments)[0]
    } else {
      if (!project.environments[defaultEnvironment]) {
        throw new ConfigurationError(`The specified default environment ${defaultEnvironment} is not defined`, {
          defaultEnvironment,
          availableEnvironments: Object.keys(project.environments),
        })
      }
    }
  }

  if (module) {
    module.path = path

    if (!module.name) {
      try {
        module.name = validate(parsed.dirname, joiIdentifier())
      } catch (_) {
        throw new ConfigurationError(
          `Directory name ${parsed.dirname} is not a valid module name (must be valid identifier). ` +
          `Please rename the directory or specify a module name in the garden.yml file.`,
          { dirname: parsed.dirname },
        )
      }
    }
  }

  return parsed
}
