/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import indentString from "indent-string"

import type { WorkflowConfig } from "../config/workflow.js"
import type { Log } from "../logger/log-entry.js"
import type { ActionKind } from "../actions/types.js"
import isGlob from "is-glob"
import { ConfigurationError, ParameterError } from "../exceptions.js"
import { deline, naturalList } from "../util/string.js"
import type { CommandParams } from "./base.js"
import type { ServeCommandOpts } from "./serve.js"
import { DevCommand } from "./dev.js"
import { styles } from "../logger/styles.js"
import { gardenEnv } from "../constants.js"
import type { ProjectConfig } from "../config/project.js"
import { findProjectConfig } from "../config/base.js"

export async function findProjectConfigOrPrintInstructions(log: Log, path: string): Promise<ProjectConfig> {
  const projectConfig = await findProjectConfig({ log, path })
  if (!projectConfig) {
    throw new ConfigurationError({
      message: deline`
        Project config not found. Hint: You can run ${styles.command("garden create project")} to create a new
        project.
      `,
    })
  }
  return projectConfig
}

/**
 * Runs a `dev` command and runs `commandName` with the args & opts provided in `params` as the first
 * interactive command.
 *
 * Also updates the `commandInfo` accordingly so that the session registration parameters sent to Cloud are correct.
 */
export async function runAsDevCommand(
  commandName: string, // The calling command's opts need to extend `ServeCommandOpts`.
  params: CommandParams<{}, ServeCommandOpts>
) {
  const commandInfo = params.garden.commandInfo
  params.opts.cmd = getCmdOptionForDev(commandName, params)
  commandInfo.name = "dev"
  commandInfo.args["$all"] = []
  commandInfo.opts.cmd = params.opts.cmd
  const devCmd = new DevCommand()
  devCmd.printHeader(params)
  await devCmd.prepare(params)

  return devCmd.action(params)
}

export function getCmdOptionForDev(commandName: string, params: CommandParams) {
  return [commandName + " " + params.args.$all?.join(" ")]
}

export function prettyPrintWorkflow(workflow: WorkflowConfig): string {
  let out = `${styles.highlight.bold(workflow.name)}`

  if (workflow.description) {
    out += "\n" + indentString(printField("description", workflow.description), 2)
  } else {
    out += "\n"
  }

  return out
}

function printField(name: string, value: string | null) {
  return `${styles.primary(name)}: ${value || ""}`
}

const renderAvailableActions = (actions: { name: string }[]): string => {
  if (gardenEnv.GARDEN_ENABLE_PARTIAL_RESOLUTION) {
    return "<None> (action list is not available while partial graph resolution (i.e. when GARDEN_ENABLE_PARTIAL_RESOLUTION=true))"
  }

  return naturalList(actions.map((a) => a.name))
}

/**
 * Throws if an action by name is not found.
 * Logs a warning if no actions are found matching wildcard arguments.
 */
export const validateActionSearchResults = ({
  log,
  names,
  actions,
  allActions,
  actionKind,
}: {
  log: Log
  names: string[] | undefined
  actions: { name: string }[]
  allActions: { name: string }[]
  actionKind: ActionKind
}): { shouldAbort: boolean } => {
  if (actions.length === 0 && (!names || names.length === 0)) {
    log.warn(`No ${actionKind} actions were found. Aborting.`)
    return { shouldAbort: true }
  }

  names?.forEach((n) => {
    if (!isGlob(n) && !actions.find((a) => a.name === n)) {
      throw new ParameterError({
        message: `${actionKind} action "${n}" was not found. Available actions: ${renderAvailableActions(allActions)}`,
      })
    }
  })

  if (actions.length === 0) {
    let argumentsMsg = ""
    if (names) {
      argumentsMsg = ` (matching argument(s) ${naturalList(names.map((n) => `'${n}'`))})`
    }
    throw new ParameterError({
      message: `No ${actionKind} actions were found${argumentsMsg}. Available actions: ${naturalList(
        allActions.map((a) => a.name)
      )}`,
    })
  }
  return { shouldAbort: false }
}
