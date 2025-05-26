/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { z } from "zod"
import type { BaseAction } from "../actions/base.js"
import type { BuildAction, BuildActionConfig } from "../actions/build.js"
import type { DeployAction, DeployActionConfig } from "../actions/deploy.js"
import type { RunAction, RunActionConfig } from "../actions/run.js"
import type { TestAction, TestActionConfig } from "../actions/test.js"
import { joi, zodObjectToJoi } from "../config/common.js"
import type { BaseProviderConfig } from "../config/provider.js"
import { baseProviderConfigSchemaZod } from "../config/provider.js"
import { s } from "../config/zod.js"
import { ValidationError } from "../exceptions.js"
import type {
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
} from "./action-types.js"
import type { PluginCommand } from "./command.js"
import type { DashboardPage } from "./handlers/Provider/getDashboardPage.js"
import type {
  ActionHandler,
  GardenPluginSpec,
  PartialGardenPluginSpec,
  PluginActionParamsBase,
  PluginDependency,
  ProviderActionOutputs,
  ProviderActionParams,
  ProviderHandlers,
} from "./plugin.js"
import type { PluginToolSpec } from "./tools.js"
import { dedent } from "../util/string.js"
import type { BuildStatus as _BuildStatus } from "./handlers/Build/get-status.js"

type ObjectBaseZod = z.ZodObject<{}>

type GardenSdkPluginSpec = Pick<
  PartialGardenPluginSpec,
  "name" | "docs" | "dependencies" | "createModuleTypes" | "extendModuleTypes"
>

export type BuildStatus = _BuildStatus

export class GardenSdkPlugin {
  public readonly name: string
  private readonly spec: GardenPluginSpec

  constructor(spec: GardenSdkPluginSpec) {
    this.name = spec.name

    this.spec = {
      name: spec.name,
      docs: spec.docs || null,

      // These are always set on the _provider_, not on the plugin.
      // TODO: Move provider-specific fields in the plugin spec. We'll want to allow multiple providers per plugin.
      // (Best to do this after moving all plugins to the new SDK.)
      base: null,
      configSchema: joi.object(),
      outputsSchema: joi.object(),

      dependencies: spec.dependencies || [],

      handlers: {},
      commands: [],
      tools: [],
      dashboardPages: [],

      createModuleTypes: spec.createModuleTypes || [],
      extendModuleTypes: spec.extendModuleTypes || [],

      createActionTypes: {
        Build: [],
        Deploy: [],
        Run: [],
        Test: [],
      },
      extendActionTypes: {
        Build: [],
        Deploy: [],
        Run: [],
        Test: [],
      },
    }
  }

  getSpec() {
    return { ...this.spec }
  }

  // TODO: support multiple providers per plugin
  // TODO: infer schema types from base
  /**
   * Define a provider and its config+output schemas, and attach it to the plugin.
   *
   * If the provider has a base, you must make sure that both schemas are compatible with the base's schemas.
   *
   * Note: Currently only one provider is supported per plugin.
   * Calling this a second time will overwrite previous calls.
   */
  createProvider<C extends ObjectBaseZod, O extends ObjectBaseZod>({
    base,
    configSchema,
    outputsSchema,
  }: {
    base?: GardenSdkProvider<any, any, any>
    configSchema: C
    outputsSchema: O
  }) {
    const provider = createProvider(this, configSchema!, outputsSchema!, base)
    this.setProvider(provider)
    return provider
  }

  setProvider(provider: GardenSdkProvider<any, any, any>) {
    this.spec.base = provider.base?.name || null
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

type GardenSdkProdiverConfigType<T> =
  T extends GardenSdkProvider<any, infer ProviderConfigType, any> ? ProviderConfigType : never

export class GardenSdkProvider<
  Base extends GardenSdkProvider<any, any, any> | undefined,
  ProviderConfigType extends BaseProviderConfig,
  ProviderOutputsType extends {},
> {
  constructor(
    public readonly name: string,
    private readonly spec: GardenPluginSpec,
    private readonly configSchema: ObjectBaseZod,
    private readonly outputsSchema: ObjectBaseZod,
    public readonly base: Base | undefined
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
    RuntimeOutputsSchema extends ObjectBaseZod,
  >(params: {
    kind: K
    name: string
    docs: string
    specSchema: SpecSchema
    staticOutputsSchema: StaticOutputsSchema
    runtimeOutputsSchema: RuntimeOutputsSchema
  }): GardenSdkActionDefinition<
    GardenSdkProvider<Base, ProviderConfigType, ProviderOutputsType>,
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
  RuntimeOutputsType extends {},
> = K extends "Build"
  ? BuildAction<BuildActionConfig<any, SpecType>, StaticOutputsType, RuntimeOutputsType>
  : K extends "Deploy"
    ? DeployAction<DeployActionConfig<any, SpecType>, StaticOutputsType, RuntimeOutputsType>
    : K extends "Run"
      ? RunAction<RunActionConfig<any, SpecType>, StaticOutputsType, RuntimeOutputsType>
      : K extends "Test"
        ? TestAction<TestActionConfig<any, SpecType>, StaticOutputsType, RuntimeOutputsType>
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

export type GardenSdkActionDefinitionActionType<T> =
  T extends GardenSdkActionDefinition<
    any,
    infer Kind,
    infer SpecType,
    infer StaticOutputsType,
    infer RuntimeOutputsType
  >
    ? GetActionType<Kind, SpecType, StaticOutputsType, RuntimeOutputsType>
    : never

export type GardenSdkActionDefinitionConfigType<T> =
  T extends GardenSdkActionDefinition<any, any, any, any, any>
    ? GardenSdkActionDefinitionActionType<T>["_config"]
    : never

export type GardenSdkActionDefinitionSpecType<T> =
  T extends GardenSdkActionDefinition<any, any, infer SpecType, any, any> ? SpecType : never
export class GardenSdkActionDefinition<
  P extends GardenSdkProvider<any, any, any>,
  Kind extends ActionKind,
  SpecType extends {},
  StaticOutputsType extends {},
  RuntimeOutputsType extends {},
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
    >,
  >(
    type: HandlerType,
    handler: ActionTypeHandler<
      Kind,
      HandlerType,
      GetActionTypeParams<
        GetActionTypeDescriptions<GetActionType<Kind, SpecType, StaticOutputsType, RuntimeOutputsType>>[HandlerType]
      > &
        PluginActionParamsBase<GardenSdkProdiverConfigType<P>>,
      GetActionTypeResults<
        GetActionTypeDescriptions<GetActionType<Kind, SpecType, StaticOutputsType, RuntimeOutputsType>>[HandlerType]
      >
    >
  ) {
    // TODO: work out how to lose any casts
    const handlers = <any>this.actionSpec.handlers
    handlers[type] = <any>handler
    return handler
  }
}

function createProvider<
  Base extends GardenSdkProvider<any, any, any> | undefined,
  C extends ObjectBaseZod,
  O extends ObjectBaseZod,
>(plugin: GardenSdkPlugin, configSchema: C, outputsSchema: O, base?: Base) {
  // Make sure base provider config properties are not overridden
  const baseKeys = Object.keys(baseProviderConfigSchemaZod.shape)
  for (const key of Object.keys(configSchema.shape)) {
    if (baseKeys.includes(key)) {
      throw new ValidationError({
        message: `Attempted to re-define built-in provider config field '${key}'. Built-in fields may not be overridden.`,
      })
    }
  }

  const spec = plugin.getSpec()

  if (base) {
    // TODO: Make sure schemas are compatible with base
  }

  // Zod by default strips unknown keys. We want spec schemas to be strict (i.e. not allow unknown fields).
  const mergedProviderSchema = baseProviderConfigSchemaZod.merge(configSchema).strict()

  const provider = new GardenSdkProvider<Base, BaseProviderConfig & z.infer<C>, z.infer<O>>(
    spec.name,
    spec,
    mergedProviderSchema,
    outputsSchema,
    base
  )
  return provider
}

function createActionType<
  P extends GardenSdkProvider<any, any, any>,
  K extends ActionKind,
  SpecSchema extends ObjectBaseZod,
  StaticOutputsSchema extends ObjectBaseZod,
  RuntimeOutputsSchema extends ObjectBaseZod,
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
    // Zod by default strips unknown keys. We want spec schemas to be strict (i.e. not allow unknown fields).
    schema: zodObjectToJoi(specSchema.strict()),
    staticOutputsSchema: zodObjectToJoi(staticOutputsSchema),
    runtimeOutputsSchema: zodObjectToJoi(runtimeOutputsSchema),
    handlers: {},
  }
  return new GardenSdkActionDefinition(provider, actionSpec, kind, name, docs)
}

export const sdk = {
  schema: s,
  s, // Shorthand

  createGardenPlugin(spec: GardenSdkPluginSpec) {
    return new GardenSdkPlugin(spec)
  },

  createProvider,
  createActionType,

  util: {
    dedent,
  },
}
