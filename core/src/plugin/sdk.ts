/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { z } from "zod"
import { BaseAction } from "../actions/base"
import { BuildAction } from "../actions/build"
import { DeployAction } from "../actions/deploy"
import { RunAction } from "../actions/run"
import { TestAction } from "../actions/test"
import { BaseActionConfig } from "../actions/types"
import { joi, zodObjectToJoi } from "../config/common"
import { BaseProviderConfig, baseProviderConfigSchemaZod } from "../config/provider"
import { s } from "../config/zod"
import { ValidationError } from "../exceptions"
import {
  ActionKind,
  ActionTypeDefinition,
  ActionTypeHandler,
  ActionTypeHandlers,
  BuildActionDescriptions,
  DeployActionDescriptions,
  RunActionDescriptions,
  TestActionDescriptions,
  GetActionTypeParams,
  GetActionTypeResults,
} from "./action-types"
import { PluginCommand } from "./command"
import { DashboardPage } from "./handlers/Provider/getDashboardPage"
import type {
  ActionHandler,
  GardenPluginSpec,
  PluginActionParamsBase,
  PluginDependency,
  ProviderActionOutputs,
  ProviderActionParams,
  ProviderHandlers,
} from "./plugin"
import { PluginToolSpec } from "./tools"

type ObjectBaseZod = z.ZodObject<{}>

type FilledPluginSpec = Required<GardenPluginSpec>

type GardenSdkPluginSpec = Pick<
  GardenPluginSpec,
  "name" | "base" | "docs" | "dependencies" | "createModuleTypes" | "extendModuleTypes"
>

export class GardenSdkPlugin {
  private spec: FilledPluginSpec

  constructor(spec: GardenSdkPluginSpec) {
    this.spec = {
      name: spec.name,
      base: spec.base || null,
      docs: spec.docs || null,

      configSchema: joi.object(),
      outputsSchema: joi.object(),

      dependencies: spec.dependencies || [],

      handlers: {},
      commands: [],
      tools: [],
      dashboardPages: [],

      createModuleTypes: spec.createModuleTypes || [],
      extendModuleTypes: spec.extendModuleTypes || [],

      createActionTypes: {},
      extendActionTypes: {},
    }
  }

  getSpec(): Required<GardenPluginSpec> {
    return this.spec
  }

  createProvider<C extends ObjectBaseZod, O extends ObjectBaseZod>(configSchema: C, outputsSchema: O) {
    const provider = createProvider(this, configSchema, outputsSchema)
    this.setProvider(provider)
    return provider
  }

  setProvider(provider: GardenSdkProvider<any, any>) {
    this.spec.configSchema = zodObjectToJoi(provider.getConfigSchema())
    this.spec.outputsSchema = zodObjectToJoi(provider.getOutputsSchema())
  }

  setBase(base: string) {
    this.spec.base = base
  }

  setDocs(docs: string) {
    this.spec.docs = docs
  }

  addDependency(dep: PluginDependency) {
    this.spec.dependencies.push(dep)
  }

  addTool(spec: PluginToolSpec) {
    this.spec.tools.push(spec)
  }

  addDashboardPage(spec: DashboardPage) {
    this.spec.dashboardPages.push(spec)
  }
}

class GardenSdkProvider<ProviderConfigType extends BaseProviderConfig, ProviderOutputsType extends {}> {
  _configType: ProviderConfigType
  _outputsType: ProviderOutputsType

  constructor(
    private readonly spec: FilledPluginSpec,
    private readonly configSchema: ObjectBaseZod,
    private readonly outputsSchema: ObjectBaseZod
  ) {}

  getConfigSchema() {
    return baseProviderConfigSchemaZod.merge(this.configSchema)
  }

  getOutputsSchema() {
    return this.outputsSchema
  }

  addHandler<T extends keyof ProviderHandlers>(
    type: T,
    handler: ActionHandler<
      ProviderActionParams<ProviderConfigType>[T],
      ProviderActionOutputs<ProviderConfigType, ProviderOutputsType>[T]
    >
  ) {
    // TODO: work out how to lose any cast
    this.spec.handlers[type] = <any>handler
  }

  addCommand(command: PluginCommand<ProviderConfigType>) {
    this.spec.commands.push(command)
  }

  createActionType<
    K extends ActionKind,
    SpecSchema extends ObjectBaseZod,
    StaticOutputsSchema extends ObjectBaseZod,
    RuntimeOutputsSchema extends ObjectBaseZod
  >(params: {
    kind: K
    name: string
    docs: string
    specSchema: SpecSchema
    staticOutputsSchema: StaticOutputsSchema
    runtimeOutputsSchema: RuntimeOutputsSchema
  }): GardenSdkActionDefinition<
    GardenSdkProvider<ProviderConfigType, ProviderOutputsType>,
    K,
    z.infer<SpecSchema>,
    z.infer<StaticOutputsSchema>,
    z.infer<RuntimeOutputsSchema>
  > {
    const def = createActionType({ ...params, provider: this })
    this.addActionType(def)
    return def
  }

  addActionType(def: GardenSdkActionDefinition<any, any, any, any, any>) {
    if (!this.spec.createActionTypes[def.kind]) {
      this.spec.createActionTypes[def.kind] = []
    }
    this.spec.createActionTypes[def.kind]!.push(<any>def.getSpec()) // FIXME
  }
}

type GetActionType<
  K extends ActionKind,
  SpecType extends {},
  StaticOutputsType extends {},
  RuntimeOutputsType extends {}
> = K extends "Build"
  ? BuildAction<BaseActionConfig<K, any, SpecType>, StaticOutputsType, RuntimeOutputsType>
  : K extends "Deploy"
  ? DeployAction<BaseActionConfig<K, any, SpecType>, StaticOutputsType, RuntimeOutputsType>
  : K extends "Run"
  ? RunAction<BaseActionConfig<K, any, SpecType>, StaticOutputsType, RuntimeOutputsType>
  : K extends "Test"
  ? TestAction<BaseActionConfig<K, any, SpecType>, StaticOutputsType, RuntimeOutputsType>
  : never

type GetActionTypeDescriptions<A extends BaseAction> = A extends BuildAction
  ? BuildActionDescriptions<A>
  : A extends DeployAction
  ? DeployActionDescriptions<A>
  : A extends RunAction
  ? RunActionDescriptions<A>
  : A extends TestAction
  ? TestActionDescriptions<A>
  : never

export class GardenSdkActionDefinition<
  P extends GardenSdkProvider<any, any>,
  Kind extends ActionKind,
  SpecType extends {},
  StaticOutputsType extends {},
  RuntimeOutputsType extends {}
> {
  constructor(
    protected provider: P,
    protected actionSpec: ActionTypeDefinition<ActionTypeHandlers[Kind]>,
    public readonly kind: Kind,
    public readonly name: string,
    public readonly docs: string
  ) {}

  getSpec() {
    return this.actionSpec
  }

  addHandler<
    HandlerType extends keyof GetActionTypeDescriptions<
      GetActionType<Kind, SpecType, StaticOutputsType, RuntimeOutputsType>
    >
  >(
    type: HandlerType,
    handler: ActionTypeHandler<
      Kind,
      HandlerType,
      GetActionTypeParams<
        GetActionTypeDescriptions<GetActionType<Kind, SpecType, StaticOutputsType, RuntimeOutputsType>>[HandlerType]
      > &
        PluginActionParamsBase<P["_configType"]>,
      GetActionTypeResults<
        GetActionTypeDescriptions<GetActionType<Kind, SpecType, StaticOutputsType, RuntimeOutputsType>>[HandlerType]
      >
    >
  ) {
    // TODO: work out how to lose any casts
    const handlers = <any>this.actionSpec.handlers
    handlers[type] = <any>handler
  }
}

interface CreateGardenPluginCallbackParams {
  plugin: GardenSdkPlugin
  s: typeof s
}
type CreateGardenPluginCallback = (params: CreateGardenPluginCallbackParams) => void

function createProvider<C extends ObjectBaseZod, O extends ObjectBaseZod>(
  plugin: GardenSdkPlugin,
  configSchema: C,
  outputsSchema: O
) {
  // Make sure base provider config properties are not overridden
  const baseKeys = Object.keys(baseProviderConfigSchemaZod.shape)
  for (const key of Object.keys(configSchema.shape)) {
    if (baseKeys.includes(key)) {
      throw new ValidationError(
        `Attempted to re-define built-in provider config field '${key}'. Built-in fields may not be overridden.`,
        { key }
      )
    }
  }
  const spec = plugin.getSpec()
  const mergedProviderSchema = baseProviderConfigSchemaZod.merge(configSchema)
  const provider = new GardenSdkProvider<BaseProviderConfig & z.infer<C>, z.infer<O>>(
    spec,
    mergedProviderSchema,
    outputsSchema
  )
  return provider
}

function createActionType<
  P extends GardenSdkProvider<any, any>,
  K extends ActionKind,
  SpecSchema extends ObjectBaseZod,
  StaticOutputsSchema extends ObjectBaseZod,
  RuntimeOutputsSchema extends ObjectBaseZod
>({
  provider,
  kind,
  name,
  docs,
  specSchema,
  staticOutputsSchema,
  runtimeOutputsSchema,
}: {
  provider: P
  kind: K
  name: string
  docs: string
  specSchema: SpecSchema
  staticOutputsSchema: StaticOutputsSchema
  runtimeOutputsSchema: RuntimeOutputsSchema
}): GardenSdkActionDefinition<P, K, z.infer<SpecSchema>, z.infer<StaticOutputsSchema>, z.infer<RuntimeOutputsSchema>> {
  const actionSpec: ActionTypeDefinition<ActionTypeHandlers[K]> = {
    name,
    docs,
    schema: zodObjectToJoi(specSchema),
    staticOutputsSchema: zodObjectToJoi(staticOutputsSchema),
    runtimeOutputsSchema: zodObjectToJoi(runtimeOutputsSchema),
    handlers: {},
  }
  return new GardenSdkActionDefinition(provider, actionSpec, kind, name, docs)
}

export const sdk = {
  schema: s,
  s, // Shorthand

  createGardenPlugin(spec: GardenSdkPluginSpec, cb?: CreateGardenPluginCallback) {
    const plugin = new GardenSdkPlugin(spec)
    cb && cb({ plugin, s })
    return plugin
  },
  createProvider,
  createActionType,
}
