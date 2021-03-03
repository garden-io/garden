/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { PrimitiveMap, joiIdentifierMap, joiPrimitive, DeepPrimitiveMap, joiVariables, joiIdentifier } from "../common"
import { ProviderMap } from "../provider"
import { Garden } from "../../garden"
import { joi } from "../common"
import { RuntimeContext } from "../../runtime-context"
import { deline } from "../../util/string"
import { getModuleTypeUrl } from "../../docs/common"
import { GardenModule } from "../../types/module"
import { templateKind } from "../module-template"
import { ConfigContext, schema, ErrorContext } from "./base"
import { ProjectConfigContext, ProjectConfigContextParams } from "./project"
import { ProviderConfigContext } from "./provider"

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

export interface ModuleConfigContextParams {
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
  }: ModuleConfigContextParams) {
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
