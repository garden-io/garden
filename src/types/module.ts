/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import { ServiceMap } from "../garden"
import { PluginContext } from "../plugin-context"
import { DeployTask } from "../tasks/deploy"
import { TestTask } from "../tasks/test"
import {
  identifierRegex,
  joiEnvVars,
  joiIdentifier,
  joiPrimitive,
  joiVariables,
  PrimitiveMap,
  validate,
} from "./common"
import { ConfigurationError } from "../exceptions"
import Bluebird = require("bluebird")
import {
  extend,
  keys,
  set,
  values,
} from "lodash"
import {
  RuntimeContext,
  Service,
  ServiceConfig,
} from "./service"
import { resolveTemplateStrings, TemplateStringContext } from "../template-string"
import { Memoize } from "typescript-memoize"
import { TreeVersion } from "../vcs/base"

export interface BuildCopySpec {
  source: string
  target: string
}

// TODO: allow : delimited string (e.g. some.file:some-dir/)
const copySchema = Joi.object().keys({
  // TODO: allow array of strings here
  source: Joi.string().uri(<any>{ relativeOnly: true }).required(),
  target: Joi.string().uri(<any>{ relativeOnly: true }).default(""),
})

export interface BuildDependencyConfig {
  name: string
  copy: BuildCopySpec[]
}

export interface BuildConfig {
  // TODO: this should be a string array, to match other command specs
  command?: string,
  dependencies: BuildDependencyConfig[],
}

const serviceOutputsSchema = Joi.object().pattern(/.+/, joiPrimitive())

export interface TestSpec {
  command: string[]
  dependencies: string[]
  variables: PrimitiveMap
  timeout?: number
}

export interface TestConfig {
  [group: string]: TestSpec
}

export interface ModuleConfig<T extends ServiceConfig = ServiceConfig> {
  allowPush: boolean
  build: BuildConfig
  description?: string
  name: string
  path: string
  services: { [name: string]: T }
  test: TestConfig
  type: string
  variables: PrimitiveMap
}

export class Module<T extends ModuleConfig = ModuleConfig> {
  public name: string
  public type: string
  public path: string
  public services: T["services"]

  private _buildDependencies: Module[]

  _ConfigType: T

  constructor(private ctx: PluginContext, private config: T) {
    this.name = config.name
    this.type = config.type
    this.path = config.path
    this.services = config.services
  }

  @Memoize()
  async getConfig(context?: TemplateStringContext): Promise<ModuleConfig> {
    // TODO: allow referencing other module configs (non-trivial, need to save for later)
    const templateContext = await this.ctx.getTemplateContext(context)
    const config = <T>extend({}, this.config)

    config.build = await resolveTemplateStrings(config.build, templateContext)
    config.test = await resolveTemplateStrings(config.test, templateContext)
    config.variables = await resolveTemplateStrings(config.variables, templateContext)

    return config
  }

  updateConfig(key: string, value: any) {
    set(this.config, key, value)
  }

  async getVersion(): Promise<TreeVersion> {
    const treeVersion = await this.ctx.vcs.getTreeVersion([this.path])

    const versionChain: TreeVersion[] = await Bluebird.map(
      await this.getBuildDependencies(),
      async (m: Module) => await m.getVersion(),
    )
    versionChain.push(treeVersion)

    // The module version is the latest of any of the dependency modules or itself.
    const sortedVersions = await this.ctx.vcs.sortVersions(versionChain)

    return sortedVersions[0]
  }

  async getBuildPath() {
    return await this.ctx.getModuleBuildPath(this)
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

  async getServices(): Promise<ServiceMap> {
    const serviceNames = keys(this.services || {})
    return this.ctx.getServices(serviceNames)
  }

  async getDeployTasks(
    { force = false, forceBuild = false }: { force?: boolean, forceBuild?: boolean },
  ): Promise<DeployTask<Service>[]> {
    const services = await this.getServices()
    const module = this

    return values(services).map(s => new DeployTask(module.ctx, s, force, forceBuild))
  }

  async getTestTasks(
    { group, force = false, forceBuild = false }: { group?: string, force?: boolean, forceBuild?: boolean },
  ) {
    const tasks: TestTask<Module<T>>[] = []
    const config = await this.getConfig()

    for (const testName of Object.keys(config.test)) {
      if (group && testName !== group) {
        continue
      }
      const testSpec = config.test[testName]
      tasks.push(new TestTask<Module<T>>(this.ctx, this, testName, testSpec, force, forceBuild))
    }

    return tasks
  }

  async prepareRuntimeContext(dependencies: Service<any>[], extraEnvVars: PrimitiveMap = {}): Promise<RuntimeContext> {
    const { versionString } = await this.getVersion()
    const envVars = {
      GARDEN_VERSION: versionString,
    }

    validate(extraEnvVars, joiEnvVars(), { context: `environment variables for module ${this.name}` })

    for (const [envVarName, value] of Object.entries(extraEnvVars)) {
      if (envVarName.startsWith("GARDEN")) {
        throw new ConfigurationError(`Environment variable name cannot start with "GARDEN"`, {
          envVarName,
        })
      }
      envVars[envVarName] = value
    }

    for (const [key, value] of Object.entries(this.ctx.config.variables)) {
      const envVarName = `GARDEN_VARIABLES_${key.replace(/-/g, "_").toUpperCase()}`
      envVars[envVarName] = value
    }

    const deps = {}

    for (const dep of dependencies) {
      const depContext = deps[dep.name] = {
        version: versionString,
        outputs: {},
      }

      const outputs = await this.ctx.getServiceOutputs(dep)
      const serviceEnvName = dep.getEnvVarName()

      validate(outputs, serviceOutputsSchema, { context: `outputs for service ${dep.name}` })

      for (const [key, value] of Object.entries(outputs)) {
        const envVarName = `GARDEN_SERVICES_${serviceEnvName}_${key}`.toUpperCase()

        envVars[envVarName] = value
        depContext.outputs[key] = value
      }
    }

    return { envVars, dependencies: deps }
  }
}

export type ModuleConfigType<T extends Module> = T["_ConfigType"]

export const baseServiceSchema = Joi.object()
  .keys({
    dependencies: Joi.array().items((joiIdentifier())).default(() => [], "[]"),
  })
  .options({ allowUnknown: true })

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
  copy: Joi.array().items(copySchema).default(() => [], "[]"),
})

export const baseModuleSchema = Joi.object().keys({
  type: joiIdentifier().required(),
  name: joiIdentifier(),
  description: Joi.string(),
  variables: joiVariables(),
  services: baseServicesSchema,
  allowPush: Joi.boolean()
    .default(true, "Set to false to disable pushing this module to remote registries"),
  build: Joi.object().keys({
    command: Joi.string(),
    dependencies: Joi.array().items(baseDependencySchema).default(() => [], "[]"),
  }).default(() => ({ dependencies: [] }), "{}"),
  test: Joi.object().pattern(/[\w\d]+/i, baseTestSpecSchema).default(() => ({}), "{}"),
}).required().unknown(true)
