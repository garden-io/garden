/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dedent from "dedent"
import { minimatch } from "minimatch"

import type { CommandParams, CommandResult, ProcessCommandResult } from "./base.js"
import { Command, processCommandResultSchema, emptyActionResults } from "./base.js"
import { printHeader } from "../logger/util.js"
import { StringsParameter, BooleanParameter } from "../cli/params.js"
import type { Action } from "../actions/types.js"
import { actionKinds } from "../actions/types.js"
// Side-effect imports to ensure plan task factories are registered
import "../tasks/plan.js"
import "../tasks/plan-run.js"
import "../tasks/plan-test.js"
import "../tasks/plan-build.js"
import { handlePlanResults } from "./plan-helpers.js"
import { ParameterError } from "../exceptions.js"
import { styles } from "../logger/styles.js"
import type { BaseTask } from "../tasks/base.js"
import { createPlanTaskForAction } from "../tasks/plan-helpers.js"
import type { Garden } from "../garden.js"
import type { Log } from "../logger/log-entry.js"
import type { ConfigGraph } from "../graph/config-graph.js"

const planArgs = {
  keys: new StringsParameter({
    help: dedent`
      The key(s) of the action(s) to plan (e.g., deploy.api, build.*, run.db-migrate).
      You may specify multiple keys, separated by spaces.
      Accepts glob patterns (e.g., deploy.* would plan all Deploy actions).
      Skip to plan all actions in the project.
    `,
    spread: true,
    getSuggestions: ({ configDump }) => {
      const suggestions: string[] = []
      for (const kind of actionKinds) {
        const actions = configDump.actionConfigs[kind] || {}
        for (const name of Object.keys(actions)) {
          suggestions.push(`${kind.toLowerCase()}.${name}`)
        }
      }
      return suggestions
    },
  }),
}

const planOpts = {
  force: new BooleanParameter({
    help: "Plan all actions, even if cached results exist.",
    aliases: ["f"],
  }),
  skip: new StringsParameter({
    help: dedent`
      The key(s) of actions you'd like to skip. Accepts glob patterns
      (e.g., deploy.* would skip all Deploy actions).
    `,
    getSuggestions: ({ configDump }) => {
      const suggestions: string[] = []
      for (const kind of actionKinds) {
        const actions = configDump.actionConfigs[kind] || {}
        for (const name of Object.keys(actions)) {
          suggestions.push(`${kind.toLowerCase()}.${name}`)
        }
      }
      return suggestions
    },
  }),
}

type Args = typeof planArgs
type Opts = typeof planOpts

export class PlanCommand extends Command<Args, Opts> {
  name = "plan"
  help = "[EXPERIMENTAL] Show what actions would be executed without making any changes."

  override streamEvents = true
  override protected = true
  override streamLogEntriesV2 = true

  override description = dedent`
    **[EXPERIMENTAL] This command is still under development and may change in the future, including parameters and output format.**

    Shows what would happen if you ran the specified actions, without actually executing them.
    This is useful for previewing changes before deployment, especially for Kubernetes resources.

    For Deploy actions, shows a diff of resources that would be created, updated, or deleted.
    For Build, Run, and Test actions, shows what commands would be executed.

    Examples:

        garden plan                         # plan all actions in the project
        garden plan deploy.api              # plan a specific Deploy action
        garden plan deploy.*                # plan all Deploy actions
        garden plan build.* deploy.*        # plan all Build and Deploy actions
        garden plan "*.api"                 # plan all actions named "api"
        garden plan --skip deploy.database  # plan everything except the database deploy
        garden plan --force                 # plan all actions, ignoring cache
  `

  override arguments = planArgs
  override options = planOpts

  override outputsSchema = () => processCommandResultSchema()

  override printHeader({ log }) {
    printHeader(log, "Plan", "📋")
  }

  async action({ garden, log, args, opts }: CommandParams<Args, Opts>): Promise<CommandResult<ProcessCommandResult>> {
    // Use getConfigGraph (not getResolvedConfigGraph) to avoid resolving all actions upfront.
    // This is important because disabled actions might have template strings that can't be resolved
    // (e.g., secrets not available for the disabled environment).
    const graph = await garden.getConfigGraph({ log, emit: true })
    const force = opts.force || false
    const skipKeys = opts.skip || []

    // Get all actions from the graph
    const allActions = graph.getActions()

    // Filter actions based on provided keys
    let selectedActions: Action[]

    if (!args.keys || args.keys.length === 0) {
      // No keys specified - include all actions
      selectedActions = allActions
    } else {
      // Filter based on provided keys/patterns
      selectedActions = allActions.filter((action) => {
        const actionKey = `${action.kind.toLowerCase()}.${action.name}`
        return args.keys!.some((pattern) => {
          // Handle patterns like "deploy.*", "*.api", "build.foo"
          return minimatch(actionKey, pattern.toLowerCase(), { nocase: true })
        })
      })

      // Validate that at least one action was found
      if (selectedActions.length === 0) {
        const availableKeys = allActions.map((a) => `${a.kind.toLowerCase()}.${a.name}`).slice(0, 10)
        const moreCount = allActions.length - 10
        const availableStr = availableKeys.join(", ") + (moreCount > 0 ? `, ... (+${moreCount} more)` : "")
        throw new ParameterError({
          message: `No actions found matching: ${args.keys.join(", ")}. Available actions: ${availableStr}`,
        })
      }
    }

    // Filter out disabled actions and log them
    const disabled = selectedActions.filter((a) => a.isDisabled())
    if (disabled.length > 0) {
      const disabledKeys = disabled.map((a) => styles.highlight(`${a.kind}.${a.name}`))
      const msg =
        disabled.length === 1
          ? `Action ${disabledKeys[0]} is disabled`
          : `Actions ${disabledKeys.join(", ")} are disabled`
      log.info(msg)
    }
    selectedActions = selectedActions.filter((a) => !a.isDisabled())

    // Apply skip patterns
    if (skipKeys.length > 0) {
      selectedActions = selectedActions.filter((action) => {
        const actionKey = `${action.kind.toLowerCase()}.${action.name}`
        return !skipKeys.some((pattern) => minimatch(actionKey, pattern.toLowerCase(), { nocase: true }))
      })
    }

    if (selectedActions.length === 0) {
      log.warn("No actions to plan after applying filters.")
      return {
        result: {
          aborted: false,
          success: true,
          ...emptyActionResults,
        },
      }
    }

    // Log what we're planning
    const kindCounts: Record<string, number> = {}
    for (const action of selectedActions) {
      kindCounts[action.kind] = (kindCounts[action.kind] || 0) + 1
    }
    const countStr = Object.entries(kindCounts)
      .map(([kind, count]) => `${count} ${kind}`)
      .join(", ")
    log.info(`Planning ${selectedActions.length} action(s): ${countStr}`)
    log.info("")

    // Create plan tasks for each selected action
    const tasks: BaseTask[] = selectedActions.map((action) => {
      return this.createPlanTask(action, garden, log, graph, force)
    })

    const results = await garden.processTasks({ tasks, logProgressStatus: true })

    return handlePlanResults(garden, log, results)
  }

  private createPlanTask(action: Action, garden: Garden, log: Log, graph: ConfigGraph, force: boolean): BaseTask {
    const forceActions = force ? [{ kind: action.kind, name: action.name }] : []

    return createPlanTaskForAction(
      action,
      () => ({
        garden,
        log,
        graph,
        forceBuild: false,
      }),
      forceActions
    )
  }
}
