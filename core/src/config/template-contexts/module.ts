/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { PrimitiveMap, DeepPrimitiveMap } from "../common.js"
import { joiIdentifierMap, joiPrimitive, joiVariables, joiIdentifier } from "../common.js"
import type { ProviderMap } from "../provider.js"
import type { Garden } from "../../garden.js"
import { joi } from "../common.js"
import { deline } from "../../util/string.js"
import { getModuleTypeUrl } from "../../docs/common.js"
import type { GardenModule } from "../../types/module.js"
import { ContextWithSchema, schema, ErrorContext, ParentContext, TemplateContext } from "./base.js"
import { ProviderConfigContext } from "./provider.js"
import type { GraphResultFromTask, GraphResults } from "../../graph/results.js"
import type { DeployTask } from "../../tasks/deploy.js"
import type { RunTask } from "../../tasks/run.js"
import { DOCS_BASE_URL } from "../../constants.js"
import { styles } from "../../logger/styles.js"
import type { InputContext } from "./input.js"
import type { VariablesContext } from "./variables.js"

export const exampleVersion = "v-17ad4cb3fd"

export interface ModuleThisContextParams {
  buildPath: string
  name: string
  path: string
}

class ModuleThisContext extends ContextWithSchema {
  @schema(
    joi
      .string()
      .required()
      .description("The build path of the module.")
      .example("/home/me/code/my-project/.garden/build/my-build")
  )
  public readonly buildPath: string

  @schema(joiIdentifier().description(`The name of the module.`))
  public readonly name: string

  @schema(
    joi
      .string()
      .required()
      .description("The source path of the module.")
      .example("/home/me/code/my-project/my-container")
  )
  public path: string

  constructor({ buildPath, name, path }: ModuleThisContextParams) {
    super()
    this.buildPath = buildPath
    this.name = name
    this.path = path
  }
}

export class ModuleReferenceContext extends ModuleThisContext {
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
        `The outputs defined by the module (see individual module type [references](${DOCS_BASE_URL}/reference/module-types) for details).`
      )
      .meta({ keyPlaceholder: "<output-name>" })
  )
  public readonly outputs: PrimitiveMap

  @schema(
    joiVariables()
      .description("A map of all variables defined in the module.")
      .meta({ keyPlaceholder: "<variable-name>" })
  )
  public readonly var: DeepPrimitiveMap

  @schema(joi.string().required().description("The current version of the module.").example(exampleVersion))
  public readonly version: string

  constructor(module: GardenModule) {
    super({ buildPath: module.buildPath, name: module.name, path: module.path })
    this.outputs = module.outputs
    this.var = module.variables
    this.version = module.version.versionString
  }
}

export class ServiceRuntimeContext extends ContextWithSchema {
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
        `The runtime outputs defined by the service (see individual module type [references](${DOCS_BASE_URL}/reference/module-types) for details).`
      )
      .meta({ keyPlaceholder: "<output-name>" })
  )
  public readonly outputs: PrimitiveMap

  @schema(joi.string().required().description("The current version of the service.").example(exampleVersion))
  public readonly version: string

  constructor(outputs: PrimitiveMap, version: string) {
    super()
    this.outputs = outputs
    this.version = version
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
        `The runtime outputs defined by the task (see individual module type [references](${DOCS_BASE_URL}/reference/module-types) for details).`
      )
      .meta({ keyPlaceholder: "<output-name>" })
  )
  public override readonly outputs: PrimitiveMap

  @schema(joi.string().required().description("The current version of the task.").example(exampleVersion))
  public override readonly version: string

  constructor(outputs: PrimitiveMap, version: string) {
    super(outputs, version)
    this.outputs = outputs
    this.version = version
  }
}

class RuntimeConfigContext extends ContextWithSchema {
  @schema(
    joiIdentifierMap(ServiceRuntimeContext.getSchema())
      .required()
      .description("Runtime information from the services that the service/task being run depends on.")
      .meta({ keyPlaceholder: "<service-name>" })
  )
  public readonly services: Map<string, ServiceRuntimeContext>

  @schema(
    joiIdentifierMap(TaskRuntimeContext.getSchema())
      .required()
      .description("Runtime information from the tasks that the service/task being run depends on.")
      .meta({ keyPlaceholder: "<task-name>" })
  )
  public readonly tasks: Map<string, TaskRuntimeContext>

  constructor(graphResults?: GraphResults) {
    super()

    this.services = new Map()
    this.tasks = new Map()

    if (graphResults) {
      for (const result of Object.values(graphResults.getMap())) {
        if (result?.task.type === "deploy" && result.result) {
          const r = (<GraphResultFromTask<DeployTask>>result).result!
          this.services.set(result.name, new ServiceRuntimeContext(result.outputs, r.executedAction.versionString()))
        } else if (result?.task.type === "run") {
          const r = (<GraphResultFromTask<RunTask>>result).result!
          this.tasks.set(result.name, new TaskRuntimeContext(result.outputs, r.executedAction.versionString()))
        }
      }
    }
  }
}

export interface OutputConfigContextParams {
  garden: Garden
  resolvedProviders: ProviderMap
  variables: VariablesContext
  modules: GardenModule[]
  // We only supply this when resolving configuration in dependency order.
  // Otherwise we pass `${runtime.*} template strings through for later resolution.
  graphResults?: GraphResults
}

/**
 * This context is available for template strings under the `outputs` key in project configuration files.
 */
export class OutputConfigContext extends ProviderConfigContext {
  @schema(
    joiIdentifierMap(ModuleReferenceContext.getSchema())
      .description("Retrieve information about modules that are defined in the project.")
      .meta({ keyPlaceholder: "<module-name>" })
  )
  public readonly modules: Map<string, ModuleReferenceContext | ErrorContext>

  @schema(
    RuntimeConfigContext.getSchema().description(
      "Runtime outputs and information from services and tasks " +
        "(only resolved at runtime when deploying services and running tasks)."
    )
  )
  public readonly runtime: RuntimeConfigContext

  constructor({ garden, resolvedProviders, variables, modules, graphResults }: OutputConfigContextParams) {
    super(garden, resolvedProviders, variables)

    this.modules = new Map(
      modules.map((config) => <[string, ModuleReferenceContext]>[config.name, new ModuleReferenceContext(config)])
    )

    this.runtime = new RuntimeConfigContext(graphResults)
  }
}

export interface ModuleConfigContextParams extends OutputConfigContextParams {
  garden: Garden
  resolvedProviders: ProviderMap
  name: string
  path: string
  buildPath: string

  // Template attributes
  parentName: string | undefined
  templateName: string | undefined
  inputs: InputContext
}

/**
 * Used to resolve module configuration.
 */
export class ModuleConfigContext extends OutputConfigContext {
  @schema(
    joiVariables().description(`The inputs provided to the config through a template, if applicable.`).meta({
      keyPlaceholder: "<input-key>",
    })
  )
  public readonly inputs: InputContext

  @schema(
    ParentContext.getSchema().description(
      `Information about the config parent, if any (usually a template, if applicable).`
    )
  )
  public readonly parent?: ParentContext

  @schema(
    TemplateContext.getSchema().description(
      `Information about the template used when generating the config, if applicable.`
    )
  )
  public readonly template?: TemplateContext

  @schema(ModuleThisContext.getSchema().description("Information about the action/module currently being resolved."))
  public readonly this: ModuleThisContext

  constructor(params: ModuleConfigContextParams) {
    super(params)

    const { name, path, inputs, parentName, templateName, buildPath } = params

    // Throw specific error when attempting to resolve self
    this.modules.set(name, new ErrorContext(`Config ${styles.highlight.bold(name)} cannot reference itself.`))

    if (parentName && templateName) {
      this.parent = new ParentContext(parentName)
      this.template = new TemplateContext(templateName)
    }
    this.inputs = inputs

    this.this = new ModuleThisContext({ buildPath, name, path })
  }
}
