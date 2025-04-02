/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../util/string.js"
import type { Log } from "../../logger/log-entry.js"
import { capitalize } from "lodash-es"
import { minimatch } from "minimatch"
import pluralize from "pluralize"
import { CommandError, toGardenError } from "../../exceptions.js"
import type { CommandResult } from "../base.js"
import { userPrompt } from "../../util/util.js"
import { styles } from "../../logger/styles.js"
import dotenv from "dotenv"
import fsExtra from "fs-extra"

const { readFile } = fsExtra

export interface DeleteResult {
  id: string | number
  status: string
}

export interface ApiCommandError {
  identifier: string | number
  message?: string
}

export const noApiMsg = (action: string, resource: string) => dedent`
  Unable to ${action} ${resource}. Make sure the project is configured for Garden Cloud and that you're logged in.
`

/**
 * Helper function for consistently logging outputs for Garden Cloud bulk operation commands.
 *
 * Throws if any errors exist after logging the relevant output.
 */
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
  resource: "secret" | "user"
}): CommandResult<T[]> {
  const successCount = results.length
  const totalCount = errors.length + successCount

  log.info("")

  if (errors.length > 0) {
    cmdLog.error("Error")

    const actionVerb = action === "create" ? "creating" : action === "update" ? "updating" : "deleting"
    const errorMsgs = errors
      .map((e) => {
        // Identifier could be an ID, a name or empty.
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

  // Ensure command exits with code 1.
  if (errors.length > 0) {
    const errorMessages = errors.map((e) => e.message).join("\n\n")
    throw new CommandError({
      message: `Command failed. Errors: \n${errorMessages}`,
      wrappedErrors: errors.map(toGardenError),
    })
  }

  return { result: results }
}

export function applyFilter(filter: string[], val?: string | string[]) {
  if (filter.length === 0) {
    return true
  }
  if (Array.isArray(val)) {
    return filter.find((f) => val.some((v) => minimatch(v.toLowerCase(), f.toLowerCase())))
  }
  return val && filter.find((f) => minimatch(val.toLowerCase(), f.toLowerCase()))
}

export async function confirmDelete(resource: string, count: number) {
  const msg = styles.warning(dedent`
    Warning: you are about to delete ${count} ${
      count === 1 ? resource : pluralize(resource)
    }. This operation cannot be undone.
    Are you sure you want to continue? (run the command with the "--yes" flag to skip this check).
  `)

  const answer = await userPrompt({
    message: msg,
    type: "confirm",
    default: false,
  })

  return answer
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
  // File source (by naming convention for args/opts, it's defined via --from-file option)
  // always takes precedence over the positional arguments.
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

  // Get input resources from positional arguments in no input file defined.
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
