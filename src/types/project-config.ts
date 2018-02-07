import { readFileSync } from "fs"
import { join } from "path"
import { extend } from "lodash"
import * as yaml from "js-yaml"
import * as Joi from "joi"
import { identifierRegex, joiIdentifier, joiPrimitive, Primitive } from "./common"
import { ConfigurationError } from "../exceptions"

const PROJECT_CONFIG_FILENAME = "garden-project.yml"

const defaultEnvironments = {
  local: {
    providers: {
      generic: {
        type: "generic",
      },
      containers: {
        type: "kubernetes",
        context: "docker-for-desktop",
      },
    },
  },
}

export interface ProviderConfig {
  type: string
  name?: string
}

export interface EnvironmentConfig {
  providers: { [key: string]: ProviderConfig }
}

export interface ProjectConfig {
  version: string
  name: string
  environments: { [key: string]: EnvironmentConfig }
  variables: { [key: string]: Primitive }
}

export const providerConfigBase = Joi.object().keys({
  type: joiIdentifier().required(),
}).unknown(true)

const baseSchema = Joi.object().keys({
  version: Joi.string().default("0").only("0"),
  name: joiIdentifier().required(),
  environments: Joi.object().pattern(identifierRegex, Joi.object().keys({
    providers: Joi.object().pattern(identifierRegex, providerConfigBase),
  })).default(() => extend({}, defaultEnvironments), JSON.stringify(defaultEnvironments)),
  variables: Joi.object().pattern(/[\w\d]+/i, joiPrimitive()).default(() => ({}), "{}"),
}).required()

export function loadProjectConfig(projectRoot: string): ProjectConfig {
  const path = join(projectRoot, PROJECT_CONFIG_FILENAME)
  let fileData
  let config

  try {
    fileData = readFileSync(path)
  } catch (err) {
    throw new ConfigurationError(`Could not find ${PROJECT_CONFIG_FILENAME} in project root ${projectRoot}`, err)
  }

  try {
    config = yaml.safeLoad(fileData)
  } catch (err) {
    throw new ConfigurationError(`Could not parse ${PROJECT_CONFIG_FILENAME} as valid YAML`, err)
  }

  const parsed = Joi.attempt(config || {}, baseSchema)

  // we include the default local environment unless explicitly overridden
  parsed.environments = extend({}, defaultEnvironments, parsed.environments)

  return parsed
}
