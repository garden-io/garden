/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { mapValues } from "lodash"
import { outputSchemaDocs, ResolvedActionHandlerDescriptions } from "./plugin"
import { ActionTypeHandlerSpec, baseHandlerSchema } from "./handlers/base/base"
import { BuildBuildAction } from "./handlers/build/build"
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
import { Action, ActionKind, ResolvedRuntimeAction } from "../actions/base"
import Joi from "@hapi/joi"
import { joi, joiArray, joiSchema, joiUserIdentifier } from "../config/common"
import titleize from "titleize"
import { BuildAction, ResolvedBuildAction } from "../actions/build"
import { DeployAction } from "../actions/deploy"
import { RunAction } from "../actions/run"
import { TestAction } from "../actions/test"
import { DeployDeployAction } from "./handlers/deploy/deploy"
import { dedent } from "../util/string"
import { templateStringLiteral } from "../docs/common"

// BASE //

type ActionTypeHandler<
  K extends ActionKind,
  N, // Name of handler
  P extends {}, // Params type
  R extends {} // Result type
> = ((params: P) => Promise<R>) & {
  actionKind?: K
  handlerName?: N
  pluginName?: string
  base?: ActionTypeHandler<K, N, P, R>
}

type GetActionTypeParams<T> = T extends ActionTypeHandlerSpec<any, any, any> ? T["_paramsType"] : null
type GetActionTypeResults<T> = T extends ActionTypeHandlerSpec<any, any, any> ? T["_resultType"] : null
type GetActionTypeHandler<T, N> = T extends ActionTypeHandlerSpec<any, any, any>
  ? ActionTypeHandler<T["_kindType"], N, T["_paramsType"], T["_resultType"]>
  : null

type BaseHandlers<_ extends Action> = {
  // TODO: see if this is actually needed, consider only allowing validating fully-resolved Actions
  // validateConfig: ValidateActionConfig<C>
}

type ActionTypeExtension<H> = {
  name: string
  handlers: Partial<H>
}

type ActionTypeDefinition<H> = ActionTypeExtension<H> & {
  base?: string
  docs: string
  // TODO: specify the schemas using primitives (e.g. JSONSchema/OpenAPI) and not Joi objects
  schema: Joi.ObjectSchema
  outputsSchema?: Joi.ObjectSchema
  title?: string
}

// BUILD //

type BuildActionDescriptions<C extends BuildAction = BuildAction> = BaseHandlers<C> & {
  build: BuildBuildAction<C>
  getStatus: GetBuildActionStatus<C>
  publish: PublishBuildAction<C>
  run: RunBuildAction<C>
}

export type BuildActionHandler<
  N extends keyof BuildActionDescriptions,
  C extends BuildAction = BuildAction
> = N extends "build" | "getStatus"
  ? GetActionTypeHandler<BuildActionDescriptions<C>[N], N>
  : GetActionTypeHandler<BuildActionDescriptions<ResolvedBuildAction<C>>[N], N>

export type BuildActionHandlers<C extends BuildAction = BuildAction> = {
  [N in keyof BuildActionDescriptions]?: BuildActionHandler<N, C>
}

export type BuildActionExtension<C extends BuildAction = BuildAction> = ActionTypeExtension<BuildActionHandlers<C>>
export type BuildActionDefinition<C extends BuildAction = BuildAction> = ActionTypeDefinition<BuildActionHandlers<C>>

// DEPLOY //

type DeployActionDescriptions<C extends DeployAction = DeployAction> = BaseHandlers<C> & {
  delete: DeleteDeploy<C>
  deploy: DeployDeployAction<C>
  exec: ExecInDeploy<C>
  getLogs: GetDeployLogs<C>
  getPortForward: GetDeployPortForward<C>
  getStatus: GetDeployStatus<C>
  run: RunDeploy<C>
  stopPortForward: StopDeployPortForward<C>
}

export type DeployActionHandler<
  N extends keyof DeployActionDescriptions,
  C extends DeployAction = DeployAction
> = N extends "deploy" | "getStatus"
  ? GetActionTypeHandler<DeployActionDescriptions<C>[N], N>
  : GetActionTypeHandler<DeployActionDescriptions<ResolvedRuntimeAction<C>>[N], N>

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

export type RunActionHandler<N extends keyof RunActionDescriptions, C extends RunAction = RunAction> = N extends
  | "run"
  | "getResult"
  ? GetActionTypeHandler<RunActionDescriptions<C>[N], N>
  : GetActionTypeHandler<RunActionDescriptions<ResolvedRuntimeAction<C>>[N], N>

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

export type TestActionHandler<N extends keyof TestActionDescriptions, C extends TestAction = TestAction> = N extends
  | "run"
  | "getResult"
  ? GetActionTypeHandler<TestActionDescriptions<C>[N], N>
  : GetActionTypeHandler<TestActionDescriptions<ResolvedRuntimeAction<C>>[N], N>

export type TestActionExtension<C extends TestAction = TestAction> = ActionTypeExtension<TestActionHandlers<C>>
export type TestActionDefinition<C extends TestAction = TestAction> = ActionTypeDefinition<TestActionHandlers<C>>

// COMBINED //

interface _ActionTypeHandlerDescriptions {
  build: BuildActionDescriptions
  deploy: DeployActionDescriptions
  run: RunActionDescriptions
  test: TestActionDescriptions
}

export type ResolvedActionTypeHandlerDescriptions = {
  [K in ActionKind]: ResolvedActionHandlerDescriptions
}

// It takes a short while to resolve all these schemas, so we cache the result
let _actionTypeHandlerDescriptions: ResolvedActionTypeHandlerDescriptions

export function getActionTypeHandlerDescriptions(): ResolvedActionTypeHandlerDescriptions {
  if (_actionTypeHandlerDescriptions) {
    return _actionTypeHandlerDescriptions
  }

  const descriptions: _ActionTypeHandlerDescriptions = {
    build: {
      // validateConfig: new ValidateActionConfig(),
      build: new BuildBuildAction(),
      getStatus: new GetBuildActionStatus(),
      publish: new PublishBuildAction(),
      run: new RunBuildAction(),
    },
    deploy: {
      // validateConfig: new ValidateActionConfig(),
      delete: new DeleteDeploy(),
      deploy: new DeployDeployAction(),
      exec: new ExecInDeploy(),
      getLogs: new GetDeployLogs(),
      getPortForward: new GetDeployPortForward(),
      getStatus: new GetDeployStatus(),
      run: new RunDeploy(),
      stopPortForward: new StopDeployPortForward(),
    },
    run: {
      // validateConfig: new ValidateActionConfig(),
      getResult: new GetRunActionResult(),
      run: new RunRunAction(),
    },
    test: {
      // validateConfig: new ValidateActionConfig(),
      getResult: new GetTestActionResult(),
      run: new RunTestAction(),
    },
  }

  _actionTypeHandlerDescriptions = mapValues(descriptions, (byType) => {
    return mapValues(byType, (cls) => {
      return {
        description: cls.description,
        required: cls.required,
        paramsSchema: cls.paramsSchema().keys({
          base: baseHandlerSchema(),
        }),
        resultSchema: cls.resultSchema(),
      }
    })
  })

  return _actionTypeHandlerDescriptions
}

export type ActionTypeExtensions = {
  build?: BuildActionExtension[]
  deploy?: DeployActionExtension[]
  run?: RunActionExtension[]
  test?: TestActionExtension[]
}
export type ActionTypeDefinitions = {
  build?: BuildActionDefinition[]
  deploy?: DeployActionDefinition[]
  run?: RunActionDefinition[]
  test?: TestActionDefinition[]
}

const createActionTypeSchema = (kind: ActionKind) => {
  const titleKind = titleize(kind)
  const descriptions = getActionTypeHandlerDescriptions()

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
  const descriptions = getActionTypeHandlerDescriptions()
  return joi
    .object()
    .keys(mapValues(descriptions, (_, k: ActionKind) => joiArray(createActionTypeSchema(k)).unique("name")))
}

const extendActionTypeSchema = (kind: string) => {
  const titleKind = titleize(kind)
  const descriptions = getActionTypeHandlerDescriptions()

  return joi
    .object()
    .keys({
      name: joiUserIdentifier().description(`The name of the ${titleKind} action type to extend.`),
      handlers: mapValues(descriptions[kind], (d) => baseHandlerSchema().description(d.description)),
    })
    .description(`Extend a ${titleKind} action.`)
}

export const extendActionTypesSchema = () => {
  const descriptions = getActionTypeHandlerDescriptions()
  return joi.object().keys(mapValues(descriptions, (_, k) => joiArray(extendActionTypeSchema(k)).unique("name")))
}
