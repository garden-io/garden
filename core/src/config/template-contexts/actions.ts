/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { merge } from "lodash"
import { Action, ExecutedAction } from "../../actions/types"
import { Garden } from "../../garden"
import { GardenModule } from "../../types/module"
import { deline } from "../../util/string"
import { DeepPrimitiveMap, joi, joiIdentifierMap, joiPrimitive, joiVariables, PrimitiveMap } from "../common"
import { ProviderMap } from "../provider"
import { ConfigContext, schema } from "./base"
import { exampleVersion, ModuleConfigContext } from "./module"
import { RemoteSourceConfigContext } from "./project"

/**
 * This is available to built-in fields on action configs. See ActionSpecContext below for the context available
 * for action spec and variables.
 */
export class ActionConfigContext extends RemoteSourceConfigContext {
  constructor(garden: Garden) {
    super(garden, garden.variables)
  }
}

interface ActionReferenceContextParams {
  root: ConfigContext
  disabled: boolean
  variables: DeepPrimitiveMap
}

class ActionReferenceContext extends ConfigContext {
  @schema(joi.boolean().required().description("Whether the action is disabled.").example(true))
  public disabled: boolean

  @schema(joiVariables().required().description("The variables configured on the action.").example({ foo: "bar" }))
  public var: DeepPrimitiveMap

  constructor({ root, disabled, variables }: ActionReferenceContextParams) {
    super(root)
    this.disabled = disabled
    this.var = variables
  }
}

interface ActionResultContextParams extends ActionReferenceContextParams {
  outputs: PrimitiveMap
  version: string
}

class ActionResultContext extends ActionReferenceContext {
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

  constructor(params: ActionResultContextParams) {
    super(params)
    this.outputs = params.outputs
    this.version = params.version
  }
}

const _actionResultContextSchema = joiIdentifierMap(ActionResultContext.getSchema())
  .required()
  .meta({ keyPlaceholder: "<action-name>" })

const actionResultContextSchema = (kind: string) =>
  _actionResultContextSchema.description(`Information about a ${kind} action dependency, including its outputs.`)

class ActionReferencesContext extends ConfigContext {
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

  constructor(root: ConfigContext, allowPartial: boolean, actions: ExecutedAction[]) {
    super(root)

    this.build = new Map()
    this.deploy = new Map()
    this.run = new Map()
    this.test = new Map()

    this.services = this.deploy
    this.tasks = this.run

    for (const action of actions) {
      this[action.kind].set(
        action.name,
        new ActionResultContext({
          root: this,
          outputs: action.getOutputs(),
          version: action.versionString(),
          disabled: action.isDisabled(),
          variables: action.getVariables(),
        })
      )
    }

    // This ensures that any template string containing runtime.* references is returned unchanged when
    // there is no or limited runtime context available.
    this._alwaysAllowPartial = allowPartial
  }
}
export interface ActionSpecContextParams {
  garden: Garden
  resolvedProviders: ProviderMap
  modules: GardenModule[]
  partialRuntimeResolution: boolean
  action: Action
  executedDependencies: ExecutedAction[]
  variables: DeepPrimitiveMap
}

/**
 * Used to resolve action spec and variables.
 */
export class ActionSpecContext extends ModuleConfigContext {
  @schema(
    ActionReferencesContext.getSchema().description(
      "Runtime outputs and information from other actions (only resolved at runtime when executing actions)."
    )
  )
  public action: ActionReferencesContext

  @schema(ActionReferencesContext.getSchema().description("Alias for `action`."))
  public runtime: ActionReferencesContext

  constructor(params: ActionSpecContextParams) {
    const { action, garden, partialRuntimeResolution, variables, executedDependencies } = params

    const { internal } = action.getConfig()

    const mergedVariables: DeepPrimitiveMap = {}
    merge(mergedVariables, garden.variables)
    merge(mergedVariables, variables)
    merge(mergedVariables, garden.cliVariables)

    super({
      ...params,
      name: action.name,
      path: action.basePath(),
      buildPath: action.getBuildPath(),
      parentName: internal?.parentName,
      templateName: internal?.templateName,
      inputs: internal?.inputs,
      variables: mergedVariables,
    })

    // TODO-G2: include resolved dependencies here as well, once static outputs are implemented
    this.action = new ActionReferencesContext(this, partialRuntimeResolution, executedDependencies)
    this.runtime = this.action
  }
}
