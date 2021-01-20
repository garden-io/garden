/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi from "@hapi/joi"
import chalk from "chalk"
import { isString, mapValues } from "lodash"
import {
  PrimitiveMap,
  joiIdentifierMap,
  joiStringMap,
  joiPrimitive,
  DeepPrimitiveMap,
  joiVariables,
  joiIdentifier,
} from "./common"
import { Provider, GenericProviderConfig, ProviderMap } from "./provider"
import { ConfigurationError } from "../exceptions"
import {
  resolveTemplateString,
  TemplateStringMissingKeyException,
  TemplateStringPassthroughException,
} from "../template-string"
import { Garden } from "../garden"
import { joi } from "../config/common"
import { KeyedSet } from "../util/keyed-set"
import { RuntimeContext } from "../runtime-context"
import { deline, dedent, naturalList } from "../util/string"
import { getProviderUrl, getModuleTypeUrl } from "../docs/common"
import { GardenModule } from "../types/module"
import { isPrimitive } from "util"
import { templateKind } from "./module-template"

export type ContextKeySegment = string | number
export type ContextKey = ContextKeySegment[]

export interface ContextResolveOpts {
  // Allow templates to be partially resolved (used to defer runtime template resolution, for example)
  allowPartial?: boolean
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

  // This is used for special-casing e.g. runtime.* resolution
  protected _alwaysAllowPartial: boolean

  constructor(rootContext?: ConfigContext) {
    this._rootContext = rootContext || this
    this._resolvedValues = {}
    this._alwaysAllowPartial = false
  }

  static getSchema() {
    const schemas = (<any>this)._schemas
    return joi.object().keys(schemas).required()
  }

  resolve({ key, nodePath, opts }: ContextResolveParams): ContextResolveOutput {
    const path = renderKeyPath(key)
    const fullPath = renderKeyPath(nodePath.concat(key))

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
    let available: any[] | null = null
    let value: any = this
    let partial = false
    let nextKey = key[0]
    let lookupPath: ContextKeySegment[] = []
    let nestedNodePath = nodePath
    let message: string | undefined = undefined

    for (let p = 0; p < key.length; p++) {
      nextKey = key[p]
      lookupPath = key.slice(0, p + 1)
      const remainder = key.slice(p + 1)
      nestedNodePath = nodePath.concat(lookupPath)
      const stackEntry = renderKeyPath(nestedNodePath)
      available = null

      if (typeof nextKey === "string" && nextKey.startsWith("_")) {
        value = undefined
      } else if (isPrimitive(value)) {
        throw new ConfigurationError(`Attempted to look up key ${JSON.stringify(nextKey)} on a ${typeof value}.`, {
          value,
          nodePath,
          fullPath,
          opts,
        })
      } else if (value instanceof Map) {
        available = [...value.keys()]
        value = value.get(nextKey)
      } else {
        available = Object.keys(value).filter((k) => !k.startsWith("_"))
        value = value[nextKey]
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
          message = res.message
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
      if (message === undefined) {
        message = chalk.red(`Could not find key ${chalk.white(nextKey)}`)
        if (nestedNodePath.length > 1) {
          message += chalk.red(" under ") + chalk.white(renderKeyPath(nestedNodePath.slice(0, -1)))
        }
        message += chalk.red(".")

        if (available && available.length) {
          message += chalk.red(" Available keys: " + naturalList(available.sort().map((k) => chalk.white(k))) + ".")
        }
      }

      // If we're allowing partial strings, we throw the error immediately to end the resolution flow. The error
      // is caught in the surrounding template resolution code.
      if (this._alwaysAllowPartial) {
        // We use a separate exception type when contexts are specifically indicating that unresolvable keys should
        // be passed through. This is caught in the template parser code.
        throw new TemplateStringPassthroughException(message, {
          nodePath,
          fullPath,
          opts,
        })
      } else if (opts.allowPartial) {
        throw new TemplateStringMissingKeyException(message, {
          nodePath,
          fullPath,
          opts,
        })
      } else {
        // Otherwise we return the undefined value, so that any logical expressions can be evaluated appropriately.
        // The template resolver will throw the error later if appropriate.
        return { resolved: undefined, message }
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
  foundKeys: KeyedSet<ContextKeySegment[]>

  constructor() {
    super()
    this.foundKeys = new KeyedSet<ContextKeySegment[]>((v) => renderKeyPath(v))
  }

  resolve({ key, nodePath }: ContextResolveParams) {
    const fullKey = nodePath.concat(key)
    this.foundKeys.add(fullKey)
    return { resolved: renderTemplateString(fullKey), partial: true }
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

  @schema(joi.string().description("The absolute path to the project root directory.").example("/home/me/my-project"))
  public projectPath: string

  @schema(
    joi
      .string()
      .description("The current username (as resolved by https://github.com/sindresorhus/username)")
      .example("tenzing_norgay")
  )
  public username?: string

  constructor(root: ConfigContext, artifactsPath: string, projectRoot: string, username?: string) {
    super(root)
    this.artifactsPath = artifactsPath
    this.env = process.env
    this.platform = process.platform
    this.projectPath = projectRoot
    this.username = username
  }
}

class ProjectContext extends ConfigContext {
  @schema(joi.string().description("The name of the Garden project.").example("my-project"))
  public name: string

  constructor(root: ConfigContext, name: string) {
    super(root)
    this.name = name
  }
}

class GitContext extends ConfigContext {
  @schema(
    joi
      .string()
      .description(
        dedent`
          The current Git branch, if available. Resolves to an empty string if HEAD is in a detached state
          (e.g. when rebasing), or if the repository has no commits.

          When using remote sources, the branch used is that of the project/top-level repository (the one that contains
          the project configuration).

          The branch is computed at the start of the Garden command's execution, and is not updated if the current
          branch changes during the command's execution (which could happen, for example, when using watch-mode
          commands).
        `
      )
      .example("my-feature-branch")
  )
  public branch: string

  constructor(root: ConfigContext, branch: string) {
    super(root)
    this.branch = branch
  }
}

/**
 * This context is available for template strings in the `defaultEnvironment` field in project configs.
 */
export class DefaultEnvironmentContext extends ConfigContext {
  @schema(
    LocalContext.getSchema().description(
      "Context variables that are specific to the currently running environment/machine."
    )
  )
  public local: LocalContext

  @schema(ProjectContext.getSchema().description("Information about the Garden project."))
  public project: ProjectContext

  @schema(
    GitContext.getSchema().description("Information about the current state of the project's local git repository.")
  )
  public git: GitContext

  constructor({
    projectName,
    projectRoot,
    artifactsPath,
    branch,
    username,
  }: {
    projectName: string
    projectRoot: string
    artifactsPath: string
    branch: string
    username?: string
  }) {
    super()
    this.local = new LocalContext(this, artifactsPath, projectRoot, username)
    this.git = new GitContext(this, branch)
    this.project = new ProjectContext(this, projectName)
  }
}

export interface ProjectConfigContextParams {
  projectName: string
  projectRoot: string
  artifactsPath: string
  branch: string
  username?: string
  secrets: PrimitiveMap
}

/**
 * This context is available for template strings for all Project config fields (except `name`, `id` and
 * `domain`).
 *
 * Template strings in `defaultEnvironmentName` have access to all fields in this context, except for
 * `secrets`.
 */
export class ProjectConfigContext extends DefaultEnvironmentContext {
  @schema(
    joiStringMap(joi.string().description("The secret's value."))
      .description("A map of all secrets for this project in the current environment.")
      .meta({
        internal: true,
        keyPlaceholder: "<secret-name>",
      })
  )
  public secrets: PrimitiveMap

  constructor({ projectName, projectRoot, artifactsPath, branch, username, secrets }: ProjectConfigContextParams) {
    super({ projectName, projectRoot, artifactsPath, branch, username })
    this.secrets = secrets
  }
}

interface EnvironmentConfigContextParams extends ProjectConfigContextParams {
  variables: DeepPrimitiveMap
}

/**
 * This context is available for template strings for all `environments[]` fields (except name)
 */
export class EnvironmentConfigContext extends ProjectConfigContext {
  @schema(
    joiVariables()
      .description("A map of all variables defined in the project configuration.")
      .meta({ keyPlaceholder: "<variable-name>" })
  )
  public variables: DeepPrimitiveMap

  @schema(joiIdentifierMap(joiPrimitive()).description("Alias for the variables field."))
  public var: DeepPrimitiveMap

  @schema(
    joiStringMap(joi.string().description("The secret's value."))
      .description("A map of all secrets for this project in the current environment.")
      .meta({
        internal: true,
        keyPlaceholder: "<secret-name>",
      })
  )
  public secrets: PrimitiveMap

  constructor({
    projectName,
    projectRoot,
    artifactsPath,
    branch,
    username,
    variables,
    secrets,
  }: EnvironmentConfigContextParams) {
    super({ projectName, projectRoot, artifactsPath, branch, username, secrets })
    this.variables = this.var = variables
  }
}

class EnvironmentContext extends ConfigContext {
  @schema(
    joi
      .string()
      .required()
      .description("The name of the environment Garden is running against, excluding the namespace.")
      .example("local")
  )
  public name: string

  @schema(
    joi
      .string()
      .required()
      .description("The full name of the environment Garden is running against, including the namespace.")
      .example("my-namespace.local")
  )
  public fullName: string

  @schema(joi.string().description("The currently active namespace (if any).").example("my-namespace"))
  public namespace: string

  constructor(root: ConfigContext, name: string, fullName: string, namespace?: string) {
    super(root)
    this.name = name
    this.fullName = fullName
    this.namespace = namespace || ""
  }
}

/**
 * This context is available for template strings in all workflow config fields except `name` and `triggers[]`.
 */
export class WorkflowConfigContext extends EnvironmentConfigContext {
  @schema(
    EnvironmentContext.getSchema().description("Information about the environment that Garden is running against.")
  )
  public environment: EnvironmentContext

  // Overriding to update the description. Same schema as base.
  @schema(
    joiVariables()
      .description(
        "A map of all variables defined in the project configuration, including environment-specific variables."
      )
      .meta({ keyPlaceholder: "<variable-name>" })
  )
  public variables: DeepPrimitiveMap

  @schema(
    joiStringMap(joi.string().description("The secret's value."))
      .description("A map of all secrets for this project in the current environment.")
      .meta({
        internal: true,
        keyPlaceholder: "<secret-name>",
      })
  )
  public secrets: PrimitiveMap

  constructor(garden: Garden) {
    super({
      projectName: garden.projectName,
      projectRoot: garden.projectRoot,
      artifactsPath: garden.artifactsPath,
      branch: garden.vcsBranch,
      username: garden.username,
      variables: garden.variables,
      secrets: garden.secrets,
    })

    const fullEnvName = garden.namespace ? `${garden.namespace}.${garden.environmentName}` : garden.environmentName
    this.environment = new EnvironmentContext(this, garden.environmentName, fullEnvName, garden.namespace)
    this.project = new ProjectContext(this, garden.projectName)
  }
}

class WorkflowStepContext extends ConfigContext {
  @schema(joi.string().description("The full output log from the step."))
  public log: string

  @schema(
    joiVariables()
      // TODO: populate and then link to command docs
      .description(
        dedent`
        The outputs returned by the step, as a mapping. Script steps will always have \`stdout\` and \`stderr\` keys.
        Command steps return different keys, including potentially nested maps and arrays. Please refer to each command
        for its output schema.
        `
      )
      .example({ stdout: "my script output" })
      .meta({ keyPlaceholder: "<output-key>" })
  )
  public outputs: DeepPrimitiveMap

  constructor(root: ConfigContext, stepResult: WorkflowStepResult) {
    super(root)
    this.log = stepResult.log
    this.outputs = stepResult.outputs
  }
}

export interface WorkflowStepResult {
  number: number
  outputs: DeepPrimitiveMap
  log: string
}

export class WorkflowStepConfigContext extends WorkflowConfigContext {
  @schema(
    joiIdentifierMap(WorkflowStepContext.getSchema())
      .description(
        dedent`
        Reference previous steps in a workflow. Only available in the \`steps[].command\` and \`steps[].script\` fields.
        The name of the step should be the explicitly set \`name\` of the other step, or if one is not set, use
        \`step-<n>\`, where <n> is the sequential number of the step (starting from 1).
        `
      )
      .meta({ keyPlaceholder: "<step-name>" })
  )
  public steps: Map<string, WorkflowStepContext | ErrorContext>

  constructor({
    allStepNames,
    garden,
    resolvedSteps,
    stepName,
  }: {
    allStepNames: string[]
    garden: Garden
    resolvedSteps: { [name: string]: WorkflowStepResult }
    stepName: string
  }) {
    super(garden)

    this.steps = new Map<string, WorkflowStepContext | ErrorContext>()

    for (const name of allStepNames) {
      this.steps.set(
        name,
        new ErrorContext(
          `Step ${name} is referenced in a template for step ${stepName}, but step ${name} is later in the execution order. Only previous steps in the workflow can be referenced.`
        )
      )
    }

    this.steps.set(
      stepName,
      new ErrorContext(
        `Step ${stepName} references itself in a template. Only previous steps in the workflow can be referenced.`
      )
    )

    for (const [name, result] of Object.entries(resolvedSteps)) {
      this.steps.set(name, new WorkflowStepContext(this, result))
    }
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
  public config: GenericProviderConfig

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

export class ProviderConfigContext extends WorkflowConfigContext {
  @schema(
    joiIdentifierMap(ProviderContext.getSchema())
      .description("Retrieve information about providers that are defined in the project.")
      .meta({ keyPlaceholder: "<provider-name>" })
  )
  public providers: Map<string, ProviderContext>

  constructor(garden: Garden, resolvedProviders: ProviderMap) {
    super(garden)

    this.providers = new Map(Object.entries(mapValues(resolvedProviders, (p) => new ProviderContext(this, p))))
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
    joi.string().required().description("The local path of the module.").example("/home/me/code/my-project/my-module")
  )
  public path: string

  @schema(joi.string().required().description("The current version of the module.").example(exampleVersion))
  public version: string

  constructor(root: ConfigContext, module: GardenModule) {
    super(root)
    this.buildPath = module.buildPath
    this.outputs = module.outputs
    this.path = module.path
    this.version = module.version.versionString
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

  constructor(root: ConfigContext, allowPartial: boolean, runtimeContext?: RuntimeContext) {
    super(root)

    this.services = new Map()
    this.tasks = new Map()

    if (runtimeContext) {
      for (const dep of runtimeContext.dependencies) {
        if (dep.type === "service") {
          this.services.set(dep.name, new ServiceRuntimeContext(this, dep.outputs))
        } else if (dep.type === "task") {
          this.tasks.set(dep.name, new TaskRuntimeContext(this, dep.outputs))
        }
      }
    }

    // This ensures that any template string containing runtime.* references is returned unchanged when
    // there is no or limited runtimeContext available.
    this._alwaysAllowPartial = allowPartial
  }
}

/**
 * Used to throw a specific error, e.g. when a module attempts to reference itself.
 */
class ErrorContext extends ConfigContext {
  constructor(private message: string) {
    super()
  }

  resolve({}): ContextResolveOutput {
    throw new ConfigurationError(this.message, {})
  }
}

export class ParentContext extends ConfigContext {
  @schema(joiIdentifier().description(`The name of the parent module.`))
  public name: string

  constructor(root: ConfigContext, name: string) {
    super(root)
    this.name = name
  }
}

export class ModuleTemplateContext extends ConfigContext {
  @schema(joiIdentifier().description(`The name of the ${templateKind} being resolved.`))
  public name: string

  constructor(root: ConfigContext, name: string) {
    super(root)
    this.name = name
  }
}

export class ModuleTemplateConfigContext extends ProjectConfigContext {
  @schema(ParentContext.getSchema().description(`Information about the templated module being resolved.`))
  public parent: ParentContext

  @schema(
    ModuleTemplateContext.getSchema().description(`Information about the template used when generating the module.`)
  )
  public template: ModuleTemplateContext

  @schema(
    joiVariables().description(`The inputs provided when resolving the ${templateKind}.`).meta({
      keyPlaceholder: "<input-key>",
    })
  )
  public inputs: DeepPrimitiveMap

  constructor(
    params: { parentName: string; templateName: string; inputs: DeepPrimitiveMap } & ProjectConfigContextParams
  ) {
    super(params)
    this.parent = new ParentContext(this, params.parentName)
    this.template = new ModuleTemplateContext(this, params.templateName)
    this.inputs = params.inputs
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

  @schema(
    ParentContext.getSchema().description(
      `Information about the parent module (if the module is a submodule, e.g. generated in a templated module).`
    )
  )
  public parent?: ParentContext

  @schema(
    ModuleTemplateContext.getSchema().description(
      `Information about the ${templateKind} used when generating the module.`
    )
  )
  public template?: ModuleTemplateContext

  @schema(
    joiVariables().description(`The inputs provided to the module through a ${templateKind}, if applicable.`).meta({
      keyPlaceholder: "<input-key>",
    })
  )
  public inputs: DeepPrimitiveMap

  constructor({
    garden,
    resolvedProviders,
    moduleName,
    dependencies,
    runtimeContext,
    parentName,
    templateName,
    inputs,
    partialRuntimeResolution,
  }: {
    garden: Garden
    resolvedProviders: ProviderMap
    moduleName?: string
    dependencies: GardenModule[]
    // We only supply this when resolving configuration in dependency order.
    // Otherwise we pass `${runtime.*} template strings through for later resolution.
    runtimeContext?: RuntimeContext
    parentName: string | undefined
    templateName: string | undefined
    inputs: DeepPrimitiveMap | undefined
    partialRuntimeResolution: boolean
  }) {
    super(garden, resolvedProviders)

    this.modules = new Map(
      dependencies.map((config) => <[string, ModuleContext]>[config.name, new ModuleContext(this, config)])
    )

    if (moduleName) {
      // Throw specific error when attempting to resolve self
      this.modules.set(moduleName, new ErrorContext(`Module ${chalk.white.bold(moduleName)} cannot reference itself.`))
    }

    this.runtime = new RuntimeConfigContext(this, partialRuntimeResolution, runtimeContext)
    if (parentName && templateName) {
      this.parent = new ParentContext(this, parentName)
      this.template = new ModuleTemplateContext(this, templateName)
    }
    this.inputs = inputs || {}
  }
}

/**
 * This context is available for template strings under the `outputs` key in project configuration files.
 */
export class OutputConfigContext extends ModuleConfigContext {
  constructor({
    garden,
    resolvedProviders,
    modules,
    runtimeContext,
  }: {
    garden: Garden
    resolvedProviders: ProviderMap
    modules: GardenModule[]
    runtimeContext: RuntimeContext
  }) {
    super({
      garden,
      resolvedProviders,
      dependencies: modules,
      runtimeContext,
      parentName: undefined,
      templateName: undefined,
      inputs: {},
      partialRuntimeResolution: false,
    })
  }
}

/**
 * Given all the segments of a template string, return a new template string that can be resolved later.
 */
function renderTemplateString(key: ContextKeySegment[]) {
  return "${" + renderKeyPath(key) + "}"
}

/**
 * Given all the segments of a template string, return a string path for the key.
 */
function renderKeyPath(key: ContextKeySegment[]): string {
  // Note: We don't support bracket notation for the first part in a template string
  if (key.length === 0) {
    return ""
  }
  const stringSegments = key.map((segment) => "" + segment)
  return (
    stringSegments
      .slice(1)
      // Need to correctly handle key segments with dots in them, and nested templates
      .reduce((output, segment) => {
        if (segment.match(/[\.\$\{\}]/)) {
          return `${output}[${JSON.stringify(segment)}]`
        } else {
          return `${output}.${segment}`
        }
      }, stringSegments[0])
  )
}
