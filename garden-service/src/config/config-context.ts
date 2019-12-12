/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi = require("@hapi/joi")
import username = require("username")
import { isString } from "lodash"
import { PrimitiveMap, isPrimitive, Primitive, joiIdentifierMap, joiStringMap, joiPrimitive } from "./common"
import { Provider, ProviderConfig } from "./provider"
import { ModuleConfig } from "./module"
import { ConfigurationError } from "../exceptions"
import { resolveTemplateString } from "../template-string"
import { Garden } from "../garden"
import { ModuleVersion } from "../vcs/vcs"
import { joi } from "../config/common"
import { KeyedSet } from "../util/keyed-set"
import { RuntimeContext } from "../runtime-context"

export type ContextKey = string[]

export interface ContextResolveOpts {
  allowUndefined?: boolean
  // a list of previously resolved paths, used to detect circular references
  stack?: string[]
}

export interface ContextResolveParams {
  key: ContextKey
  nodePath: ContextKey
  opts: ContextResolveOpts
}

export function schema(joiSchema: Joi.Schema) {
  return (target, propName) => {
    target.constructor._schemas = { ...(target.constructor._schemas || {}), [propName]: joiSchema }
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
    return joi
      .object()
      .keys(schemas)
      .required()
  }

  async resolve({ key, nodePath, opts }: ContextResolveParams): Promise<Primitive | undefined> {
    const path = key.join(".")
    const fullPath = nodePath.concat(key).join(".")

    // if the key has previously been resolved, return it directly
    const resolved = this._resolvedValues[path]

    if (resolved) {
      return resolved
    }

    opts.stack = [...(opts.stack || [])]

    if (opts.stack.includes(fullPath)) {
      throw new ConfigurationError(
        `Circular reference detected when resolving key ${path} (${opts.stack.join(" -> ")})`,
        {
          nodePath,
          fullPath,
          opts,
        }
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
        if (opts.stack.includes(stackEntry)) {
          throw new ConfigurationError(
            `Circular reference detected when resolving key ${stackEntry} (from ${opts.stack.join(" -> ")})`,
            {
              nodePath,
              fullPath,
              opts,
            }
          )
        }

        opts.stack.push(stackEntry)
        value = await value({ key: remainder, nodePath: nestedNodePath, opts })
      }

      // handle nested contexts
      if (value instanceof ConfigContext) {
        opts.stack.push(stackEntry)
        value = await value.resolve({ key: remainder, nodePath: nestedNodePath, opts })
        break
      }

      // handle templated strings in context variables
      if (isString(value)) {
        opts.stack.push(stackEntry)
        value = await resolveTemplateString(value, this._rootContext, opts)
      }

      if (value === undefined) {
        break
      }
    }

    if (value === undefined) {
      if (opts.allowUndefined) {
        return
      } else {
        throw new ConfigurationError(`Could not find key: ${fullPath}`, {
          nodePath,
          fullPath,
          opts,
        })
      }
    }

    if (!isPrimitive(value)) {
      throw new ConfigurationError(
        `Config value at '${path}' exists but is not a primitive (string, number, boolean or null)`,
        {
          value,
          path,
          fullPath,
        }
      )
    }

    this._resolvedValues[path] = value

    return value
  }
}

export class ScanContext extends ConfigContext {
  foundKeys: KeyedSet<string[]>

  constructor() {
    super()
    this.foundKeys = new KeyedSet<string[]>((v) => v.join("."))
  }

  async resolve({ key, nodePath }: ContextResolveParams) {
    const fullKey = nodePath.concat(key)
    this.foundKeys.add(fullKey)
    return "${" + fullKey.join(".") + "}"
  }
}

class LocalContext extends ConfigContext {
  @schema(
    joi
      .string()
      .description("The absolute path to the directory where exported artifacts from test and task runs are stored.")
      .example("/home/me/my-project/.garden/artifacts")
  )
  public artifactsPath: string

  @schema(
    joiStringMap(joi.string()).description(
      "A map of all local environment variables (see https://nodejs.org/api/process.html#process_process_env)."
    )
  )
  public env: typeof process.env

  @schema(
    joi
      .string()
      .description(
        "A string indicating the platform that the framework is running on " +
          "(see https://nodejs.org/api/process.html#process_process_platform)"
      )
      .example("posix")
  )
  public platform: string

  @schema(
    joi
      .string()
      .description("The current username (as resolved by https://github.com/sindresorhus/username)")
      .example("tenzing_norgay")
  )
  public username: () => Promise<string>

  constructor(root: ConfigContext, artifactsPath: string) {
    super(root)
    this.artifactsPath = artifactsPath
    this.env = process.env
    this.platform = process.platform
    this.username = async () => {
      const name = await username()
      if (name === undefined) {
        throw new ConfigurationError(`Could not resolve current username`, {})
      }
      return name
    }
  }
}

/**
 * This context is available for template strings under the `project` key in configuration files.
 */
export class ProjectConfigContext extends ConfigContext {
  @schema(
    LocalContext.getSchema().description(
      "Context variables that are specific to the currently running environment/machine."
    )
  )
  public local: LocalContext

  constructor(artifactsPath: string) {
    super()
    this.local = new LocalContext(this, artifactsPath)
  }
}

class ProjectContext extends ConfigContext {
  @schema(
    joi
      .string()
      .description("The name of the Garden project.")
      .example("my-project")
  )
  public name: string

  constructor(root: ConfigContext, name: string) {
    super(root)
    this.name = name
  }
}

class EnvironmentContext extends ConfigContext {
  @schema(
    joi
      .string()
      .description("The name of the environment Garden is running against.")
      .example("local")
  )
  public name: string

  constructor(root: ConfigContext, name: string) {
    super(root)
    this.name = name
  }
}

const providersExample = { kubernetes: { config: { clusterHostname: "my-cluster.example.com" } } }

class ProviderContext extends ConfigContext {
  @schema(
    joi
      .object()
      .description("The resolved configuration for the provider.")
      .example(providersExample.kubernetes)
  )
  public config: ProviderConfig

  @schema(
    joiIdentifierMap(joiPrimitive())
      .description("The outputs defined by the provider (see individual plugin docs for details).")
      .example({ "cluster-ip": "1.2.3.4" })
  )
  public outputs: PrimitiveMap

  constructor(root: ConfigContext, provider: Provider) {
    super(root)
    this.config = provider.config
    this.outputs = provider.status.outputs
  }
}

export class ProviderConfigContext extends ProjectConfigContext {
  @schema(
    EnvironmentContext.getSchema().description("Information about the environment that Garden is running against.")
  )
  public environment: EnvironmentContext

  @schema(ProjectContext.getSchema().description("Information about the Garden project."))
  public project: ProjectContext

  @schema(
    joiIdentifierMap(ProviderContext.getSchema())
      .description("Retrieve information about providers that are defined in the project.")
      .example(providersExample)
  )
  public providers: Map<string, ProviderContext>

  @schema(
    joiIdentifierMap(joiPrimitive())
      .description("A map of all variables defined in the project configuration.")
      .example({ "team-name": "bananaramallama", "some-service-endpoint": "https://someservice.com/api/v2" })
  )
  public variables: PrimitiveMap

  @schema(joiIdentifierMap(joiPrimitive()).description("Alias for the variables field."))
  public var: PrimitiveMap

  constructor(garden: Garden, resolvedProviders: Provider[], variables: PrimitiveMap) {
    super(garden.artifactsPath)
    const _this = this

    this.environment = new EnvironmentContext(this, garden.environmentName)
    this.project = new ProjectContext(this, garden.projectName)

    this.providers = new Map(
      resolvedProviders.map((p) => <[string, ProviderContext]>[p.name, new ProviderContext(_this, p)])
    )

    this.var = this.variables = variables
  }
}

const exampleOutputs = { endpoint: "http://my-service/path/to/endpoint" }
const exampleVersion = "v-17ad4cb3fd"

export class ModuleContext extends ConfigContext {
  @schema(
    joi
      .string()
      .required()
      .description("The build path of the module.")
      .example("/home/me/code/my-project/.garden/build/my-module")
  )
  public buildPath: string

  @schema(
    joiIdentifierMap(joiPrimitive())
      .required()
      .description(
        "The outputs defined by the module (see individual module type " +
          "[references](https://docs.garden.io/reference/module-types) for details)."
      )
      .example(exampleOutputs)
  )
  public outputs: PrimitiveMap

  @schema(
    joi
      .string()
      .required()
      .description("The local path of the module.")
      .example("/home/me/code/my-project/my-module")
  )
  public path: string

  @schema(
    joi
      .string()
      .required()
      .description("The current version of the module.")
      .example(exampleVersion)
  )
  public version: string

  constructor(root: ConfigContext, moduleConfig: ModuleConfig, buildPath: string, version: ModuleVersion) {
    super(root)
    this.buildPath = buildPath
    this.outputs = moduleConfig.outputs
    this.path = moduleConfig.path
    this.version = version.versionString
  }
}

const exampleModule = {
  buildPath: "/home/me/code/my-project/.garden/build/my-module",
  path: "/home/me/code/my-project/my-module",
  outputs: {},
  version: exampleVersion,
}

export class ServiceRuntimeContext extends ConfigContext {
  @schema(
    joiIdentifierMap(joiPrimitive())
      .required()
      .description(
        "The runtime outputs defined by the service (see individual module type " +
          "[references](https://docs.garden.io/reference/module-types) for details)."
      )
      .example({ "some-key": "some value" })
  )
  public outputs: PrimitiveMap

  constructor(root: ConfigContext, outputs: PrimitiveMap) {
    super(root)
    this.outputs = outputs
  }

  async resolve(params: ContextResolveParams) {
    // We're customizing the resolver so that we can ignore missing service/task outputs, but fail when an output
    // on a resolved service/task doesn't exist.
    const opts = { ...(params.opts || {}), allowUndefined: false }
    return super.resolve({ ...params, opts })
  }
}

export class TaskRuntimeContext extends ServiceRuntimeContext {
  @schema(
    joiIdentifierMap(joiPrimitive())
      .required()
      .description(
        "The runtime outputs defined by the task (see individual module type " +
          "[references](https://docs.garden.io/reference/module-types) for details)."
      )
      .example({ "some-key": "some value" })
  )
  public outputs: PrimitiveMap
}

class RuntimeConfigContext extends ConfigContext {
  @schema(
    joiIdentifierMap(ServiceRuntimeContext.getSchema())
      .required()
      .description("Runtime information from the services that the service/task being run depends on.")
      .example({ "my-service": { outputs: { "some-key": "some value" } } })
  )
  public services: Map<string, ServiceRuntimeContext>

  @schema(
    joiIdentifierMap(TaskRuntimeContext.getSchema())
      .required()
      .description("Runtime information from the tasks that the service/task being run depends on.")
      .example({ "my-task": { outputs: { "some-key": "some value" } } })
  )
  public tasks: Map<string, TaskRuntimeContext>

  constructor(root: ConfigContext, runtimeContext?: RuntimeContext) {
    super(root)

    this.services = new Map()
    this.tasks = new Map()

    const dependencies = runtimeContext ? runtimeContext.dependencies : []

    for (const dep of dependencies) {
      if (dep.type === "service") {
        this.services.set(dep.name, new ServiceRuntimeContext(this, dep.outputs))
      } else if (dep.type === "task") {
        this.tasks.set(dep.name, new TaskRuntimeContext(this, dep.outputs))
      }
    }
  }

  async resolve(params: ContextResolveParams) {
    // We're customizing the resolver so that we can ignore missing services/tasks and return the template string back
    // for later resolution, but fail when an output on a resolved service/task doesn't exist.
    const opts = { ...(params.opts || {}), allowUndefined: true }
    const res = await super.resolve({ ...params, opts })

    if (res === undefined) {
      const { key, nodePath } = params
      const fullKey = nodePath.concat(key)
      return "${" + fullKey.join(".") + "}"
    } else {
      return res
    }
  }
}

/**
 * This context is available for template strings under the `module` key in configuration files.
 * It is a superset of the context available under the `project` key.
 */
export class ModuleConfigContext extends ProviderConfigContext {
  @schema(
    joiIdentifierMap(ModuleContext.getSchema())
      .description("Retrieve information about modules that are defined in the project.")
      .example({ "my-module": exampleModule })
  )
  public modules: Map<string, () => Promise<ModuleContext>>

  @schema(
    RuntimeConfigContext.getSchema().description(
      "Runtime outputs and information from services and tasks " +
        "(only resolved at runtime when deploying services and running tasks)."
    )
  )
  public runtime: RuntimeConfigContext

  constructor(
    garden: Garden,
    resolvedProviders: Provider[],
    variables: PrimitiveMap,
    moduleConfigs: ModuleConfig[],
    // We only supply this when resolving configuration in dependency order.
    // Otherwise we pass `${runtime.*} template strings through for later resolution.
    runtimeContext?: RuntimeContext
  ) {
    super(garden, resolvedProviders, variables)

    const _this = this

    this.modules = new Map(
      moduleConfigs.map(
        (config) =>
          <[string, () => Promise<ModuleContext>]>[
            config.name,
            async (opts: ContextResolveOpts) => {
              // NOTE: This is a temporary hacky solution until we implement module resolution as a TaskGraph task
              const stackKey = "modules." + config.name
              const resolvedConfig = await garden.resolveModuleConfig(garden.log, config.name, {
                configContext: _this,
                ...opts,
                stack: [...(opts.stack || []), stackKey],
              })
              const version = await garden.resolveVersion(resolvedConfig, resolvedConfig.build.dependencies)
              const buildPath = await garden.buildDir.buildPath(config)

              return new ModuleContext(_this, resolvedConfig, buildPath, version)
            },
          ]
      )
    )

    this.runtime = new RuntimeConfigContext(this, runtimeContext)
  }
}
