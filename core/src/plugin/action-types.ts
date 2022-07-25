/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { mapValues } from "lodash"
import { outputSchemaDocs, ResolvedActionHandlerDescription } from "./plugin"
import { ActionTypeHandlerSpec, baseHandlerSchema } from "./handlers/base/base"
import { DoBuildAction } from "./handlers/build/build"
import { GetBuildActionStatus } from "./handlers/build/get-status"
import { PublishBuildAction } from "./handlers/build/publish"
import { RunBuildAction } from "./handlers/build/run"
import { DeleteDeploy } from "./handlers/deploy/delete"
import { ExecInDeploy } from "./handlers/deploy/exec"
import { GetDeployLogs } from "./handlers/deploy/get-logs"
import { GetDeployPortForward } from "./handlers/deploy/get-port-forward"
import { GetDeployStatus } from "./handlers/deploy/get-status"
import { RunDeploy } from "./handlers/deploy/run"
import { StopDeployPortForward } from "./handlers/deploy/stop-port-forward"
import { GetRunActionResult } from "./handlers/run/get-result"
import { RunRunAction } from "./handlers/run/run"
import { GetTestActionResult } from "./handlers/test/get-result"
import { RunTestAction } from "./handlers/test/run"
import { Action, ResolvedRuntimeAction, RuntimeAction } from "../actions/base"
import Joi from "@hapi/joi"
import { joi, joiArray, joiSchema, joiUserIdentifier } from "../config/common"
import titleize from "titleize"
import { BuildAction, ResolvedBuildAction } from "../actions/build"
import { DeployAction } from "../actions/deploy"
import { RunAction } from "../actions/run"
import { TestAction } from "../actions/test"
import { DoDeployAction } from "./handlers/deploy/deploy"
import { dedent } from "../util/string"
import { templateStringLiteral } from "../docs/common"
import { ValidateAction } from "./handlers/base/validate"
import { ConfigureActionConfig } from "./handlers/base/configure"

// BASE //

export type ActionTypeHandler<
  K extends ActionKind,
  N, // Name of handler
  P extends {}, // Params type
  R extends {} // Result type
> = ((params: P) => Promise<R>) & {
  handlerType?: N
  actionType?: string
  pluginName?: string
  base?: ActionTypeHandler<K, N, P, R>
}

export type GetActionTypeParams<T> = T extends ActionTypeHandlerSpec<any, any, any> ? T["_paramsType"] : null
export type GetActionTypeResults<T> = T extends ActionTypeHandlerSpec<any, any, any> ? T["_resultType"] : null
export type GetActionTypeHandler<T, N> = T extends ActionTypeHandlerSpec<any, any, any>
  ? ActionTypeHandler<T["_kindType"], N, T["_paramsType"], T["_resultType"]>
  : ActionTypeHandler<any, N, any, any>
export type WrappedActionTypeHandler<T, N> = GetActionTypeHandler<T, N> & {
  handlerType: N
  actionType: string
  pluginName: string
}

// TODO-G2: suggest and describe handlers
const actionTypeClasses = {
  Build: {
    configure: new ConfigureActionConfig(),
    validate: new ValidateAction(),
    build: new DoBuildAction(),
    getStatus: new GetBuildActionStatus(),
    publish: new PublishBuildAction(),
    run: new RunBuildAction(),
  },
  Deploy: {
    configure: new ConfigureActionConfig(),
    validate: new ValidateAction(),
    delete: new DeleteDeploy(),
    deploy: new DoDeployAction(),
    exec: new ExecInDeploy(),
    getLogs: new GetDeployLogs(),
    getPortForward: new GetDeployPortForward(),
    getStatus: new GetDeployStatus(),
    run: new RunDeploy(),
    stopPortForward: new StopDeployPortForward(),
  },
  Run: {
    configure: new ConfigureActionConfig(),
    validate: new ValidateAction(),
    getResult: new GetRunActionResult(),
    run: new RunRunAction(),
  },
  Test: {
    configure: new ConfigureActionConfig(),
    validate: new ValidateAction(),
    getResult: new GetTestActionResult(),
    run: new RunTestAction(),
  },
}

type _ActionTypeClasses = typeof actionTypeClasses

export type ActionKind = "Build" | "Deploy" | "Run" | "Test"
export type ActionTypeClasses<K extends ActionKind> = _ActionTypeClasses[K]

export type ActionHandlers = { [name: string]: ActionTypeHandler<any, any, any, any> }

type BaseHandlers<A extends Action> = {
  configure: ConfigureActionConfig<A["_config"]>
  validate: ValidateAction<A>
}

export type ActionTypeExtension<H> = {
  name: string
  handlers: Partial<H>
}

export type ActionTypeDefinition<H> = ActionTypeExtension<H> & {
  base?: string
  docs: string
  // TODO: specify the schemas using primitives (e.g. JSONSchema/OpenAPI) and not Joi objects
  schema: Joi.ObjectSchema
  outputsSchema?: Joi.ObjectSchema
  title?: string
}

// BUILD //

// These handlers receive an unresolved Action (i.e. without outputs)
type UnresolvedBuildHandlers = "build" | "getStatus"

export type BuildActionDescriptions<C extends BuildAction = BuildAction> = BaseHandlers<C> & {
  build: DoBuildAction<C>
  getStatus: GetBuildActionStatus<C>
  publish: PublishBuildAction<C>
  run: RunBuildAction<C>
}

export type BuildActionHandler<
  N extends keyof BuildActionDescriptions,
  T extends BuildAction = BuildAction
> = N extends UnresolvedBuildHandlers
  ? GetActionTypeHandler<BuildActionDescriptions<T>[N], N>
  : GetActionTypeHandler<BuildActionDescriptions<ResolvedBuildAction<T["_config"], T["_outputs"]>>[N], N>

export type BuildActionParams<
  N extends keyof BuildActionDescriptions,
  T extends BuildAction = BuildAction
> = N extends UnresolvedBuildHandlers
  ? GetActionTypeParams<BuildActionDescriptions<T>[N]>
  : GetActionTypeParams<BuildActionDescriptions<ResolvedBuildAction<T["_config"], T["_outputs"]>>[N]>

export type BuildActionResults<
  N extends keyof BuildActionDescriptions,
  T extends BuildAction = BuildAction
> = N extends UnresolvedBuildHandlers
  ? GetActionTypeResults<BuildActionDescriptions<T>[N]>
  : GetActionTypeResults<BuildActionDescriptions<ResolvedBuildAction<T["_config"], T["_outputs"]>>[N]>

export type BuildActionHandlers<C extends BuildAction = BuildAction> = {
  [N in keyof BuildActionDescriptions]?: BuildActionHandler<N, C>
}

export type BuildActionExtension<C extends BuildAction = BuildAction> = ActionTypeExtension<BuildActionHandlers<C>>
export type BuildActionDefinition<C extends BuildAction = BuildAction> = ActionTypeDefinition<BuildActionHandlers<C>>

// DEPLOY //

type DeployActionDescriptions<C extends DeployAction = DeployAction> = BaseHandlers<C> & {
  delete: DeleteDeploy<C>
  deploy: DoDeployAction<C>
  exec: ExecInDeploy<C>
  getLogs: GetDeployLogs<C>
  getPortForward: GetDeployPortForward<C>
  getStatus: GetDeployStatus<C>
  run: RunDeploy<C>
  stopPortForward: StopDeployPortForward<C>
}

type UnresolvedDeployHandlers = "deploy" | "getStatus" | "delete"

export type DeployActionHandler<
  N extends keyof DeployActionDescriptions,
  T extends DeployAction = DeployAction
> = N extends UnresolvedDeployHandlers
  ? GetActionTypeHandler<DeployActionDescriptions<T>[N], N>
  : GetActionTypeHandler<DeployActionDescriptions<ResolvedRuntimeAction<T["_config"], T["_outputs"]>>[N], N>

export type DeployActionParams<
  N extends keyof DeployActionDescriptions,
  C extends DeployAction = DeployAction
> = GetActionTypeParams<DeployActionDescriptions<C>[N]>

export type DeployActionHandlers<C extends DeployAction = DeployAction> = {
  [N in keyof DeployActionDescriptions]?: DeployActionHandler<N, C>
}

export type DeployActionExtension<C extends DeployAction = DeployAction> = ActionTypeExtension<DeployActionHandlers<C>>
export type DeployActionDefinition<C extends DeployAction = DeployAction> = ActionTypeDefinition<
  DeployActionHandlers<C>
>

// RUN //

type RunActionDescriptions<C extends RunAction = RunAction> = BaseHandlers<C> & {
  getResult: GetRunActionResult<C>
  run: RunRunAction<C>
}

export type RunActionHandler<
  N extends keyof RunActionDescriptions,
  C extends RunAction = RunAction
> = GetActionTypeHandler<RunActionDescriptions<C>[N], N>

export type RunActionHandlers<C extends RunAction = RunAction> = {
  [N in keyof RunActionDescriptions]?: RunActionHandler<N, C>
}

export type RunActionExtension<C extends RunAction = RunAction> = ActionTypeExtension<RunActionHandlers<C>>
export type RunActionDefinition<C extends RunAction = RunAction> = ActionTypeDefinition<RunActionHandlers<C>>

// TEST //

type TestActionDescriptions<C extends TestAction = TestAction> = BaseHandlers<C> & {
  getResult: GetTestActionResult<C>
  run: RunTestAction<C>
}

export type TestActionHandlers<C extends TestAction = TestAction> = {
  [N in keyof TestActionDescriptions]?: TestActionHandler<N, C>
}

export type TestActionHandler<
  N extends keyof TestActionDescriptions,
  C extends TestAction = TestAction
> = GetActionTypeHandler<TestActionDescriptions<C>[N], N>

export type TestActionExtension<C extends TestAction = TestAction> = ActionTypeExtension<TestActionHandlers<C>>
export type TestActionDefinition<C extends TestAction = TestAction> = ActionTypeDefinition<TestActionHandlers<C>>

// COMBINED //

export interface ActionTypeDescriptions {
  Build: BuildActionDescriptions
  Deploy: DeployActionDescriptions
  Run: RunActionDescriptions
  Test: TestActionDescriptions
}

export type GenericActionTypeMap = {
  [K in ActionKind]: K extends "Build" ? BuildAction : RuntimeAction
}

export interface ActionTypeMap extends GenericActionTypeMap {
  Build: BuildAction
  Deploy: DeployAction
  Run: RunAction
  Test: TestAction
}

export type ActionTypeParams = {
  [K in ActionKind]: {
    [H in keyof ActionTypeDescriptions[K]]: GetActionTypeParams<ActionTypeDescriptions[K][H]>
  }
}

export type ActionTypeResults = {
  [K in ActionKind]: {
    [H in keyof ActionTypeDescriptions[K]]: GetActionTypeResults<ActionTypeDescriptions[K][H]>
  }
}

export type ActionTypeHandlers = {
  Build: BuildActionHandlers
  Deploy: DeployActionHandlers
  Run: RunActionHandlers
  Test: TestActionHandlers
}

export type ActionTypeHandlerNames = {
  [K in ActionKind]: keyof ActionTypeHandlers[K]
}

export interface ResolvedActionTypeHandlerDescription<N = string> extends ResolvedActionHandlerDescription<N> {
  cls: ActionTypeHandlerSpec<any, any, any>
}

export type ResolvedActionTypeHandlerDescriptions = {
  [K in ActionKind]: Required<
    {
      [H in keyof ActionTypeClasses<K>]: ResolvedActionTypeHandlerDescription<H>
    }
  >
}

// It takes a short while to resolve all these schemas, so we cache the result
let _actionTypeHandlerDescriptions

export function getActionTypeHandlerDescriptions<K extends ActionKind>(
  kind: ActionKind
): ResolvedActionTypeHandlerDescriptions[K] {
  if (!_actionTypeHandlerDescriptions) {
    _actionTypeHandlerDescriptions = {}
  }

  if (_actionTypeHandlerDescriptions[kind]) {
    return _actionTypeHandlerDescriptions[kind]
  }

  _actionTypeHandlerDescriptions[kind] = mapValues(actionTypeClasses[kind], (cls, name: any) => {
    return {
      name,
      cls,
      ...cls.describe(),
    }
  })

  return _actionTypeHandlerDescriptions
}

export type ManyActionTypeExtensions = {
  Build: BuildActionExtension[]
  Deploy: DeployActionExtension[]
  Run: RunActionExtension[]
  Test: TestActionExtension[]
}
export type ActionTypeDefinitions = {
  Build: BuildActionDefinition
  Deploy: DeployActionDefinition
  Run: RunActionDefinition
  Test: TestActionDefinition
}
export type ManyActionTypeDefinitions = {
  [K in ActionKind]: ActionTypeDefinitions[K][]
}

const createActionTypeSchema = (kind: ActionKind) => {
  const titleKind = titleize(kind)
  const descriptions = getActionTypeHandlerDescriptions(kind)

  return joi
    .object()
    .keys({
      name: joiUserIdentifier().description(`The name of the ${titleKind} type to create.`),
      docs: joi.string().required().description("Documentation for the action, in markdown format."),
      title: joi
        .string()
        .description(
          "Readable title for the module type. Defaults to the title-cased type name, with dashes replaced by spaces."
        ),
      schema: joiSchema().required().description(dedent`
        A valid Joi schema describing the configuration keys for the \`spec\` field on the action type.

        If the action type has a \`base\`, you must either omit this field to inherit the base's schema, make sure
        that the specified schema is a _superset_ of the base's schema (i.e. only adds or further constrains existing
        fields), _or_ specify a \`configure\` handler that returns a module config compatible with the base's
        schema. This is to ensure that plugin handlers made for the base type also work with this action type.
      `),
      outputsSchema: joiSchema().description(dedent`
        A valid Joi schema describing the keys that each action of this type outputs at config resolution time,
        for use in template strings (e.g. ${templateStringLiteral(`${kind}.my-${kind}.outputs.some-key`)}).

        ${outputSchemaDocs}
      `),
      handlers: mapValues(descriptions[kind], (d) => {
        const schema = baseHandlerSchema().description(d.description)
        return d.required ? schema.required() : schema
      }),
    })
    .description(`Define a ${titleKind} action.`)
}

export const createActionTypesSchema = () => {
  return joi
    .object()
    .keys(mapValues(actionTypeClasses, (_, k: ActionKind) => joiArray(createActionTypeSchema(k)).unique("name")))
}

const extendActionTypeSchema = (kind: ActionKind) => {
  const titleKind = titleize(kind)
  const descriptions = getActionTypeHandlerDescriptions(kind)

  return joi
    .object()
    .keys({
      name: joiUserIdentifier().description(`The name of the ${titleKind} action type to extend.`),
      handlers: mapValues(descriptions, (d) => baseHandlerSchema().description(d.description)),
    })
    .description(`Extend a ${titleKind} action.`)
}

export const extendActionTypesSchema = () => {
  return joi
    .object()
    .keys(mapValues(actionTypeClasses, (_, k: ActionKind) => joiArray(extendActionTypeSchema(k)).unique("name")))
}
