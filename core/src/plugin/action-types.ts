/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { mapValues, memoize } from "lodash-es"
import type { ResolvedActionHandlerDescription } from "./plugin.js"
import { outputSchemaDocs } from "./plugin.js"
import type { ActionTypeHandlerSpec } from "./handlers/base/base.js"
import { baseHandlerSchema } from "./handlers/base/base.js"
import { DoBuildAction } from "./handlers/Build/build.js"
import { GetBuildActionStatus } from "./handlers/Build/get-status.js"
import { PublishBuildAction } from "./handlers/Build/publish.js"
import { DeleteDeploy } from "./handlers/Deploy/delete.js"
import { ExecInDeploy } from "./handlers/Deploy/exec.js"
import { GetDeployLogs } from "./handlers/Deploy/get-logs.js"
import { GetDeployPortForward } from "./handlers/Deploy/get-port-forward.js"
import { GetDeployStatus } from "./handlers/Deploy/get-status.js"
import { StopDeployPortForward } from "./handlers/Deploy/stop-port-forward.js"
import { GetRunActionResult } from "./handlers/Run/get-result.js"
import { RunRunAction } from "./handlers/Run/run.js"
import { GetTestActionResult } from "./handlers/Test/get-result.js"
import { RunTestAction } from "./handlers/Test/run.js"
import type { Action } from "../actions/types.js"
import type Joi from "@hapi/joi"
import { joi, joiArray, joiIdentifier, joiSchema, joiUserIdentifier } from "../config/common.js"
import titleize from "titleize"
import type { BuildAction } from "../actions/build.js"
import type { DeployAction } from "../actions/deploy.js"
import type { RunAction } from "../actions/run.js"
import type { TestAction } from "../actions/test.js"
import { DoDeployAction } from "./handlers/Deploy/deploy.js"
import { dedent } from "../util/string.js"
import { templateStringLiteral } from "../docs/common.js"
import { ValidateAction } from "./handlers/base/validate.js"
import { ConfigureActionConfig } from "./handlers/base/configure.js"
import { GetActionOutputs } from "./handlers/base/get-outputs.js"
import { StartSync } from "./handlers/Deploy/start-sync.js"
import { StopSync } from "./handlers/Deploy/stop-sync.js"
import { GetSyncStatus } from "./handlers/Deploy/get-sync-status.js"

// BASE //

export type ActionTypeHandler<
  K extends ActionKind,
  N, // Name of handler
  P extends {}, // Params type
  R extends {}, // Result type
> = ((params: P) => Promise<R>) & {
  handlerType?: N
  actionType?: string
  pluginName?: string
  base?: ActionTypeHandler<K, N, P, R>
}

export type GetActionTypeParams<T> = T extends ActionTypeHandlerSpec<any, infer ParamsType, any> ? ParamsType : {}
export type GetActionTypeResults<T> = T extends ActionTypeHandlerSpec<any, any, infer ResultType> ? ResultType : {}
export type GetActionTypeHandler<T, N> =
  T extends ActionTypeHandlerSpec<infer KindType, infer ParamsType, infer ResultType>
    ? ActionTypeHandler<KindType, N, ParamsType, ResultType>
    : ActionTypeHandler<any, N, any, any>
export type WrappedActionTypeHandler<T, N> = GetActionTypeHandler<T, N> & {
  handlerType: N
  actionType: string
  pluginName: string
}

const baseActionTypeClasses = {
  configure: new ConfigureActionConfig(),
  getOutputs: new GetActionOutputs(),
  validate: new ValidateAction(),
}

// TODO-0.13.1: add suggest handler similar to the one for modules
const actionTypeClasses = {
  Build: {
    ...baseActionTypeClasses,
    build: new DoBuildAction(),
    getStatus: new GetBuildActionStatus(),
    publish: new PublishBuildAction(),
  },
  Deploy: {
    ...baseActionTypeClasses,
    delete: new DeleteDeploy(),
    deploy: new DoDeployAction(),
    exec: new ExecInDeploy(),
    getLogs: new GetDeployLogs(),
    getPortForward: new GetDeployPortForward(),
    getStatus: new GetDeployStatus(),
    getSyncStatus: new GetSyncStatus(),
    startSync: new StartSync(),
    stopPortForward: new StopDeployPortForward(),
    stopSync: new StopSync(),
  },
  Run: {
    ...baseActionTypeClasses,
    getResult: new GetRunActionResult(),
    run: new RunRunAction(),
  },
  Test: {
    ...baseActionTypeClasses,
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
  getOutputs: GetActionOutputs<A>
}

export type ActionTypeExtension<H extends ActionHandlers> = {
  name: string
  handlers: Partial<H>
}

export type ActionTypeDefinition<H extends ActionHandlers> = ActionTypeExtension<H> & {
  base?: string
  docs: string
  // TODO: specify the schemas using primitives (e.g. JSONSchema/OpenAPI) and not Joi objects
  schema: Joi.ObjectSchema
  staticOutputsSchema?: Joi.ObjectSchema
  runtimeOutputsSchema?: Joi.ObjectSchema
  title?: string
}

// BUILD //

export type BuildActionDescriptions<C extends BuildAction = BuildAction> = BaseHandlers<C> & {
  build: DoBuildAction<C>
  getStatus: GetBuildActionStatus<C>
  publish: PublishBuildAction<C>
}

export type BuildActionHandler<
  N extends keyof BuildActionDescriptions,
  T extends BuildAction = BuildAction,
> = GetActionTypeHandler<BuildActionDescriptions<T>[N], N>

export type BuildActionParams<
  N extends keyof BuildActionDescriptions,
  T extends BuildAction = BuildAction,
> = GetActionTypeParams<BuildActionDescriptions<T>[N]>

export type BuildActionResults<
  N extends keyof BuildActionDescriptions,
  T extends BuildAction = BuildAction,
> = GetActionTypeResults<BuildActionDescriptions<T>[N]>

export type BuildActionHandlers<C extends BuildAction = BuildAction> = {
  [N in keyof BuildActionDescriptions]?: BuildActionHandler<N, C>
}

export type BuildActionExtension<C extends BuildAction = BuildAction> = ActionTypeExtension<BuildActionHandlers<C>>
export type BuildActionDefinition<C extends BuildAction = BuildAction> = ActionTypeDefinition<BuildActionHandlers<C>>

// DEPLOY //

export type DeployActionDescriptions<C extends DeployAction = DeployAction> = BaseHandlers<C> & {
  delete: DeleteDeploy<C>
  deploy: DoDeployAction<C>
  exec: ExecInDeploy<C>
  getLogs: GetDeployLogs<C>
  getPortForward: GetDeployPortForward<C>
  getStatus: GetDeployStatus<C>
  getSyncStatus: GetSyncStatus<C>
  startSync: StartSync<C>
  stopPortForward: StopDeployPortForward<C>
  stopSync: StopSync<C>
}

export type DeployActionHandler<
  N extends keyof DeployActionDescriptions,
  T extends DeployAction = DeployAction,
> = GetActionTypeHandler<DeployActionDescriptions<T>[N], N>

export type DeployActionParams<
  N extends keyof DeployActionDescriptions,
  C extends DeployAction = DeployAction,
> = GetActionTypeParams<DeployActionDescriptions<C>[N]>

export type DeployActionHandlers<C extends DeployAction = DeployAction> = {
  [N in keyof DeployActionDescriptions]?: DeployActionHandler<N, C>
}

export type DeployActionExtension<C extends DeployAction = DeployAction> = ActionTypeExtension<DeployActionHandlers<C>>
export type DeployActionDefinition<C extends DeployAction = DeployAction> = ActionTypeDefinition<
  DeployActionHandlers<C>
>

// RUN //

export type RunActionDescriptions<C extends RunAction = RunAction> = BaseHandlers<C> & {
  getResult: GetRunActionResult<C>
  run: RunRunAction<C>
}

export type RunActionHandler<
  N extends keyof RunActionDescriptions,
  C extends RunAction = RunAction,
> = GetActionTypeHandler<RunActionDescriptions<C>[N], N>

export type RunActionHandlers<C extends RunAction = RunAction> = {
  [N in keyof RunActionDescriptions]?: RunActionHandler<N, C>
}

export type RunActionExtension<C extends RunAction = RunAction> = ActionTypeExtension<RunActionHandlers<C>>
export type RunActionDefinition<C extends RunAction = RunAction> = ActionTypeDefinition<RunActionHandlers<C>>

// TEST //

export type TestActionDescriptions<C extends TestAction = TestAction> = BaseHandlers<C> & {
  getResult: GetTestActionResult<C>
  run: RunTestAction<C>
}

export type TestActionHandlers<C extends TestAction = TestAction> = {
  [N in keyof TestActionDescriptions]?: TestActionHandler<N, C>
}

export type TestActionHandler<
  N extends keyof TestActionDescriptions,
  C extends TestAction = TestAction,
> = GetActionTypeHandler<TestActionDescriptions<C>[N], N>

export type TestActionExtension<C extends TestAction = TestAction> = ActionTypeExtension<TestActionHandlers<C>>
export type TestActionDefinition<C extends TestAction = TestAction> = ActionTypeDefinition<TestActionHandlers<C>>

// COMBINED //

export interface ActionClassMap {
  Build: BuildAction
  Deploy: DeployAction
  Run: RunAction
  Test: TestAction
}

export type ActionTypeHandlers = {
  Build: BuildActionHandlers
  Deploy: DeployActionHandlers
  Run: RunActionHandlers
  Test: TestActionHandlers
}

export interface ResolvedActionTypeHandlerDescription<N = string> extends ResolvedActionHandlerDescription<N> {
  cls: ActionTypeHandlerSpec<any, any, any>
}

export type ResolvedActionTypeHandlerDescriptions = {
  [K in ActionKind]: Required<{
    [H in keyof ActionTypeClasses<K>]: ResolvedActionTypeHandlerDescription<H>
  }>
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

  return _actionTypeHandlerDescriptions[kind]
}

export type ActionTypeExtensions = {
  Build: BuildActionExtension
  Deploy: DeployActionExtension
  Run: RunActionExtension
  Test: TestActionExtension
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
  Build: BuildActionDefinition[]
  Deploy: DeployActionDefinition[]
  Run: RunActionDefinition[]
  Test: TestActionDefinition[]
}

const createActionTypeSchema = (kind: ActionKind) => {
  const titleKind = titleize(kind)
  const descriptions = getActionTypeHandlerDescriptions(kind)

  const handlers = mapValues(descriptions, (d) => {
    const schema = baseHandlerSchema().description(d.description)
    return d.required ? schema.required() : schema
  })

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
      base: joiIdentifier().description(dedent`
        Name of action type to use as a base for this action type.

        If specified, providers that support the base action type also work with this type.
        Note that some constraints apply on the configuration and output schemas. Please see each of the schema
        fields for details.
      `),
      schema: joiSchema().required().description(dedent`
        A valid Joi schema describing the configuration keys for the \`spec\` field on the action type.

        If the action type has a \`base\`, you must either omit this field to inherit the base's schema, make sure
        that the specified schema is a _superset_ of the base's schema (i.e. only adds or further constrains existing
        fields), _or_ specify a \`configure\` handler that returns a module config compatible with the base's
        schema. This is to ensure that plugin handlers made for the base type also work with this action type.
      `),
      staticOutputsSchema: joiSchema().description(dedent`
        A valid Joi schema describing the keys that each action of this type outputs at config resolution time,
        i.e. those returned by the \`getOutputs\` handler.

        These can be referenced in template strings
        (e.g. ${templateStringLiteral(`${kind}.my-${kind}.outputs.some-key`)}).

        It is strongly preferred for outputs to be statically output by the \`getOutputs\` handler and defined here
        whenever possible, since this avoids having to execute the action ahead of resolving any actions that reference
        these outputs.

        The keys in this schema should never overlap with those defined in \`runtimeOutputsSchema\`, and the schema
        should not allow unknown keys.

        ${outputSchemaDocs}
      `),
      runtimeOutputsSchema: joiSchema().description(dedent`
        A valid Joi schema describing the keys that each action of this type outputs after execution,
        i.e. those returned by the \`getStatus\` handler when the action is ready, or the relevant execution handler
        (\`build\`, \`deploy\`, \`run\` etc.).

        These can be referenced in template strings
        (e.g. ${templateStringLiteral(`${kind}.my-${kind}.outputs.some-key`)}).

        Note that when these outputs are referenced by other actions, this action needs to be ready or executed before
        resolving the dependant action, so it is preferable to use static outputs (see \`staticOutputsSchema\`)
        whenever possible.

        The keys in this schema should never overlap with those defined in \`staticOutputsSchema\`.

        ${outputSchemaDocs}
      `),
      handlers,
    })
    .description(`Define a ${titleKind} action.`)
}

export const createActionTypesSchema = memoize(() => {
  return joi
    .object()
    .keys(mapValues(actionTypeClasses, (_, k: ActionKind) => joiArray(createActionTypeSchema(k)).unique("name")))
})

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

export const extendActionTypesSchema = memoize(() => {
  return joi
    .object()
    .keys(mapValues(actionTypeClasses, (_, k: ActionKind) => joiArray(extendActionTypeSchema(k)).unique("name")))
})
