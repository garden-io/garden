/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ActionTaskStatusParams, BaseTask, ValidResultType, ActionTaskProcessParams } from "./base.js"
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
import { resolveTemplateStrings } from "../template-string/template-string.js"
import { InternalError } from "../exceptions.js"
import { validateWithPath } from "../config/validation.js"
import type { DeepPrimitiveMap } from "../config/common.js"
import { merge } from "lodash-es"
import { mergeVariables } from "../graph/common.js"
import { actionToResolved } from "../actions/helpers.js"
import { ResolvedConfigGraph } from "../graph/config-graph.js"
import { OtelTraced } from "../util/open-telemetry/decorators.js"

export interface ResolveActionResults<T extends Action> extends ValidResultType {
  state: ActionState
  outputs: {
    resolvedAction: Resolved<T>
  }
  detail: null
}

@Profile()
export class ResolveActionTask<T extends Action> extends BaseActionTask<T, ResolveActionResults<T>> {
  type = "resolve-action"

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

    // Resolve template inputs
    const inputsContext = new ActionSpecContext({
      garden: this.garden,
      resolvedProviders: await this.garden.resolveProviders(this.log),
      action,
      modules: this.graph.getModules(),
      partialRuntimeResolution: false,
      resolvedDependencies,
      executedDependencies,
      variables: {},
      inputs: {},
    })

    const template = config.internal.templateName ? this.garden.configTemplates[config.internal.templateName] : null

    const inputs = resolveTemplateStrings({
      value: config.internal.inputs || {},
      context: inputsContext,
      contextOpts: { allowPartial: false },
      source: { yamlDoc: template?.internal.yamlDoc, basePath: ["inputs"] },
    })

    // Resolve variables
    let groupVariables: DeepPrimitiveMap = {}
    const groupName = action.groupName()

    if (groupName) {
      const group = this.graph.getGroup(groupName)

      groupVariables = resolveTemplateStrings({
        value: await mergeVariables({ basePath: group.path, variables: group.variables, varfiles: group.varfiles }),
        context: inputsContext,
        // TODO: map variables to their source
        source: undefined,
      })
    }

    const actionVariables = resolveTemplateStrings({
      value: await mergeVariables({
        basePath: action.sourcePath(),
        variables: config.variables,
        varfiles: config.varfiles,
      }),
      context: new ActionSpecContext({
        garden: this.garden,
        resolvedProviders: await this.garden.resolveProviders(this.log),
        action,
        modules: this.graph.getModules(),
        partialRuntimeResolution: false,
        resolvedDependencies,
        executedDependencies,
        variables: groupVariables,
        inputs,
      }),
      // TODO: map variables to their source
      source: undefined,
    })

    const variables = groupVariables
    merge(variables, actionVariables)
    // Override with CLI-set variables
    merge(variables, this.garden.variableOverrides)

    // Resolve spec
    let spec = resolveTemplateStrings({
      value: action.getConfig().spec || {},
      context: new ActionSpecContext({
        garden: this.garden,
        resolvedProviders: await this.garden.resolveProviders(this.log),
        action,
        modules: this.graph.getModules(),
        partialRuntimeResolution: false,
        resolvedDependencies,
        executedDependencies,
        variables,
        inputs,
      }),
      source: { yamlDoc: action.getInternal().yamlDoc, basePath: ["spec"] },
    })

    // Validate spec
    spec = await this.validateSpec(spec)

    // Resolve action without outputs
    const resolvedGraph = new ResolvedConfigGraph({
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
      inputs,
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
      source: { yamlDoc: internal.yamlDoc, basePath: ["spec"] },
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
        source: { yamlDoc: internal.yamlDoc, basePath: ["spec"] },
      })
    }

    return spec
  }
}
