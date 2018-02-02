import { readFileSync } from "fs"
import * as yaml from "js-yaml"
import * as Joi from "joi"
import { identifierRegex, joiIdentifier, joiVariables, Primitive } from "./common"
import { ConfigurationError } from "../exceptions"
import { MODULE_CONFIG_FILENAME } from "../constants"
import { join, parse, sep } from "path"
import Bluebird = require("bluebird")
import { GardenContext } from "../context"

interface Variables { [key: string]: Primitive }

interface BuildConfig {
  command?: string,
  dependencies: string[],
}

class ModuleConfigBase {
  path: string
  version: string
  description?: string
  name: string
  type: string
  variables: Variables
  build: BuildConfig
  // further defined by subclasses
  services: { [name: string]: object }
}

export interface ModuleConfig extends ModuleConfigBase { }

export class Module<T extends ModuleConfig = ModuleConfig> {
  public name: string
  public type: string
  public path: string
  public services: { [name: string]: object }

  private _buildDependencies: Module[]

  constructor(private context: GardenContext, public config: T) {
    this.name = config.name
    this.type = config.type
    this.path = config.path
    this.services = config.services
  }

  async getVersion() {
    const treeVersion = await this.context.vcs.getTreeVersion([this.path])

    const versionChain = await Bluebird.map(
      await this.getBuildDependencies(),
      async (m: Module) => await m.getVersion(),
    )
    versionChain.push(treeVersion)

    // The module version is the latest of any of the dependency modules or itself.
    const sortedVersions = await this.context.vcs.sortVersions(versionChain)

    return sortedVersions[0]
  }

  async getBuildStatus() {
    const handler = this.context.getActionHandler("getModuleBuildStatus", this.type)
    return handler(this)
  }

  async build() {
    const handler = this.context.getActionHandler("buildModule", this.type)
    return handler(this)
  }

  async getBuildDependencies(): Promise<Module[]> {
    if (this._buildDependencies) {
      return this._buildDependencies
    }

    // TODO: Detect circular dependencies
    const modules = await this.context.getModules()
    const deps: Module[] = []

    for (let dependencyName of this.config.build.dependencies) {
      const dependency = modules[dependencyName]

      if (!dependency) {
        throw new ConfigurationError(`Module ${this.name} dependency ${dependencyName} not found`, {
          module,
          dependencyName,
        })
      }

      deps.push(dependency)
    }

    this._buildDependencies = deps

    return deps
  }
}

export const baseServiceSchema = Joi.object().keys({
  dependencies: Joi.array().items((joiIdentifier())).default(() => [], "[]"),
})

export const baseServicesSchema = Joi.object()
  .pattern(identifierRegex, baseServiceSchema)
  .default(() => ({}), "{}")

export const baseModuleSchema = Joi.object().keys({
  version: Joi.string().default("0").only("0"),
  type: joiIdentifier().required(),
  name: joiIdentifier(),
  description: Joi.string(),
  variables: joiVariables(),
  services: baseServicesSchema,
  build: Joi.object().keys({
    command: Joi.string(),
    dependencies: Joi.array().items(joiIdentifier()).default(() => [], "[]"),
  }).default(() => ({ dependencies: [] }), "{}"),
}).required()

export async function loadModuleConfig(modulePath: string): Promise<ModuleConfig> {
  // TODO: nicer error messages when load/validation fails
  const absPath = join(modulePath, MODULE_CONFIG_FILENAME)
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

  // name is derived from the directory name unless explicitly set
  if (!config.name) {
    config.name = Joi.attempt(parse(absPath).dir.split(sep).slice(-1)[0], joiIdentifier())
  }

  config.path = modulePath

  const result = baseModuleSchema.validate(config, { allowUnknown: true })

  if (result.error) {
    throw result.error
  }

  return result.value
}
