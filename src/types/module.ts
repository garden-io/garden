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

interface BuildDependencyConfig {
  name: string,
  copy?: string[],
  copyDestination?: string // TODO: if we stick with this format, make mandatory if copy is provided
}

interface BuildConfig {
  // TODO: this should be a string array, to match other command specs
  command?: string,
  dependencies: BuildDependencyConfig[],
}

export interface TestSpec {
  command: string[]
  dependencies: string[]
  variables: Variables
  timeout?: number
}

interface TestConfig {
  [group: string]: TestSpec
}

class ModuleConfigBase {
  path: string
  version: string
  description?: string
  name: string
  type: string
  variables: Variables
  build: BuildConfig
  test: TestConfig
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

  _ConfigType: T

  constructor(private ctx: GardenContext, public config: T) {
    this.name = config.name
    this.type = config.type
    this.path = config.path
    this.services = config.services
  }

  async getVersion() {
    const treeVersion = await this.ctx.vcs.getTreeVersion([this.path])

    const versionChain = await Bluebird.map(
      await this.getBuildDependencies(),
      async (m: Module) => await m.getVersion(),
    )
    versionChain.push(treeVersion)

    // The module version is the latest of any of the dependency modules or itself.
    const sortedVersions = await this.ctx.vcs.sortVersions(versionChain)

    return sortedVersions[0]
  }

  async getBuildPath() {
    return this.ctx.getModuleBuildPath(this)
  }

  async getBuildStatus() {
    return this.ctx.getModuleBuildStatus(this)
  }

  async build() {
    return this.ctx.buildModule(this)
  }

  async getBuildDependencies(): Promise<Module[]> {
    if (this._buildDependencies) {
      return this._buildDependencies
    }

    // TODO: Detect circular dependencies
    const modules = await this.ctx.getModules()
    const deps: Module[] = []

    for (let dependencyConfig of this.config.build.dependencies) {
      const dependencyName = dependencyConfig.name
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

export type ModuleConfigType<T extends Module> = T["_ConfigType"]

export const baseServiceSchema = Joi.object().keys({
  dependencies: Joi.array().items((joiIdentifier())).default(() => [], "[]"),
})

export const baseServicesSchema = Joi.object()
  .pattern(identifierRegex, baseServiceSchema)
  .default(() => ({}), "{}")

export const baseTestSpecSchema = Joi.object().keys({
  command: Joi.array().items(Joi.string()).required(),
  dependencies: Joi.array().items(Joi.string()).default(() => [], "[]"),
  variables: joiVariables(),
  timeout: Joi.number(),
})

export const baseDependencySchema = Joi.object().keys({
  name: joiIdentifier().required(),
  copy: Joi.array(),
  copyDestination: Joi.string(),
})

export const baseModuleSchema = Joi.object().keys({
  version: Joi.string().default("0").only("0"),
  type: joiIdentifier().required(),
  name: joiIdentifier(),
  description: Joi.string(),
  variables: joiVariables(),
  services: baseServicesSchema,
  build: Joi.object().keys({
    command: Joi.string(),
    dependencies: Joi.array().items(baseDependencySchema).default(() => [], "[]"),
  }).default(() => ({ dependencies: [] }), "{}"),
  test: Joi.object().pattern(/[\w\d]+/i, baseTestSpecSchema).default(() => ({}), "{}"),
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

  /*
    We allow specifying modules by name only as a shorthand:

      dependencies:
        foo-module
        name: foo-module // same as the above
   */
  if (config.build && config.build.dependencies) {
    config.build.dependencies = config.build.dependencies
      .map(dep => (typeof dep) === "string" ? { name: dep } : dep)
  }

  const result = baseModuleSchema.validate(config, { allowUnknown: true })

  if (result.error) {
    throw result.error
  }

  return result.value
}
