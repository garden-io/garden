/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi from "@hapi/joi"
import chalk from "chalk"
import { isString, fromPairs } from "lodash"
import { PrimitiveMap, joiIdentifierMap, joiStringMap, joiPrimitive, DeepPrimitiveMap, joiVariables } from "./common"
import { Provider, ProviderConfig } from "./provider"
import { ConfigurationError } from "../exceptions"
import { resolveTemplateString } from "../template-string"
import { Garden } from "../garden"
import { joi } from "../config/common"
import { KeyedSet } from "../util/keyed-set"
import { RuntimeContext } from "../runtime-context"
import { deline } from "../util/string"
import { getProviderUrl, getModuleTypeUrl } from "../docs/common"
import { Module } from "../types/module"
import { ModuleConfig } from "./module"
import { ModuleVersion } from "../vcs/vcs"

export type ContextKey = string[]

export interface ContextResolveOpts {
  // Allow templates to be partially resolved (used to defer runtime template resolution, for example)
  allowPartial?: boolean
  // Allow undefined values to be returned without throwing an error
  allowUndefined?: boolean
  // a list of previously resolved paths, used to detect circular references
  stack?: string[]
}

export interface ContextResolveParams {
  key: ContextKey
  nodePath: ContextKey
  opts: ContextResolveOpts
}

export interface ContextResolveOutput {
  message?: string
  partial?: boolean
  resolved: any
}

export function schema(joiSchema: Joi.Schema) {
  return (target: any, propName: string) => {
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

  resolve({ key, nodePath, opts }: ContextResolveParams): ContextResolveOutput {
    const path = key.join(".")
    const fullPath = nodePath.concat(key).join(".")

    // if the key has previously been resolved, return it directly
    const resolved = this._resolvedValues[path]

    if (resolved) {
      return { resolved }
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
    let partial = false
    let nextKey = key[0]
    let lookupPath: string[] = []
    let nestedNodePath = nodePath

    for (let p = 0; p < key.length; p++) {
      nextKey = key[p]
      lookupPath = key.slice(0, p + 1)
      const remainder = key.slice(p + 1)
      nestedNodePath = nodePath.concat(lookupPath)
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
        value = value({ key: remainder, nodePath: nestedNodePath, opts })
      }

      // handle nested contexts
      if (value instanceof ConfigContext) {
        if (remainder.length > 0) {
          opts.stack.push(stackEntry)
          const res = value.resolve({ key: remainder, nodePath: nestedNodePath, opts })
          value = res.resolved
          partial = !!res.partial
        }
        break
      }

      // handle templated strings in context variables
      if (isString(value)) {
        opts.stack.push(stackEntry)
        value = resolveTemplateString(value, this._rootContext, opts)
      }

      if (value === undefined) {
        break
      }
    }

    if (value === undefined) {
      let message = chalk.red(`Could not find key ${chalk.white(nextKey)}`)
      if (nestedNodePath.length > 1) {
        message += chalk.red(" under ") + chalk.white(nestedNodePath.slice(0, -1).join("."))
      }
      message += chalk.red(".")

      if (opts.allowUndefined) {
        return { resolved: undefined, message }
      } else {
        throw new ConfigurationError(message, {
          nodePath,
          fullPath,
          opts,
        })
      }
    }

    // Cache result, unless it is a partial resolution
    if (!partial) {
      this._resolvedValues[path] = value
    }

    return { resolved: value }
  }
}

export class ScanContext extends ConfigContext {
  foundKeys: KeyedSet<string[]>

  constructor() {
    super()
    this.foundKeys = new KeyedSet<string[]>((v) => v.join("."))
  }

  resolve({ key, nodePath }: ContextResolveParams) {
    const fullKey = nodePath.concat(key)
    this.foundKeys.add(fullKey)
    return { resolved: "${" + fullKey.join(".") + "}" }
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
    joiStringMap(joi.string().description("The environment variable value."))
      .description(
        "A map of all local environment variables (see https://nodejs.org/api/process.html#process_process_env)."
      )
      .meta({ keyPlaceholder: "<env-var-name>" })
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
  public username?: string

  constructor(root: ConfigContext, artifactsPath: string, username?: string) {
    super(root)
    this.artifactsPath = artifactsPath
    this.env = process.env
    this.platform = process.platform
    this.username = username
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

  constructor(artifactsPath: string, username?: string) {
    super()
    this.local = new LocalContext(this, artifactsPath, username)
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

class ProviderContext extends ConfigContext {
  @schema(
    joi
      .object()
      .pattern(
        /.*/,
        joiPrimitive().description(
          deline`
          The provider config key value. Refer to individual [provider references](${getProviderUrl()}) for details.
          `
        )
      )
      .description("The resolved configuration for the provider.")
      .example({ clusterHostname: "my-cluster.example.com" })
      .meta({ keyPlaceholder: "<config-key>" })
  )
  public config: ProviderConfig

  @schema(
    joiIdentifierMap(
      joiPrimitive().description(
        deline`
        The provider output value. Refer to individual [provider references](${getProviderUrl()}) for details.
        `
      )
    )
      .description("The outputs defined by the provider (see individual plugin docs for details).")
      .example({ "cluster-ip": "1.2.3.4" })
      .meta({ keyPlaceholder: "<output-key>" })
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
      .meta({ keyPlaceholder: "<provider-name>" })
  )
  public providers: Map<string, ProviderContext>

  @schema(
    joiVariables()
      .description("A map of all variables defined in the project configuration.")
      .meta({ keyPlaceholder: "<variable-name>" })
  )
  public variables: DeepPrimitiveMap

  @schema(joiIdentifierMap(joiPrimitive()).description("Alias for the variables field."))
  public var: DeepPrimitiveMap

  constructor(garden: Garden, resolvedProviders: Provider[], variables: DeepPrimitiveMap) {
    super(garden.artifactsPath, garden.username)
    const _this = this

    this.environment = new EnvironmentContext(this, garden.environmentName)
    this.project = new ProjectContext(this, garden.projectName)

    this.providers = new Map(
      resolvedProviders.map((p) => <[string, ProviderContext]>[p.name, new ProviderContext(_this, p)])
    )

    this.var = this.variables = variables
  }
}

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
    joiIdentifierMap(
      joiPrimitive().description(
        deline`
        The module output value. Refer to individual [module type references](${getModuleTypeUrl()}) for details.
        `
      )
    )
      .required()
      .description(
        "The outputs defined by the module (see individual module type " +
          "[references](https://docs.garden.io/reference/module-types) for details)."
      )
      .meta({ keyPlaceholder: "<output-name>" })
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
  public version: string | undefined

  constructor(root: ConfigContext, config: ModuleConfig, version?: ModuleVersion) {
    super(root)
    this.buildPath = config.buildPath
    this.outputs = config.outputs
    this.path = config.path
    // This may be undefined, if determined (by ResolveModuleConfigTask) not to be required for the resolution of
    // the templates.
    this.version = version?.versionString
  }
}

export class ServiceRuntimeContext extends ConfigContext {
  @schema(
    joiIdentifierMap(
      joiPrimitive().description(
        deline`
        The service output value. Refer to individual [module type references](${getModuleTypeUrl()}) for details.
        `
      )
    )
      .required()
      .description(
        "The runtime outputs defined by the service (see individual module type " +
          "[references](https://docs.garden.io/reference/module-types) for details)."
      )
      .meta({ keyPlaceholder: "<output-name>" })
  )
  public outputs: PrimitiveMap

  constructor(root: ConfigContext, outputs: PrimitiveMap) {
    super(root)
    this.outputs = outputs
  }
}

export class TaskRuntimeContext extends ServiceRuntimeContext {
  @schema(
    joiIdentifierMap(
      joiPrimitive().description(
        deline`
        The task output value. Refer to individual [module type references](${getModuleTypeUrl()}) for details.
        `
      )
    )
      .required()
      .description(
        "The runtime outputs defined by the task (see individual module type " +
          "[references](https://docs.garden.io/reference/module-types) for details)."
      )
      .meta({ keyPlaceholder: "<output-name>" })
  )
  public outputs: PrimitiveMap
}

class RuntimeConfigContext extends ConfigContext {
  @schema(
    joiIdentifierMap(ServiceRuntimeContext.getSchema())
      .required()
      .description("Runtime information from the services that the service/task being run depends on.")
      .meta({ keyPlaceholder: "<service-name>" })
  )
  public services: Map<string, ServiceRuntimeContext>

  @schema(
    joiIdentifierMap(TaskRuntimeContext.getSchema())
      .required()
      .description("Runtime information from the tasks that the service/task being run depends on.")
      .meta({ keyPlaceholder: "<task-name>" })
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

  resolve(params: ContextResolveParams): ContextResolveOutput {
    // We're customizing the resolver so that we can defer and return the template string back
    // for later resolution, but fail correctly when attempting to resolve the runtime templates.
    const opts = { ...(params.opts || {}), allowUndefined: params.opts.allowPartial || params.opts.allowUndefined }
    const res = super.resolve({ ...params, opts })

    if (res.resolved === undefined) {
      if (params.opts.allowPartial) {
        // If value can't be resolved and allowPartial is set, we defer the resolution by returning another template
        // string, that can be resolved later.
        const { key, nodePath } = params
        const fullKey = nodePath.concat(key)
        return { resolved: "${" + fullKey.join(".") + "}", partial: true }
      } else {
        // If undefined values are allowed, we simply return undefined (We know allowUndefined is set here, because
        // otherwise an error would have been thrown by `super.resolve()` above).
        return res
      }
    } else {
      // Value successfully resolved
      return res
    }
  }
}

/**
 * Used to throw a specific error when a module attempts to reference itself.
 */
class CircularContext extends ConfigContext {
  constructor(private moduleName: string) {
    super()
  }

  resolve({}): ContextResolveOutput {
    throw new ConfigurationError(`Module ${chalk.white.bold(this.moduleName)} cannot reference itself.`, {
      moduleName: this.moduleName,
    })
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
      .meta({ keyPlaceholder: "<module-name>" })
  )
  public modules: Map<string, ConfigContext>

  @schema(
    RuntimeConfigContext.getSchema().description(
      "Runtime outputs and information from services and tasks " +
        "(only resolved at runtime when deploying services and running tasks)."
    )
  )
  public runtime: RuntimeConfigContext

  constructor({
    garden,
    resolvedProviders,
    variables,
    moduleName,
    dependencyConfigs,
    dependencyVersions,
    runtimeContext,
  }: {
    garden: Garden
    resolvedProviders: Provider[]
    variables: DeepPrimitiveMap
    moduleName?: string
    dependencyConfigs: ModuleConfig[]
    dependencyVersions: { [name: string]: ModuleVersion }
    // We only supply this when resolving configuration in dependency order.
    // Otherwise we pass `${runtime.*} template strings through for later resolution.
    runtimeContext?: RuntimeContext
  }) {
    super(garden, resolvedProviders, variables)

    this.modules = new Map(
      dependencyConfigs.map(
        (config) =>
          <[string, ModuleContext]>[config.name, new ModuleContext(this, config, dependencyVersions[config.name])]
      )
    )

    if (moduleName) {
      this.modules.set(moduleName, new CircularContext(moduleName))
    }

    this.runtime = new RuntimeConfigContext(this, runtimeContext)
  }
}

/**
 * This context is available for template strings under the `outputs` key in project configuration files.
 */
export class OutputConfigContext extends ModuleConfigContext {
  constructor(
    garden: Garden,
    resolvedProviders: Provider[],
    variables: DeepPrimitiveMap,
    modules: Module[],
    runtimeContext: RuntimeContext
  ) {
    const versions = fromPairs(modules.map((m) => [m.name, m.version]))
    super({
      garden,
      resolvedProviders,
      variables,
      dependencyConfigs: modules,
      dependencyVersions: versions,
      runtimeContext,
    })
  }
}
