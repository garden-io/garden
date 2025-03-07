/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type {
  ActionTaskStatusParams,
  BaseTask,
  ValidResultType,
  ActionTaskProcessParams,
  BaseActionTaskParams,
} from "./base.js"
import { BaseActionTask } from "./base.js"
import { Profile } from "../util/profiling.js"
import type {
  Action,
  ActionState,
  BaseActionConfig,
  ExecutedAction,
  Resolved,
  ResolvedAction,
} from "../actions/types.js"
import { ActionSpecContext } from "../config/template-contexts/actions.js"
import { InternalError } from "../exceptions.js"
import { validateWithPath } from "../config/validation.js"
import { actionToResolved } from "../actions/helpers.js"
import { ResolvedConfigGraph } from "../graph/config-graph.js"
import { OtelTraced } from "../util/open-telemetry/decorators.js"
import { deepEvaluate } from "../template/evaluate.js"
import { deepResolveContext } from "../config/template-contexts/base.js"
import { isPlainObject } from "../util/objects.js"
import type { DeepPrimitiveMap } from "@garden-io/platform-api-types"
import { describeActionConfig } from "../actions/base.js"
import { InputContext } from "../config/template-contexts/input.js"
import { VariablesContext } from "../config/template-contexts/variables.js"
import type { GroupConfig } from "../config/group.js"
import { throwOnMissingSecretKeys } from "../config/secrets.js"
import { RemoteSourceConfigContext } from "../config/template-contexts/project.js"

export interface ResolveActionResults<T extends Action> extends ValidResultType {
  state: ActionState
  outputs: {
    resolvedAction: Resolved<T>
  }
  detail: null
}

@Profile()
export class ResolveActionTask<T extends Action> extends BaseActionTask<T, ResolveActionResults<T>> {
  readonly type = "resolve-action"

  // TODO: resolving template strings is CPU bound, does single-threaded concurrent execution make it faster or slower?
  override readonly executeConcurrencyLimit = 10
  override readonly statusConcurrencyLimit = 10

  constructor(params: BaseActionTaskParams<T>) {
    super(params)
    throwOnMissingSecretKeys({
      configs: [this.action.getConfig()],
      context: new RemoteSourceConfigContext(params.garden, params.garden.variables),
      secrets: params.garden.secrets,
      prefix: this.action.kind,
      isLoggedIn: params.garden.isLoggedIn(),
      cloudBackendDomain: params.garden.cloudDomain,
      log: this.log,
    })
  }

  getDescription() {
    return `resolve ${this.action.longDescription()}`
  }

  override getName() {
    return this.action.key()
  }

  getStatus({}: ActionTaskStatusParams<T>) {
    return null
  }

  override resolveStatusDependencies() {
    return []
  }

  override resolveProcessDependencies(): BaseTask[] {
    // TODO-0.13.1
    // If we get a resolved task upfront, e.g. from module conversion, we could avoid resolving any dependencies.
    // if (this.action.getConfig().internal?.resolved) {
    //   return []
    // }

    return this.action.getDependencyReferences().flatMap((d): BaseTask[] => {
      const action = this.graph.getActionByRef(d, { includeDisabled: true })

      if (d.needsExecutedOutputs) {
        // Need runtime outputs from dependency
        return [this.getExecuteTask(action)]
      } else if (d.needsStaticOutputs || d.explicit) {
        // Needs a static output from dependency
        return [this.getResolveTask(action)]
      } else {
        return []
      }
    })
  }

  @OtelTraced({
    name(_params) {
      return this.action.key() + ".resolveAction"
    },
    getAttributes(_params) {
      return {
        key: this.action.key(),
        kind: this.action.kind,
      }
    },
  })
  async process({
    dependencyResults,
  }: ActionTaskProcessParams<T, ResolveActionResults<T>>): Promise<ResolveActionResults<T>> {
    const action = this.action
    const config = action.getConfig() as BaseActionConfig

    // Collect dependencies
    const resolvedDependencies: ResolvedAction[] = []
    const executedDependencies: ExecutedAction[] = []

    // TODO: get this to a type-safer place
    for (const task of dependencyResults.getTasks()) {
      if (task instanceof ResolveActionTask) {
        const r = dependencyResults.getResult(task)
        if (!r) {
          continue
        }
        resolvedDependencies.push(r.outputs.resolvedAction)
      } else if (task.isExecuteTask()) {
        const r = dependencyResults.getResult(task)
        if (!r?.result) {
          continue
        }
        executedDependencies.push(r.result.executedAction)
      }
    }

    let resolvedInputs: DeepPrimitiveMap = deepEvaluate(config.internal.inputs || {}, {
      context: new ActionSpecContext({
        garden: this.garden,
        resolvedProviders: await this.garden.resolveProviders({ log: this.log }),
        action,
        modules: this.graph.getModules(),
        resolvedDependencies,
        executedDependencies,
        variables: this.garden.variables, // inputs cannot access action variables
        inputs: new InputContext({}), // inputs cannot reference themselves
      }),
      opts: {},
    })

    const templateName = config.internal.templateName
    if (templateName) {
      const template = this.garden.configTemplates[templateName]
      if (!template) {
        throw new InternalError({
          message: `Could not find template name ${templateName} for ${describeActionConfig(config)}`,
        })
      }
      // we must apply the input schema on partially evaluated inputs for backwards compatibility
      resolvedInputs = validateWithPath<DeepPrimitiveMap>({
        config: resolvedInputs,
        configType: `inputs for action ${config.name}`,
        path: this.action.effectiveConfigFileLocation(),
        schema: template.inputsSchema,
        projectRoot: this.garden.projectRoot,
        source: undefined,
      })
    }

    const inputs = new InputContext(
      resolvedInputs,
      // defaults are already applied on the inputs
      undefined
    )

    const inputsContext = new ActionSpecContext({
      garden: this.garden,
      resolvedProviders: await this.garden.resolveProviders({ log: this.log }),
      action,
      modules: this.graph.getModules(),
      resolvedDependencies,
      executedDependencies,
      variables: this.garden.variables,
      inputs,
    })

    // Resolve variables
    const groupName = action.groupName()

    let group: GroupConfig | undefined
    if (groupName) {
      group = this.graph.getGroup(groupName)
    }

    const variables = await VariablesContext.forAction(this.garden, config, inputsContext, group)

    const resolvedVariables = deepResolveContext("action variables", variables, inputsContext)
    if (!isPlainObject(resolvedVariables)) {
      throw new InternalError({
        message: `Action variables for ${action.describe()} evaluated to ${typeof resolvedVariables}, expected a plain object.`,
      })
    }

    // Resolve spec
    let spec = deepEvaluate(action.getConfig().spec || {}, {
      context: new ActionSpecContext({
        garden: this.garden,
        resolvedProviders: await this.garden.resolveProviders({ log: this.log }),
        action,
        modules: this.graph.getModules(),
        resolvedDependencies,
        executedDependencies,
        variables,
        inputs,
      }),
      opts: {},
    })

    // Validate spec
    spec = await this.validateSpec(spec)

    // Resolve action without outputs
    const resolvedGraph = new ResolvedConfigGraph({
      environmentName: this.graph.environmentName,
      actions: [...resolvedDependencies, ...executedDependencies],
      moduleGraph: this.graph.moduleGraph,
      groups: this.graph.getGroups(),
    })

    const resolvedAction = actionToResolved(action, {
      resolvedGraph,
      dependencyResults,
      executedDependencies,
      resolvedDependencies,
      variables,
      resolvedVariables,
      inputs: resolvedInputs,
      spec,
      staticOutputs: {},
    }) as Resolved<T>

    // Get outputs and assign to the resolved action
    const router = await this.garden.getActionRouter()
    const { outputs: staticOutputs } = await router.getActionOutputs({
      action: resolvedAction,
      graph: this.graph,
      log: this.log,
    })

    // Validate the outputs
    const actionRouter = router.getRouterForActionKind(resolvedAction.kind)
    await actionRouter.validateActionOutputs(resolvedAction, "static", staticOutputs)

    await actionRouter.callHandler({
      handlerType: "validate",
      params: { action: resolvedAction, graph: resolvedGraph, log: this.log, events: undefined },
      defaultHandler: async (_) => ({}),
    })

    // TODO: avoid this private assignment
    resolvedAction["_staticOutputs"] = staticOutputs

    return {
      state: "ready",
      outputs: {
        resolvedAction,
      },
      detail: null,
    }
  }

  @OtelTraced({
    name: "validateAction",
    getAttributes(_spec) {
      return {
        key: this.action.key(),
        kind: this.action.kind,
      }
    },
  })
  private async validateSpec<S>(spec: S) {
    const actionTypes = await this.garden.getActionTypes()
    const { kind, type } = this.action
    const actionType = actionTypes[kind][type]?.spec
    const description = this.action.longDescription()

    if (!actionType) {
      // This should be caught way earlier in normal usage, so it's an internal error
      throw new InternalError({
        message: `Could not find type definition for ${description} (kind: ${kind}, type: ${type}).`,
      })
    }

    const path = this.action.sourcePath()
    const internal = this.action.getInternal()

    spec = validateWithPath({
      config: spec,
      schema: actionType.schema,
      path,
      projectRoot: this.garden.projectRoot,
      configType: `spec for ${description}`,
      source: { yamlDoc: internal.yamlDoc, path: ["spec"] },
    })

    const actionTypeBases = await this.garden.getActionTypeBases(kind, type)
    for (const base of actionTypeBases) {
      this.log.silly(() => `Validating ${description} spec against '${base.name}' schema`)

      spec = validateWithPath({
        config: spec,
        schema: base.schema,
        path,
        projectRoot: this.garden.projectRoot,
        configType: `spec for ${description} (base schema from '${base.name}' plugin)`,
        source: { yamlDoc: internal.yamlDoc, path: ["spec"] },
      })
    }

    return spec
  }
}
