/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import * as Joi from "joi"
import {
  flatten,
  set,
  uniq,
} from "lodash"
import { ConfigurationError } from "../exceptions"
import { PluginContext } from "../plugin-context"
import { DeployTask } from "../tasks/deploy"
import { TestTask } from "../tasks/test"
import {
  resolveTemplateStrings,
  TemplateStringContext,
} from "../template-string"
import { getNames } from "../util/util"
import {
  joiArray,
  joiEnvVars,
  joiIdentifier,
  joiVariables,
  PrimitiveMap,
  validate,
} from "./common"
import {
  RuntimeContext,
  Service,
  ServiceConfig,
  serviceOutputsSchema,
  ServiceSpec,
} from "./service"
import {
  TestConfig,
  TestSpec,
} from "./test"
import { pathToCacheContext } from "../cache"

export interface BuildCopySpec {
  source: string
  target: string
}

// TODO: allow : delimited string (e.g. some.file:some-dir/)
const copySchema = Joi.object()
  .keys({
    // TODO: allow array of strings here
    // TODO: disallow paths outside of the module root
    source: Joi.string().uri(<any>{ relativeOnly: true }).required()
      .description("POSIX-style path or filename of the directory or file(s) to copy to the target."),
    target: Joi.string().uri(<any>{ relativeOnly: true }).default("")
      .description(
        "POSIX-style path or filename to copy the directory or file(s) to (defaults to same as source path).",
    ),
  })

export interface BuildDependencyConfig {
  name: string
  plugin?: string
  copy: BuildCopySpec[]
}

export const buildDependencySchema = Joi.object().keys({
  name: joiIdentifier().required()
    .description("Module name to build ahead of this module"),
  plugin: joiIdentifier()
    .meta({ internal: true })
    .description("The name of plugin that provides the build dependency."),
  copy: joiArray(copySchema)
    .description("Specify one or more files or directories to copy from the built dependency to this module."),
})

export interface BuildConfig {
  // TODO: this should be a string array, to match other command specs
  command?: string,
  dependencies: BuildDependencyConfig[],
}

export interface ModuleSpec { }

export interface BaseModuleSpec {
  allowPush: boolean
  build: BuildConfig
  description?: string
  name: string
  path: string
  type: string
  variables: PrimitiveMap
}

export const baseModuleSpecSchema = Joi.object()
  .keys({
    type: joiIdentifier()
      .required()
      .description("The type of this module.")
      .example("container"),
    name: joiIdentifier()
      .default(() => null, "<name of module directory>"),
    description: Joi.string(),
    variables: joiVariables()
      .description("Variables that this module can reference and expose as environment variables.")
      .example({ "my-variable": "some-value" }),
    allowPush: Joi.boolean()
      .default(true)
      .description("Set to false to disable pushing this module to remote registries."),
    build: Joi.object().keys({
      command: Joi.string()
        .description("The command to run inside the module directory to perform the build.")
        .example("npm run build"),
      dependencies: joiArray(buildDependencySchema)
        .description("A list of modules that must be built before this module is built.")
        .example([{ name: "some-other-module-name" }]),
    })
      .default(() => ({ dependencies: [] }), "{}")
      .description("Specify how to build the module. Note that plugins may specify additional keys on this object."),
  })
  .required()
  .unknown(true)
  .description("Configure a module whose sources are located in this directory.")
  .meta({ extendable: true })

export interface ModuleConfig<T extends ModuleSpec = any> extends BaseModuleSpec {
  // Plugins can add custom fields that are kept here
  spec: T
}

export const moduleConfigSchema = baseModuleSpecSchema
  .keys({
    spec: Joi.object()
      .meta({ extendable: true })
      .description("The module spec, as defined by the provider plugin."),
  })
  .description("The configuration for a module.")

export interface ModuleConstructor<
  M extends ModuleSpec = ModuleSpec,
  S extends ServiceSpec = ServiceSpec,
  T extends TestSpec = TestSpec,
  > {
  new(ctx: PluginContext, config: ModuleConfig<M>, serviceConfigs: ServiceConfig<S>[], testConfigs: TestConfig<T>[])
    : Module<M, S, T>,
}

export class Module<
  M extends ModuleSpec = any,
  S extends ServiceSpec = any,
  T extends TestSpec = any,
  > {
  public readonly name: string
  public readonly type: string
  public readonly path: string

  public readonly spec: M
  public readonly services: ServiceConfig<S>[]
  public readonly tests: TestConfig<T>[]

  readonly _ConfigType: ModuleConfig<M>

  constructor(
    private ctx: PluginContext,
    public config: ModuleConfig<M>,
    serviceConfigs: ServiceConfig<S>[],
    testConfigs: TestConfig<T>[],
  ) {
    this.config = config
    this.spec = config.spec
    this.name = config.name
    this.type = config.type
    this.path = config.path
    this.services = serviceConfigs
    this.tests = testConfigs
  }

  async resolveConfig(context?: TemplateStringContext): Promise<Module<M, S, T>> {
    // TODO: allow referencing other module configs (non-trivial, need to save for later)
    const runtimeContext = await this.prepareRuntimeContext([])
    const templateContext = await this.ctx.getTemplateContext({
      ...context,
      ...runtimeContext,
    })
    const config = { ...this.config }

    config.build = await resolveTemplateStrings(config.build, templateContext)
    config.spec = await resolveTemplateStrings(config.spec, templateContext, { ignoreMissingKeys: true })
    config.variables = await resolveTemplateStrings(config.variables, templateContext)

    const services = await resolveTemplateStrings(this.services, templateContext, { ignoreMissingKeys: true })
    const tests = await resolveTemplateStrings(this.tests, templateContext, { ignoreMissingKeys: true })

    const cls = <typeof Module>Object.getPrototypeOf(this).constructor
    return new cls(this.ctx, config, services, tests)
  }

  updateConfig(key: string, value: any) {
    set(this.config, key, value)
  }

  getCacheContext() {
    return pathToCacheContext(this.path)
  }

  async getVersion(force?: boolean) {
    return this.ctx.getModuleVersion(this.name, force)
  }

  async getBuildPath() {
    return await this.ctx.getModuleBuildPath(this.name)
  }

  async getBuildDependencies(): Promise<Module[]> {
    // TODO: find a more elegant way of dealing with plugin module dependencies
    const names = this.config.build.dependencies.map(
      dep => dep.plugin ? `${dep.plugin}--${dep.name}` : dep.name,
    )
    return this.ctx.getModules(names)
  }

  async getServices(): Promise<Service[]> {
    const serviceNames = getNames(this.services)
    return this.ctx.getServices(serviceNames)
  }

  async getServiceDependencies(): Promise<Service[]> {
    const depNames: string[] = uniq(flatten(this.services
      .map(serviceConfig => serviceConfig.dependencies)
      .filter(deps => deps)))

    return this.ctx.getServices(depNames)
  }

  async getDeployTasks(
    { force = false, forceBuild = false }: { force?: boolean, forceBuild?: boolean },
  ): Promise<DeployTask[]> {
    const services = await this.getServices()
    const module = this

    return Bluebird.map(services, async (service) => {
      return DeployTask.factory({ ctx: module.ctx, service, force, forceBuild })
    })
  }

  async getTestTasks(
    { name, force = false, forceBuild = false }: { name?: string, force?: boolean, forceBuild?: boolean },
  ) {
    const tasks: Promise<TestTask>[] = []

    for (const test of this.tests) {
      if (name && test.name !== name) {
        continue
      }
      tasks.push(TestTask.factory({
        force,
        forceBuild,
        testConfig: test,
        ctx: this.ctx,
        module: this,
      }))
    }

    return Bluebird.all(tasks)
  }

  async prepareRuntimeContext(
    serviceDependencies: Service<any>[], extraEnvVars: PrimitiveMap = {},
  ): Promise<RuntimeContext> {
    const buildDependencies = await this.getBuildDependencies()
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

    for (const module of buildDependencies) {
      deps[module.name] = {
        version: (await module.getVersion()).versionString,
        outputs: {},
      }
    }

    for (const dep of serviceDependencies) {
      if (!deps[dep.name]) {
        deps[dep.name] = {
          version: (await dep.module.getVersion()).versionString,
          outputs: {},
        }
      }
      const depContext = deps[dep.name]

      const outputs = { ...await this.ctx.getServiceOutputs({ serviceName: dep.name }), ...dep.config.outputs }
      const serviceEnvName = dep.getEnvVarName()

      validate(outputs, serviceOutputsSchema, { context: `outputs for service ${dep.name}` })

      for (const [key, value] of Object.entries(outputs)) {
        const envVarName = `GARDEN_SERVICES_${serviceEnvName}_${key}`.toUpperCase()

        envVars[envVarName] = value
        depContext.outputs[key] = value
      }
    }

    return {
      envVars,
      dependencies: deps,
      module: {
        name: this.name,
        type: this.type,
        version: versionString,
      },
    }
  }
}

export type ModuleConfigType<M extends Module> = M["_ConfigType"]
