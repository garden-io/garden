/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ActionConfig, Action, ExecutedAction, ResolvedAction } from "../../actions/types.js"
import type { ActionMode } from "../../actions/types.js"
import type { Garden } from "../../garden.js"
import type { GardenModule } from "../../types/module.js"
import { dedent, deline } from "../../util/string.js"
import type { DeepPrimitiveMap, PrimitiveMap } from "../common.js"
import { joi, joiIdentifier, joiIdentifierMap, joiPrimitive, joiVariables } from "../common.js"
import type { ProviderMap } from "../provider.js"
import { ConfigContext, ErrorContext, GenericContext, ParentContext, schema, TemplateContext } from "./base.js"
import { exampleVersion, OutputConfigContext } from "./module.js"
import { TemplatableConfigContext } from "./project.js"
import { DOCS_BASE_URL } from "../../constants.js"
import { styles } from "../../logger/styles.js"
import { LayeredContext } from "./base.js"

function mergeVariables({ garden, variables }: { garden: Garden; variables: ConfigContext }): LayeredContext {
  return new LayeredContext(new GenericContext(garden.variableOverrides), variables, garden.variables)
}

type ActionConfigThisContextParams = Pick<ActionReferenceContextParams, "name" | "mode">

const actionNameSchema = joiIdentifier().description(`The name of the action.`)

const actionModeSchema = joi
  .string()
  .required()
  .default("default")
  .allow("default", "sync", "local")
  .description(
    dedent`
      The mode that the action should be executed in (e.g. 'sync' or 'local' for Deploy actions). Set to 'default' if no special mode is being used.

      Build actions inherit the mode from Deploy actions that depend on them. E.g. If a Deploy action is in 'sync' mode and depends on a Build action, the Build action will inherit the 'sync' mode setting from the Deploy action. This enables installing different tools that may be necessary for different development modes.
    `
  )
  .example("sync")

class ActionConfigThisContext extends ConfigContext {
  @schema(actionNameSchema)
  public name: string

  @schema(actionModeSchema)
  public mode: ActionMode

  constructor(root: ConfigContext, { name, mode }: ActionConfigThisContextParams) {
    super(root)
    this.name = name
    this.mode = mode
  }
}

interface ActionConfigContextParams {
  garden: Garden
  config: ActionConfig
  thisContextParams: ActionConfigThisContextParams
  variables: ConfigContext
}

/**
 * This is available to built-in fields on action configs. See ActionSpecContext below for the context available
 * for action spec and variables.
 */
export class ActionConfigContext extends TemplatableConfigContext {
  @schema(ActionConfigThisContext.getSchema().description("Information about the action currently being resolved."))
  public this: ActionConfigThisContext

  constructor({ garden, config, thisContextParams, variables }: ActionConfigContextParams) {
    const mergedVariables = mergeVariables({ garden, variables })
    super(garden, config)
    this.this = new ActionConfigThisContext(this, thisContextParams)
    this.variables = this.var = mergedVariables
  }
}

interface ActionReferenceContextParams {
  root: ConfigContext
  name: string
  disabled: boolean
  buildPath: string
  sourcePath: string
  mode: ActionMode
  variables: ConfigContext
}

export class ActionReferenceContext extends ConfigContext {
  @schema(actionNameSchema)
  public name: string

  @schema(joi.boolean().required().description("Whether the action is disabled.").example(true))
  public disabled: boolean

  @schema(
    joi
      .string()
      .required()
      .description("The local path to the action build directory.")
      .example("/my/project/.garden/build/my-action")
  )
  public buildPath: string

  @schema(
    joi
      .string()
      .required()
      .description("The local path to the action source directory.")
      .example("/my/project/my-action")
  )
  public sourcePath: string

  @schema(actionModeSchema)
  public mode: ActionMode

  @schema(joiVariables().required().description("The variables configured on the action.").example({ foo: "bar" }))
  public var: ConfigContext

  constructor({ root, name, disabled, buildPath, sourcePath, mode, variables }: ActionReferenceContextParams) {
    super(root)
    this.name = name
    this.disabled = disabled
    this.buildPath = buildPath
    this.sourcePath = sourcePath
    this.var = variables
    this.mode = mode
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
        The action output value. Refer to individual [action/module type references](${DOCS_BASE_URL}/reference) for details.
        `
      )
    )
      .required()
      .description(
        `The outputs defined by the action (see individual action/module type [references](${DOCS_BASE_URL}/reference) for details).`
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

  constructor(root: ConfigContext, actions: (ResolvedAction | ExecutedAction)[]) {
    super(root)

    this.build = new Map()
    this.deploy = new Map()
    this.run = new Map()
    this.test = new Map()

    this.services = this.deploy
    this.tasks = this.run

    for (const action of actions) {
      this[action.kind.toLowerCase()].set(
        action.name,
        new ActionResultContext({
          root: this,
          name: action.name,
          outputs: action.getOutputs(),
          version: action.versionString(),
          disabled: action.isDisabled(),
          buildPath: action.getBuildPath(),
          sourcePath: action.sourcePath(),
          mode: action.mode(),
          variables: new GenericContext(action.getVariables()),
        })
      )
    }
  }
}

export interface ActionSpecContextParams {
  garden: Garden
  resolvedProviders: ProviderMap
  modules: GardenModule[]
  action: Action
  resolvedDependencies: ResolvedAction[]
  executedDependencies: ExecutedAction[]
  variables: ConfigContext
  inputs: DeepPrimitiveMap
}

/**
 * Used to resolve action spec and variables.
 */
export class ActionSpecContext extends OutputConfigContext {
  @schema(
    ActionReferencesContext.getSchema().description(
      "Runtime outputs and information from other actions (only resolved at runtime when executing actions)."
    )
  )
  public actions: ActionReferencesContext

  @schema(ActionReferencesContext.getSchema().description("Alias for `action`."))
  public override runtime: ActionReferencesContext

  @schema(
    joiVariables().description(`The inputs provided to the config through a template, if applicable.`).meta({
      keyPlaceholder: "<input-key>",
    })
  )
  public inputs: DeepPrimitiveMap

  @schema(
    ParentContext.getSchema().description(
      `Information about the config parent, if any (usually a template, if applicable).`
    )
  )
  public parent?: ParentContext

  @schema(
    TemplateContext.getSchema().description(
      `Information about the template used when generating the config, if applicable.`
    )
  )
  public template?: TemplateContext

  @schema(ActionReferenceContext.getSchema().description("Information about the action currently being resolved."))
  public this: ActionReferenceContext

  constructor(params: ActionSpecContextParams) {
    const { action, garden, variables, inputs, resolvedDependencies, executedDependencies } = params

    const internal = action.getInternal()

    const mergedVariables = mergeVariables({ garden, variables })

    super({
      ...params,
      variables: mergedVariables,
    })

    const name = action.name
    const buildPath = action.getBuildPath()
    const sourcePath = action.sourcePath()
    const parentName = internal?.parentName
    const templateName = internal?.templateName

    this.actions = new ActionReferencesContext(this, [...resolvedDependencies, ...executedDependencies])

    // Throw specific error when attempting to resolve self
    this.actions[action.kind.toLowerCase()].set(
      name,
      new ErrorContext(`Action ${styles.highlight.bold(action.key())} cannot reference itself.`)
    )

    if (parentName && templateName) {
      this.parent = new ParentContext(this, parentName)
      this.template = new TemplateContext(this, templateName)
    }
    this.inputs = inputs

    this.runtime = this.actions

    this.this = new ActionReferenceContext({
      root: this,
      disabled: action.isDisabled(),
      buildPath,
      name,
      sourcePath,
      mode: action.mode(),
      variables: mergedVariables,
    })
  }
}
