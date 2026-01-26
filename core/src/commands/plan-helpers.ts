/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CommandResult, ProcessCommandResult } from "./base.js"
import { emptyActionResults } from "./base.js"
import type { GraphResults } from "../graph/results.js"
import type { Log } from "../logger/log-entry.js"
import { styles } from "../logger/styles.js"
import type { Garden } from "../garden.js"

export interface ActionPlanInfo {
  actionKey: string
  actionKind: "Deploy" | "Run" | "Test" | "Build"
  actionName: string
  planDescription?: string
  hasChanges: boolean
  error?: string
  // Deploy-specific fields
  create?: number
  update?: number
  delete?: number
  unchanged?: number
  createdResources?: string[]
  updatedResources?: string[]
  deletedResources?: string[]
  unchangedResources?: string[]
}

/**
 * Handles the results from plan tasks.
 * Formats and displays the plan output for each action.
 */
export async function handlePlanResults(
  _garden: Garden,
  log: Log,
  solveResult: { error: any; results: GraphResults }
): Promise<CommandResult<ProcessCommandResult>> {
  const commandLog = log.createLog({ name: "garden" })
  const { results } = solveResult

  const actionPlans: ActionPlanInfo[] = []
  let hasErrors = false

  // Collect and display results for each plan task
  const resultsMap = results.getMap()
  for (const [key, result] of Object.entries(resultsMap)) {
    if (!result) {
      continue
    }

    // Determine action kind from task key
    // Task keys are formatted as: plan.{name}, plan-run.{name}, plan-test.{name}, plan-build.{name}
    let actionKind: "Deploy" | "Run" | "Test" | "Build" | null = null
    let actionName = ""

    if (key.startsWith("plan-run.")) {
      actionKind = "Run"
      actionName = key.replace(/^plan-run\./, "")
    } else if (key.startsWith("plan-test.")) {
      actionKind = "Test"
      actionName = key.replace(/^plan-test\./, "")
    } else if (key.startsWith("plan-build.")) {
      actionKind = "Build"
      actionName = key.replace(/^plan-build\./, "")
    } else if (key.startsWith("plan.")) {
      // plan.{name} is for Deploy actions - must check this last since other prefixes also contain "plan."
      actionKind = "Deploy"
      actionName = key.replace(/^plan\./, "")
    }

    if (!actionKind) {
      continue
    }

    if (result.error) {
      hasErrors = true
      commandLog.error(`Failed to plan ${key}: ${result.error.message}`)
      actionPlans.push({
        actionKey: key,
        actionKind,
        actionName,
        hasChanges: false,
        error: result.error.message,
      })
      continue
    }

    const planResult = result.result as {
      planDescription?: string
      changesSummary?: { create: number; update: number; delete: number; unchanged: number }
      resourceChanges?: Array<{ key: string; operation: "create" | "update" | "delete" | "unchanged" }>
    }

    const planInfo: ActionPlanInfo = {
      actionKey: key,
      actionKind,
      actionName,
      planDescription: planResult?.planDescription,
      hasChanges: false,
    }

    // For Deploy actions, extract resource changes
    if (actionKind === "Deploy" && planResult?.changesSummary) {
      planInfo.create = planResult.changesSummary.create || 0
      planInfo.update = planResult.changesSummary.update || 0
      planInfo.delete = planResult.changesSummary.delete || 0
      planInfo.unchanged = planResult.changesSummary.unchanged || 0
      planInfo.createdResources = []
      planInfo.updatedResources = []
      planInfo.deletedResources = []
      planInfo.unchangedResources = []

      if (planResult.resourceChanges) {
        for (const change of planResult.resourceChanges) {
          switch (change.operation) {
            case "create":
              planInfo.createdResources.push(change.key)
              break
            case "update":
              planInfo.updatedResources.push(change.key)
              break
            case "delete":
              planInfo.deletedResources.push(change.key)
              break
            case "unchanged":
              planInfo.unchangedResources.push(change.key)
              break
          }
        }
      }

      planInfo.hasChanges = (planInfo.create || 0) > 0 || (planInfo.update || 0) > 0 || (planInfo.delete || 0) > 0
    } else {
      // For Run, Test, Build - they always "would execute" unless already cached
      planInfo.hasChanges = true
    }

    actionPlans.push(planInfo)

    // Print the plan description if available
    if (planResult?.planDescription) {
      commandLog.info("")
      commandLog.info(planResult.planDescription)
    }
  }

  // Print summary
  commandLog.info("")
  commandLog.info(styles.highlight("━".repeat(60)))
  commandLog.info(styles.highlight("Plan Summary"))
  commandLog.info(styles.highlight("━".repeat(60)))
  commandLog.info("")

  // Group actions by kind
  const deployActions = actionPlans.filter((a) => a.actionKind === "Deploy")
  const runActions = actionPlans.filter((a) => a.actionKind === "Run")
  const testActions = actionPlans.filter((a) => a.actionKind === "Test")
  const buildActions = actionPlans.filter((a) => a.actionKind === "Build")
  const errorActions = actionPlans.filter((a) => a.error)

  // Show Build actions
  if (buildActions.length > 0) {
    const buildsToRun = buildActions.filter((a) => !a.error)
    if (buildsToRun.length > 0) {
      commandLog.info(styles.primary(`${buildsToRun.length} build(s) would run:`))
      for (const action of buildsToRun) {
        commandLog.info(styles.primary(`  Build.${action.actionName}`))
      }
      commandLog.info("")
    }
  }

  // Show Run actions
  if (runActions.length > 0) {
    const runsToExecute = runActions.filter((a) => !a.error)
    if (runsToExecute.length > 0) {
      commandLog.info(styles.primary(`${runsToExecute.length} run(s) would execute:`))
      for (const action of runsToExecute) {
        commandLog.info(styles.primary(`  Run.${action.actionName}`))
      }
      commandLog.info("")
    }
  }

  // Show Test actions
  if (testActions.length > 0) {
    const testsToExecute = testActions.filter((a) => !a.error)
    if (testsToExecute.length > 0) {
      commandLog.info(styles.primary(`${testsToExecute.length} test(s) would execute:`))
      for (const action of testsToExecute) {
        commandLog.info(styles.primary(`  Test.${action.actionName}`))
      }
      commandLog.info("")
    }
  }

  // Show Deploy actions
  if (deployActions.length > 0) {
    const unchangedDeploys = deployActions.filter((a) => !a.hasChanges && !a.error)
    const changedDeploys = deployActions.filter((a) => a.hasChanges && !a.error)

    if (unchangedDeploys.length > 0) {
      commandLog.info(styles.success(`${unchangedDeploys.length} deployment(s) unchanged`))
    }

    if (changedDeploys.length > 0) {
      commandLog.info(styles.warning(`${changedDeploys.length} deployment(s) would change:`))
      commandLog.info("")

      for (const action of changedDeploys) {
        commandLog.info(styles.highlight(`  Deploy.${action.actionName}:`))

        if (action.createdResources && action.createdResources.length > 0) {
          const resourceList = formatResourceList(action.createdResources)
          commandLog.info(styles.success(`    ${action.create} resource(s) to create: ${resourceList}`))
        }

        if (action.updatedResources && action.updatedResources.length > 0) {
          const resourceList = formatResourceList(action.updatedResources)
          commandLog.info(styles.warning(`    ${action.update} resource(s) to update: ${resourceList}`))
        }

        if (action.deletedResources && action.deletedResources.length > 0) {
          const resourceList = formatResourceList(action.deletedResources)
          commandLog.info(styles.error(`    ${action.delete} resource(s) to delete: ${resourceList}`))
        }

        if ((action.unchanged || 0) > 0) {
          commandLog.info(styles.primary(`    ${action.unchanged} resource(s) unchanged`))
        }

        commandLog.info("")
      }
    }
  }

  // Show error actions
  if (errorActions.length > 0) {
    commandLog.info(styles.error(`${errorActions.length} action(s) failed to plan:`))
    for (const action of errorActions) {
      commandLog.info(styles.error(`  ${action.actionKind}.${action.actionName}: ${action.error}`))
    }
    commandLog.info("")
  }

  if (actionPlans.length > 0 && actionPlans.every((a) => !a.hasChanges && !a.error)) {
    commandLog.info(styles.success("All actions are up-to-date. No changes needed."))
    commandLog.info("")
  }

  commandLog.info(styles.primary("Note: This was a plan. No changes were made to your environment."))

  return {
    result: {
      aborted: false,
      success: !hasErrors,
      ...emptyActionResults,
      graphResults: resultsMap,
    },
  }
}

/**
 * Formats a list of resource keys for display, truncating if too long.
 */
export function formatResourceList(resources: string[], maxLength: number = 80): string {
  if (resources.length === 0) {
    return ""
  }

  // Shorten resource keys by removing namespace if all the same
  const shortened = resources.map((r) => {
    // Extract just kind/name from "Kind/namespace/name"
    const parts = r.split("/")
    if (parts.length === 3) {
      return `${parts[0]}/${parts[2]}`
    }
    return r
  })

  let result = shortened.join(", ")

  if (result.length > maxLength) {
    // Truncate and show count
    const firstFew = shortened.slice(0, 2).join(", ")
    const remaining = shortened.length - 2
    result = `${firstFew}, ... (+${remaining} more)`
  }

  return result
}
