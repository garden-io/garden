/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type {
  BaseActionTaskParams,
  BaseTask,
  ActionTaskProcessParams,
  ActionTaskStatusParams,
  ResolveProcessDependenciesParams,
  ValidResultType,
} from "./base.js"
import { BaseActionTask } from "./base.js"
import { Profile } from "../util/profiling.js"
import type { TestAction } from "../actions/test.js"
import type { PlanTestResult } from "../plugin/handlers/Test/plan.js"
import { resolvedActionToExecuted } from "../actions/helpers.js"
import { OtelTraced } from "../util/open-telemetry/decorators.js"
import { styles } from "../logger/styles.js"
import { GraphError } from "../exceptions.js"
import { deline } from "../util/string.js"
import type { Action } from "../actions/types.js"
import { registerPlanTaskFactory, createPlanTaskForAction } from "./plan-helpers.js"

export interface PlanTestTaskParams extends BaseActionTaskParams<TestAction> {}

interface PlanTestTaskResult extends PlanTestResult {
  version: string
  executedAction: any
}

@Profile()
export class PlanTestTask extends BaseActionTask<TestAction, PlanTestTaskResult> {
  readonly type = "plan-test" as const
  readonly statusConcurrencyLimit = 10
  readonly executeConcurrencyLimit = 10
  readonly defaultStatusConcurrencyLimit = 10
  readonly defaultExecuteConcurrencyLimit = 10

  constructor(params: PlanTestTaskParams) {
    super(params)
  }

  getDescription() {
    return this.action.longDescription()
  }

  /**
   * Override to return plan tasks for dependencies instead of execute tasks.
   * This ensures all dependencies are also planned (dry-run) instead of executed.
   */
  override resolveProcessDependencies({ status }: ResolveProcessDependenciesParams<ValidResultType>): BaseTask[] {
    const resolveTask = this.getResolveTask(this.action)

    if (status?.state === "ready" && !this.force) {
      return [resolveTask]
    }

    const deps = this.action.getDependencyReferences().flatMap((dep): BaseTask[] => {
      const action = this.graph.getActionByRef(dep, { includeDisabled: true })
      const disabled = action.isDisabled()

      if (dep.needsExecutedOutputs) {
        if (disabled) {
          throw new GraphError({
            message: deline`
            ${this.action.longDescription()} depends on one or more runtime outputs from action
             ${styles.highlight(action.key())}, which is disabled.
             Please either remove the reference or enable the action.`,
          })
        }
        return [this.getTaskForAction(action)]
      } else if (dep.explicit) {
        if (this.skipRuntimeDependencies || disabled) {
          if (dep.needsStaticOutputs) {
            return [this.getResolveTask(action)]
          } else {
            return []
          }
        } else {
          return [this.getTaskForAction(action)]
        }
      } else if (dep.needsStaticOutputs) {
        return [this.getResolveTask(action)]
      } else {
        return []
      }
    })

    return [resolveTask, ...deps]
  }

  /**
   * Returns the appropriate plan task for an action.
   */
  private getTaskForAction(action: Action): BaseTask {
    return createPlanTaskForAction(action, () => this.getDependencyParams(), this.forceActions)
  }

  @OtelTraced({
    name(_params) {
      return `${this.action.key()}.getPlanTestStatus`
    },
    getAttributes(_params) {
      return {
        key: this.action.key(),
        kind: this.action.kind,
      }
    },
  })
  async getStatus({
    dependencyResults: _dependencyResults,
  }: ActionTaskStatusParams<TestAction>): Promise<PlanTestTaskResult | null> {
    // For plan tasks, we always want to run the plan - there's no cached "ready" state
    return null
  }

  @OtelTraced({
    name(_params) {
      return `${this.action.key()}.planTest`
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
  }: ActionTaskProcessParams<TestAction, PlanTestTaskResult>): Promise<PlanTestTaskResult> {
    const action = this.getResolvedAction(this.action, dependencyResults)
    const log = this.log.createLog()
    const version = action.versionString(log)

    log.info(`Planning Test ${styles.highlight(action.name)} (type ${styles.highlight(action.type)})...`)

    const router = await this.garden.getActionRouter()

    const { result: planResult } = await router.test.plan({
      graph: this.graph,
      action,
      log,
    })

    log.info(planResult.planDescription)

    // Create a pseudo-executed action with the plan outputs
    const executedAction = resolvedActionToExecuted(action, {
      status: {
        state: planResult.state,
        outputs: planResult.outputs,
        detail: null,
      },
    })

    return {
      ...planResult,
      version,
      executedAction,
    }
  }
}

export function isPlanTestTask(task: BaseTask): task is PlanTestTask {
  return task.type === "plan-test"
}

export function createPlanTestTask(params: PlanTestTaskParams) {
  return new PlanTestTask(params)
}

// Register the factory for Test actions
registerPlanTaskFactory("Test", (params) => new PlanTestTask(params as PlanTestTaskParams))
