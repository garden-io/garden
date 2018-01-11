import { readFileSync } from "fs"
import * as path from "path"
import * as yaml from "js-yaml"
import * as Joi from "joi"
import { JoiIdentifier, JoiLiteral, SimpleLiteral } from "./common"
import { ConfigurationError } from "../exceptions"
import { MODULE_CONFIG_FILENAME } from "../constants"

export interface ModuleConfig {
  version: string
  description?: string
  path: string
  name: string
  type: string
  constants: { [key: string]: SimpleLiteral }
  build?: {
    dependencies?: string[],
  }
}

const baseSchema = Joi.object().keys({
  version: Joi.string().default("0").only("0"),
  type: JoiIdentifier().required(),
  name: JoiIdentifier().required(),
  constants: Joi.object().pattern(/\w\d/i, JoiLiteral()).default(() => {}, "{}"),
  build: Joi.object().keys({
    dependencies: Joi.array().items(JoiIdentifier()),
  }),
}).required()

export async function loadModuleConfig(modulePath: string): Promise<ModuleConfig> {
  const absPath = path.join(modulePath, MODULE_CONFIG_FILENAME)
  let fileData
  let config

  try {
    fileData = readFileSync(absPath)
  } catch (err) {
    throw new ConfigurationError(`Could not find ${MODULE_CONFIG_FILENAME} in module directory ${modulePath}`, err)
  }

  try {
    config = yaml.safeLoad(fileData)
  } catch (err) {
    throw new ConfigurationError(`Could not parse ${MODULE_CONFIG_FILENAME} as valid YAML`, err)
  }

  // name can be derived from the directory name
  if (!config.name) {
    config.name = path.parse(absPath).dir.split(path.sep).slice(-1)[0]
  }

  config.path = modulePath

  return <ModuleConfig>baseSchema.validate(config).value
}
