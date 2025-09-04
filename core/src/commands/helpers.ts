/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
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
import { deline, naturalList, dedent } from "../util/string.js"
import type { CommandParams } from "./base.js"
import type { ServeCommandOpts } from "./serve.js"
import { DevCommand } from "./dev.js"
import { styles } from "../logger/styles.js"
import { DEFAULT_GARDEN_CLOUD_DOMAIN, gardenEnv } from "../constants.js"
import type { ProjectConfig } from "../config/project.js"
import { findProjectConfig } from "../config/base.js"
import dotenv from "dotenv"
import fsExtra from "fs-extra"
import { capitalize } from "lodash-es"
import pluralize from "pluralize"
import { CommandError, toGardenError } from "../exceptions.js"
import type { CommandResult } from "./base.js"
import type { Garden } from "../garden.js"
import { makeDocsLinkPlain } from "../docs/common.js"

const { readFile } = fsExtra

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

export interface DeleteResult {
  id: string | number
  status: string
}

export interface ApiCommandError {
  identifier: string | number
  message?: string
}

/**
 * Throws an error if a user on Garden Cloud legacy attempts to run a command that's only available for the
 * new Garden Cloud at https://app.garden.io.
 *
 * @param fallbackCommand a fallback command to suggest to the user. E.g. "garden cloud users list".
 * @throws {CommandError}
 */
export function throwIfLegacyCloud(garden: Garden, fallbackCommand?: string) {
  if (garden.cloudApiLegacy) {
    let message = `Looks like you're logged into Garden Enterprise (at ${garden.cloudApiLegacy.domain}). This command is only available for Garden Cloud (at ${DEFAULT_GARDEN_CLOUD_DOMAIN}).`
    if (fallbackCommand) {
      message += ` Please use ${styles.command(fallbackCommand)} instead.`
    }
    throw new CommandError({ message })
  }
}

/**
 * Throws an error if a user on the new Garden Cloud at https://app.garden.io attemps to run a command that's
 * only available for Garden Enterprise.
 *
 * @param fallbackCommand a fallback command to suggest to the user. E.g. "garden get users".
 * @throws {CommandError}
 */
export function throwIfNotLegacyCloud(garden: Garden, fallbackCommand?: string) {
  if (garden.cloudApi) {
    let message = `Looks like you're logged into Garden Cloud (at ${DEFAULT_GARDEN_CLOUD_DOMAIN}). This command is only available for Garden Enterprise.`
    if (fallbackCommand) {
      message += ` Please use ${styles.command(fallbackCommand)} instead.`
    }
    throw new CommandError({ message })
  }
}

export function noApiMsg(action: string, resource: string) {
  return dedent`
    Unable to ${action} ${resource}. Make sure the project is configured for Garden Cloud and that you're logged in.
  `
}

export function handleBulkOperationResult<T>({
  log,
  results,
  errors,
  action,
  cmdLog,
  resource,
}: {
  log: Log
  cmdLog: Log
  results: T[]
  errors: ApiCommandError[]
  action: "create" | "update" | "delete"
  resource: "secret" | "user" | "variable"
}): CommandResult<T[]> {
  const successCount = results.length
  const totalCount = errors.length + successCount

  log.info("")

  if (errors.length > 0) {
    cmdLog.error("Error")

    const actionVerb = action === "create" ? "creating" : action === "update" ? "updating" : "deleting"
    const errorMsgs = errors
      .map((e) => {
        const identifier = Number.isInteger(e.identifier)
          ? `with ID ${e.identifier} `
          : e.identifier === ""
            ? ""
            : `"${e.identifier}" `
        return `→ ${capitalize(actionVerb)} ${resource} ${identifier}failed with error: ${e.message}`
      })
      .join("\n")
    log.error(dedent`
      Failed ${actionVerb} ${errors.length}/${totalCount} ${pluralize(resource)}. See errors below:

      ${errorMsgs}\n
    `)
  } else {
    cmdLog.success("Done")
  }

  if (successCount > 0) {
    const resourceStr = successCount === 1 ? resource : pluralize(resource)
    log.info({
      msg: `Successfully ${
        action === "create" ? "created" : action === "update" ? "updated" : "deleted"
      } ${successCount} ${resourceStr}!`,
    })
    log.info("")
  }

  if (errors.length > 0) {
    const errorMessages = errors.map((e) => e.message).join("\n\n")
    throw new CommandError({
      message: `Command failed. Errors: \n${errorMessages}`,
      wrappedErrors: errors.map(toGardenError),
    })
  }

  return { result: results }
}

export async function readInputKeyValueResources({
  resourceFilePath,
  resourcesFromArgs,
  resourceName,
  log,
}: {
  resourceFilePath: string | undefined
  resourcesFromArgs: string[] | undefined
  resourceName: string
  log: Log
}): Promise<[key: string, value: string][]> {
  if (resourceFilePath) {
    try {
      if (resourcesFromArgs && resourcesFromArgs.length > 0) {
        log.warn(
          `Reading ${resourceName}s from file ${resourceFilePath}. Positional arguments will be ignored: ${resourcesFromArgs.join(" ")}.`
        )
      }

      const dotEnvFileContent = await readFile(resourceFilePath)
      const resourceDictionary = dotenv.parse(dotEnvFileContent)
      return Object.entries(resourceDictionary)
    } catch (err) {
      throw new CommandError({
        message: `Unable to read ${resourceName}(s) from file at path ${resourceFilePath}: ${err}`,
      })
    }
  }

  if (resourcesFromArgs) {
    const resourceDictionary = resourcesFromArgs.reduce(
      (acc, keyValPair) => {
        try {
          const resourceEntry = dotenv.parse(keyValPair)
          Object.assign(acc, resourceEntry)
          return acc
        } catch (err) {
          throw new CommandError({
            message: `Unable to read ${resourceName} from argument ${keyValPair}: ${err}`,
          })
        }
      },
      {} as Record<string, string>
    )
    return Object.entries(resourceDictionary)
  }

  throw new CommandError({
    message: dedent`
        No ${resourceName}(s) provided. Either provide ${resourceName}(s) directly to the command or via the --from-file flag.
      `,
  })
}

export function getCloudListCommandBaseDescription(resource: string) {
  return dedent`
    List the ${resource} that belong to this Garden Cloud organization (i.e. in https://app.garden.io). Only relevant
    for projects that are connected to Garden Cloud and have an \`organizationId\` set in the project configuration.

    See the [Connecting a project guide](${makeDocsLinkPlain`guides/connecting-project`}) to learn more about
    connecting projects to Garden Cloud.
  `
}
