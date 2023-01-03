/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BaseActionTask, ActionTaskProcessParams, ActionTaskStatusParams, BaseTask, ValidResultType } from "./base"
import { Profile } from "../util/profiling"
import { Action, ActionState, ExecutedAction, Resolved, ResolvedAction } from "../actions/types"
import { ActionSpecContext } from "../config/template-contexts/actions"
import { resolveTemplateStrings } from "../template-string/template-string"
import { InternalError } from "../exceptions"
import { validateWithPath } from "../config/validation"
import { DeepPrimitiveMap } from "../config/common"
import { merge } from "lodash"
import { resolveVariables } from "../graph/common"
import { resolveAction } from "../actions/helpers"

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

  getName() {
    return this.action.key()
  }

  async getStatus({}: ActionTaskStatusParams<T>) {
    return null
  }

  resolveStatusDependencies() {
    return []
  }

  resolveProcessDependencies(): BaseTask[] {
    // TODO-G2B
    // If we get a resolved task upfront, e.g. from module conversion, we could avoid resolving any dependencies.
    // if (this.action.getConfig().internal?.resolved) {
    //   return []
    // }

    return this.action.getDependencyReferences().flatMap((d): BaseTask[] => {
      const action = this.graph.getActionByRef(d)

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

  async process({
    dependencyResults,
  }: ActionTaskProcessParams<T, ResolveActionResults<T>>): Promise<ResolveActionResults<T>> {
    const action = this.action

    // Collect dependencies
    const resolvedDependencies: ResolvedAction[] = []
    const executedDependencies: ExecutedAction[] = []

    // TODO-G2: get this to a type-safer place
    for (const task of dependencyResults.getTasks()) {
      if (task instanceof ResolveActionTask) {
        const r = dependencyResults.getResult(task)
        if (!r) {
          continue
        }
        resolvedDependencies.push(r.outputs.resolvedAction)
      } else if (task.isExecuteTask()) {
        const r = dependencyResults.getResult(task)
        if (!r) {
          continue
        }
        r.result
        executedDependencies.push(r.outputs.executedAction)
      }
    }

    // Resolve variables
    let groupVariables: DeepPrimitiveMap = {}
    const groupName = action.groupName()

    if (groupName) {
      const group = this.graph.getGroup(groupName)

      groupVariables = resolveTemplateStrings(
        await resolveVariables({ basePath: group.path, variables: group.variables, varfiles: group.varfiles }),
        new ActionSpecContext({
          garden: this.garden,
          resolvedProviders: await this.garden.resolveProviders(this.log),
          action,
          modules: this.graph.getModules(),
          partialRuntimeResolution: false,
          executedDependencies,
          variables: {},
        })
      )
    }

    const config = action.getConfig()

    const actionVariables = resolveTemplateStrings(
      await resolveVariables({
        basePath: action.basePath(),
        variables: config.variables,
        varfiles: config.varfiles,
      }),
      new ActionSpecContext({
        garden: this.garden,
        resolvedProviders: await this.garden.resolveProviders(this.log),
        action,
        modules: this.graph.getModules(),
        partialRuntimeResolution: false,
        executedDependencies,
        variables: groupVariables,
      })
    )

    const variables = groupVariables
    merge(variables, actionVariables)
    // Override with CLI-set variables
    merge(variables, this.garden.cliVariables)

    // Resolve spec
    let spec = resolveTemplateStrings(
      action.getConfig().spec || {},
      new ActionSpecContext({
        garden: this.garden,
        resolvedProviders: await this.garden.resolveProviders(this.log),
        action,
        modules: this.graph.getModules(),
        partialRuntimeResolution: false,
        executedDependencies,
        variables,
      })
    )

    // Validate spec
    spec = await this.validateSpec(spec)

    // Resolve action without outputs
    const resolvedAction = resolveAction(action, {
      dependencyResults,
      executedDependencies,
      resolvedDependencies,
      variables,
      spec,
      staticOutputs: {},
    }) as Resolved<T>

    // Get outputs and assign to the resolved action
    const router = await this.garden.getActionRouter()
    const staticOutputs = await router.getActionOutputs({
      action: resolvedAction,
      graph: this.graph,
      log: this.log,
    })
    // TODO-G2: validate the outputs
    // TODO-G2B: avoid this private assignment
    resolvedAction["_outputs"] = staticOutputs

    return {
      state: "ready",
      outputs: {
        resolvedAction,
      },
      detail: null,
    }
  }

  private async validateSpec<S>(spec: S) {
    const actionTypes = await this.garden.getActionTypes()
    const { kind, type } = this.action
    const actionType = actionTypes[kind][type]
    const description = this.action.longDescription()

    if (!actionType) {
      // This should be caught way earlier in normal usage, so it's an internal error
      throw new InternalError(`Could not find type definition for ${description}.`, { kind, type })
    }

    const path = this.action.basePath()

    spec = validateWithPath({
      config: spec,
      schema: actionType.schema,
      path,
      projectRoot: this.garden.projectRoot,
      configType: `spec for ${description}`,
    })

    for (const base of await this.garden.getActionTypeBases(kind, type)) {
      this.log.silly(`Validating ${description} spec against '${base.name}' schema`)

      spec = validateWithPath({
        config: spec,
        schema: base.schema,
        path,
        projectRoot: this.garden.projectRoot,
        configType: `spec for ${description} (base schema from '${base.name}' plugin)`,
      })
    }

    return spec
  }
}
