/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import { identifierRegex, joiIdentifier, joiVariables, PrimitiveMap } from "./common"
import { ConfigurationError } from "../exceptions"
import Bluebird = require("bluebird")
import { GardenContext } from "../context"
import { ServiceConfig } from "./service"
import { resolveTemplateStrings, TemplateStringContext } from "../template-string"
import { Memoize } from "typescript-memoize"
import { BuildResult, BuildStatus } from "./plugin"

export interface BuildDependencyConfig {
  name: string,
  copy?: string[],
  copyDestination?: string // TODO: if we stick with this format, make mandatory if copy is provided
}

export interface BuildConfig {
  // TODO: this should be a string array, to match other command specs
  command?: string,
  dependencies: BuildDependencyConfig[],
}

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

  constructor(private ctx: GardenContext, private config: T) {
    this.name = config.name
    this.type = config.type
    this.path = config.path
    this.services = config.services
  }

  @Memoize()
  async getConfig(context?: TemplateStringContext): Promise<T> {
    // TODO: allow referencing other module configs (non-trivial, need to save for later)
    const templateContext = await this.ctx.getTemplateContext(context)
    const config = this.config

    return <T>{
      build: await resolveTemplateStrings(config.build, templateContext),
      description: config.description,
      name: config.name,
      path: config.path,
      // service configs are resolved separately in the Service class
      services: config.services,
      test: await resolveTemplateStrings(config.test, templateContext),
      type: config.type,
      variables: await resolveTemplateStrings(config.variables, templateContext),
    }
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
    return await this.ctx.getModuleBuildPath(this)
  }

  async getBuildStatus(): Promise<BuildStatus> {
    return this.ctx.getModuleBuildStatus(this)
  }

  async build(): Promise<BuildResult> {
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
