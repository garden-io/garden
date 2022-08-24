/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BaseActionTask, ActionTaskProcessParams, ActionTaskStatusParams } from "./base"
import { Profile } from "../util/profiling"
import { Action, ActionState, ExecutedAction, Resolved, ResolvedAction } from "../actions/base"
import { ActionSpecContext } from "../config/template-contexts/actions"
import { resolveTemplateStrings } from "../template-string/template-string"
import { InternalError } from "../exceptions"
import { validateWithPath } from "../config/validation"

export interface ResolveActionResults<T extends Action> {
  state: ActionState
  outputs: {
    resolvedAction: Resolved<T>
  }
}

@Profile()
export class ResolveActionTask<T extends Action> extends BaseActionTask<T, ResolveActionResults<T>> {
  type = "resolve-action"

  getDescription() {
    return `resolve ${this.action.longDescription()}`
  }

  async getStatus({}: ActionTaskStatusParams<T>) {
    return null
  }

  resolveStatusDependencies() {
    return []
  }

  resolveProcessDependencies() {
    return this.action.getDependencyReferences().map((d) => {
      const action = this.graph.getActionByRef(d)

      if (d.type === "implicit") {
        return this.getResolveTask(action)
      } else {
        return this.getExecuteTask(action)
      }
    })
  }

  async process({
    dependencyResults,
  }: ActionTaskProcessParams<T, ResolveActionResults<T>>): Promise<ResolveActionResults<T>> {
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
    const variables = resolveTemplateStrings(
      this.action.getConfig().variables || {},
      new ActionSpecContext({
        garden: this.garden,
        resolvedProviders: await this.garden.resolveProviders(this.log),
        action: this.action,
        modules: this.graph.getModules(),
        partialRuntimeResolution: false,
        executedDependencies,
        variables: {},
      })
    )

    // Resolve spec
    let spec = resolveTemplateStrings(
      this.action.getConfig().spec || {},
      new ActionSpecContext({
        garden: this.garden,
        resolvedProviders: await this.garden.resolveProviders(this.log),
        action: this.action,
        modules: this.graph.getModules(),
        partialRuntimeResolution: false,
        executedDependencies,
        variables,
      })
    )

    // -> Validate spec
    spec = await this.validateSpec(spec)

    // Resolve dependency graph
    const resolvedAction = <Resolved<T>>(
      this.action.resolve({ dependencyResults, executedDependencies, resolvedDependencies, variables, spec })
    )

    return {
      state: "ready",
      outputs: {
        resolvedAction,
      },
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
