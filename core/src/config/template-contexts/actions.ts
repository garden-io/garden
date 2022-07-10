/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Action } from "../../actions/base"
import { Garden } from "../../garden"
import { RuntimeContext } from "../../runtime-context"
import { GardenModule } from "../../types/module"
import { deline } from "../../util/string"
import { DeepPrimitiveMap, joi, joiIdentifierMap, joiPrimitive, PrimitiveMap } from "../common"
import { ProviderMap } from "../provider"
import { ConfigContext, schema } from "./base"
import { exampleVersion, ModuleConfigContext } from "./module"

export class ActionResultContext extends ConfigContext {
  @schema(
    joiIdentifierMap(
      joiPrimitive().description(
        deline`
        The action output value. Refer to individual [action/module type references](https://docs.garden.io/reference) for details.
        `
      )
    )
      .required()
      .description(
        "The outputs defined by the action (see individual action/module type " +
          "[references](https://docs.garden.io/reference) for details)."
      )
      .meta({ keyPlaceholder: "<output-name>" })
  )
  public outputs: PrimitiveMap

  @schema(joi.string().required().description("The current version of the action.").example(exampleVersion))
  public version: string

  constructor(root: ConfigContext, outputs: PrimitiveMap, version: string) {
    super(root)
    this.outputs = outputs
    this.version = version
  }
}

const _actionResultContextSchema = joiIdentifierMap(ActionResultContext.getSchema())
  .required()
  .meta({ keyPlaceholder: "<action-name>" })

const actionResultContextSchema = (kind: string) =>
  _actionResultContextSchema.description(`Information about a ${kind} action dependency, including its outputs.`)

class ActionReferenceContext extends ConfigContext {
  @schema(actionResultContextSchema("Build"))
  public build: Map<string, ActionResultContext>

  @schema(actionResultContextSchema("Deploy"))
  public deploy: Map<string, ActionResultContext>

  @schema(actionResultContextSchema("Run"))
  public run: Map<string, ActionResultContext>

  @schema(actionResultContextSchema("Test"))
  public test: Map<string, ActionResultContext>

  @schema(_actionResultContextSchema.description("Alias for `deploy`."))
  public services: Map<string, ActionResultContext>

  @schema(_actionResultContextSchema.description("Alias for `run`."))
  public tasks: Map<string, ActionResultContext>

  constructor(root: ConfigContext, allowPartial: boolean, runtimeContext?: RuntimeContext) {
    super(root)

    this.build = new Map()
    this.deploy = new Map()
    this.run = new Map()
    this.test = new Map()

    this.services = this.deploy
    this.tasks = this.run

    if (runtimeContext) {
      for (const dep of runtimeContext.dependencies) {
        this[dep.kind].set(dep.name, new ActionResultContext(this, dep.outputs, dep.version))
      }
    }

    // This ensures that any template string containing runtime.* references is returned unchanged when
    // there is no or limited runtimeContext available.
    this._alwaysAllowPartial = allowPartial
  }
}
export interface ActionConfigContextParams {
  garden: Garden
  resolvedProviders: ProviderMap
  variables: DeepPrimitiveMap
  modules: GardenModule[]

  // We only supply this when resolving configuration in dependency order.
  // Otherwise we pass `${runtime.*} template strings through for later resolution.
  runtimeContext?: RuntimeContext
  partialRuntimeResolution: boolean

  action: Action
}

/**
 * Used to resolve action configurations.
 */
export class ActionConfigContext extends ModuleConfigContext {
  @schema(
    ActionReferenceContext.getSchema().description(
      "Runtime outputs and information from other actions (only resolved at runtime when executing actions)."
    )
  )
  public action: ActionReferenceContext

  @schema(ActionReferenceContext.getSchema().description("Alias for `action`."))
  public runtime: ActionReferenceContext

  constructor(params: ActionConfigContextParams) {
    const { action, garden, partialRuntimeResolution, runtimeContext } = params

    const { internal } = action.getConfig()

    super({
      ...params,
      name: action.name,
      path: action.basePath(),
      buildPath: action.getBuildPath(),
      parentName: internal?.parentName,
      templateName: internal?.templateName,
      inputs: internal?.inputs,
      variables: { ...garden.variables, ...params.variables },
    })

    this.action = new ActionReferenceContext(this, partialRuntimeResolution, runtimeContext)
    this.runtime = this.action

    // TODO-G2
  }
}
