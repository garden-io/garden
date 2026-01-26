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
import type { DeployAction } from "../actions/deploy.js"
import type { PlanDeployResult } from "../plugin/handlers/Deploy/plan.js"
import { resolvedActionToExecuted } from "../actions/helpers.js"
import { OtelTraced } from "../util/open-telemetry/decorators.js"
import { styles } from "../logger/styles.js"
import { GraphError } from "../exceptions.js"
import { deline } from "../util/string.js"
import type { Action } from "../actions/types.js"
import { registerPlanTaskFactory, createPlanTaskForAction } from "./plan-helpers.js"

export interface PlanTaskParams extends BaseActionTaskParams<DeployAction> {}

interface PlanTaskResult extends PlanDeployResult {
  version: string
  executedAction: any
}

@Profile()
export class PlanTask extends BaseActionTask<DeployAction, PlanTaskResult> {
  readonly type = "plan" as const
  readonly statusConcurrencyLimit = 10
  readonly executeConcurrencyLimit = 10
  readonly defaultStatusConcurrencyLimit = 10
  readonly defaultExecuteConcurrencyLimit = 10

  constructor(params: PlanTaskParams) {
    super(params)
  }

  getDescription() {
    return this.action.longDescription()
  }

  /**
   * Override to return PlanTask for Deploy dependencies instead of DeployTask.
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
        // Use appropriate plan task for all action types
        return [this.getTaskForAction(action)]
      } else if (dep.explicit) {
        if (this.skipRuntimeDependencies || disabled) {
          if (dep.needsStaticOutputs) {
            return [this.getResolveTask(action)]
          } else {
            return []
          }
        } else {
          // Use appropriate plan task for all action types
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
   * All action types get their corresponding plan task to ensure the entire
   * dependency graph is planned (dry-run) instead of executed.
   */
  private getTaskForAction(action: Action): BaseTask {
    return createPlanTaskForAction(action, () => this.getDependencyParams(), this.forceActions)
  }

  @OtelTraced({
    name(_params) {
      return `${this.action.key()}.getPlanStatus`
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
  }: ActionTaskStatusParams<DeployAction>): Promise<PlanTaskResult | null> {
    // For plan tasks, we always want to run the plan - there's no cached "ready" state
    // We return null to indicate the task needs to be processed
    return null
  }

  @OtelTraced({
    name(_params) {
      return `${this.action.key()}.plan`
    },
    getAttributes(_params) {
      return {
        key: this.action.key(),
        kind: this.action.kind,
      }
    },
  })
  async process({ dependencyResults }: ActionTaskProcessParams<DeployAction, PlanTaskResult>): Promise<PlanTaskResult> {
    const action = this.getResolvedAction(this.action, dependencyResults)
    const log = this.log.createLog()
    const version = action.versionString(log)

    log.info(`Planning ${styles.highlight(action.name)} (type ${styles.highlight(action.type)})...`)

    const router = await this.garden.getActionRouter()

    const { result: planResult } = await router.deploy.plan({
      graph: this.graph,
      action,
      log,
    })

    // Log the plan summary
    const { changesSummary, planDescription: _planDescription } = planResult
    const totalChanges = changesSummary.create + changesSummary.update + changesSummary.delete

    if (totalChanges === 0) {
      log.success(`No changes needed`)
    } else {
      const parts: string[] = []
      if (changesSummary.create > 0) {
        parts.push(`${changesSummary.create} to create`)
      }
      if (changesSummary.update > 0) {
        parts.push(`${changesSummary.update} to update`)
      }
      if (changesSummary.delete > 0) {
        parts.push(`${changesSummary.delete} to delete`)
      }
      log.info(`Changes: ${parts.join(", ")}`)
    }

    // Create a pseudo-executed action with the plan outputs
    const executedAction = resolvedActionToExecuted(action, {
      status: {
        state: planResult.state,
        outputs: planResult.outputs,
        detail: { state: "ready", detail: {} },
      },
    })

    return {
      ...planResult,
      version,
      executedAction,
    }
  }
}

export function isPlanTask(task: BaseTask): task is PlanTask {
  return task.type === "plan"
}

export function createPlanTask(params: PlanTaskParams) {
  return new PlanTask(params)
}

// Register the factory for Deploy actions
registerPlanTaskFactory("Deploy", (params) => new PlanTask(params as PlanTaskParams))
