/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { isString, flatten } from "lodash"
import { Module } from "../types/module"
import { PrimitiveMap, isPrimitive, Primitive, joiIdentifierMap, joiStringMap, joiPrimitive } from "./common"
import { ProviderConfig, EnvironmentConfig, providerConfigBase } from "./project"
import { PluginContext } from "../plugin-context"
import { ModuleConfig } from "./module"
import { ConfigurationError } from "../exceptions"
import { Service } from "../types/service"
import { resolveTemplateString } from "../template-string"
import * as Joi from "joi"

export type ContextKey = string[]

export interface ContextResolveParams {
  key: ContextKey
  nodePath: ContextKey
  // a list of previously resolved paths, used to detect circular references
  stack?: string[]
}

export function schema(joiSchema: Joi.Schema) {
  return (target, propName) => {
    target.constructor._schemas = { ...target.constructor._schemas || {}, [propName]: joiSchema }
  }
}

// Note: we're using classes here to be able to use decorators to describe each context node and key
export abstract class ConfigContext {
  private readonly _rootContext: ConfigContext
  private readonly _resolvedValues: { [path: string]: string }

  constructor(rootContext?: ConfigContext) {
    this._rootContext = rootContext || this
    this._resolvedValues = {}
  }

  static getSchema() {
    const schemas = (<any>this)._schemas
    return Joi.object().keys(schemas).required()
  }

  async resolve({ key, nodePath, stack }: ContextResolveParams): Promise<Primitive> {
    const path = key.join(".")
    const fullPath = nodePath.concat(key).join(".")

    // if the key has previously been resolved, return it directly
    const resolved = this._resolvedValues[path]

    if (resolved) {
      return resolved
    }

    stack = [...stack || []]

    if (stack.includes(fullPath)) {
      throw new ConfigurationError(
        `Circular reference detected when resolving key ${path} (${stack.join(" -> ")})`,
        {
          nodePath,
          fullPath,
          stack,
        },
      )
    }

    // keep track of which resolvers have been called, in order to detect circular references
    let value: any = this

    for (let p = 0; p < key.length; p++) {
      const nextKey = key[p]
      const lookupPath = key.slice(0, p + 1)
      const remainder = key.slice(p + 1)
      const nestedNodePath = nodePath.concat(lookupPath)
      const stackEntry = nestedNodePath.join(".")

      if (nextKey.startsWith("_")) {
        value = undefined
      } else {
        value = value instanceof Map ? value.get(nextKey) : value[nextKey]
      }

      if (typeof value === "function") {
        // call the function to resolve the value, then continue
        value = await value()
      }

      // handle nested contexts
      if (value instanceof ConfigContext) {
        const nestedKey = remainder
        stack.push(stackEntry)
        value = await value.resolve({ key: nestedKey, nodePath: nestedNodePath, stack })
        break
      }

      // handle templated strings in context variables
      if (isString(value)) {
        stack.push(stackEntry)
        value = await resolveTemplateString(value, this._rootContext, stack)
      }

      if (value === undefined) {
        break
      }
    }

    if (value === undefined) {
      throw new ConfigurationError(`Could not find key: ${path}`, {
        nodePath,
        fullPath,
        stack,
      })
    }

    if (!isPrimitive(value)) {
      throw new ConfigurationError(
        `Config value at ${path} exists but is not a primitive (string, number or boolean)`,
        {
          value,
          path,
          fullPath,
          context,
        },
      )
    }

    this._resolvedValues[path] = value
    return value
  }
}

class LocalContext extends ConfigContext {
  @schema(
    joiStringMap(Joi.string()).description(
      "A map of all local environment variables (see https://nodejs.org/api/process.html#process_process_env).",
    ),
  )
  public env: typeof process.env

  @schema(
    Joi.string()
      .description(
        "A string indicating the platform that the framework is running on " +
        "(see https://nodejs.org/api/process.html#process_process_platform)",
    )
      .example("posix"),
  )
  public platform: string

  constructor(root: ConfigContext) {
    super(root)
    this.env = process.env
    this.platform = process.platform
  }
}

/**
 * This context is available for template strings under the `project` key in configuration files.
 */
export class ProjectConfigContext extends ConfigContext {
  @schema(LocalContext.getSchema())
  public local: LocalContext

  constructor() {
    super()
    this.local = new LocalContext(this)
  }
}

class EnvironmentContext extends ConfigContext {
  @schema(
    Joi.string()
      .description("The name of the environment Garden is running against.")
      .example("local"),
  )
  public name: string

  constructor(root: ConfigContext, name: string) {
    super(root)
    this.name = name
  }
}

const exampleVersion = "v17ad4cb3fd"

class ModuleContext extends ConfigContext {
  @schema(Joi.string().description("The local path of the module.").example("/home/me/code/my-project/my-module"))
  public path: string

  @schema(Joi.string().description("The current version of the module.").example(exampleVersion))
  public version: string

  constructor(root: ConfigContext, module: Module) {
    super(root)
    this.path = module.path
    this.version = module.version.versionString
  }
}

const exampleOutputs = { endpoint: "http://my-service/path/to/endpoint" }

class ServiceContext extends ConfigContext {
  @schema(
    joiIdentifierMap(joiPrimitive()
      .description("The outputs defined by the service (see individual plugins for details).")
      .example(exampleOutputs),
    ))
  public outputs: PrimitiveMap

  @schema(Joi.string().description("The current version of the service.").example(exampleVersion))
  public version: string

  // TODO: add endpoints

  constructor(root: ConfigContext, service: Service, outputs: PrimitiveMap) {
    super(root)
    this.outputs = outputs
    this.version = service.module.version.versionString
  }
}

/**
 * This context is available for template strings under the `module` key in configuration files.
 * It is a superset of the context available under the `project` key.
 */
export class ModuleConfigContext extends ProjectConfigContext {
  @schema(
    EnvironmentContext.getSchema()
      .description("Information about the environment that Garden is running against."),
  )
  public environment: EnvironmentContext

  @schema(
    joiIdentifierMap(ModuleContext.getSchema())
      .description("Retrieve information about modules that are defined in the project.")
      .example({ "my-module": { path: "/home/me/code/my-project/my-module", version: exampleVersion } }),
  )
  public modules: Map<string, () => Promise<ModuleContext>>

  @schema(
    joiIdentifierMap(ServiceContext.getSchema())
      .description("Retrieve information about services that are defined in the project.")
      .example({ "my-service": { outputs: exampleOutputs, version: exampleVersion } }),
  )
  public services: Map<string, () => Promise<ServiceContext>>

  @schema(
    joiIdentifierMap(providerConfigBase)
      .description("A map of all configured plugins/providers for this environment and their configuration.")
      .example({ kubernetes: { name: "local-kubernetes", context: "my-kube-context" } }),
  )
  public providers: Map<string, ProviderConfig>

  // NOTE: This has some negative performance implications and may not be something we want to support,
  //       so I'm disabling this feature for now.
  //
  // @description("Use this to look up values that are configured in the current environment.")
  // public config: RemoteConfigContext

  @schema(
    joiIdentifierMap(joiPrimitive())
      .description("A map of all variables defined in the project configuration.")
      .example({ "team-name": "bananaramallama", "some-service-endpoint": "https://someservice.com/api/v2" }),
  )
  public variables: PrimitiveMap

  constructor(
    ctx: PluginContext,
    environmentConfig: EnvironmentConfig,
    moduleConfigs: ModuleConfig[],
  ) {
    super()

    const _this = this

    this.environment = new EnvironmentContext(_this, environmentConfig.name)

    this.modules = new Map(moduleConfigs.map((config) =>
      <[string, () => Promise<ModuleContext>]>[config.name, async () => {
        const module = await ctx.getModule(config.name)
        return new ModuleContext(_this, module)
      }],
    ))

    const serviceNames = flatten(moduleConfigs.map(m => m.serviceConfigs)).map(s => s.name)

    this.services = new Map(serviceNames.map((name) =>
      <[string, () => Promise<ServiceContext>]>[name, async () => {
        const service = await ctx.getService(name)
        const outputs = {
          ...service.config.outputs,
          ...await ctx.getServiceOutputs({ serviceName: service.name }),
        }
        return new ServiceContext(_this, service, outputs)
      }],
    ))

    this.providers = new Map(environmentConfig.providers.map(p => <[string, ProviderConfig]>[p.name, p]))

    // this.config = new SecretsContextNode(ctx)

    this.variables = environmentConfig.variables
  }
}

// class RemoteConfigContext extends ConfigContext {
//   constructor(private ctx: PluginContext) {
//     super()
//   }

//   async resolve({ key }: ResolveParams) {
//     const { value } = await this.ctx.getConfig({ key })
//     return value === null ? undefined : value
//   }
// }
