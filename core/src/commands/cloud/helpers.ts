/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { SecretResult as SecretResultApi, UserResult as UserResultApi } from "@garden-io/platform-api-types"
import { dedent } from "../../util/string.js"

import type { Log } from "../../logger/log-entry.js"
import { capitalize } from "lodash-es"
import minimatch from "minimatch"
import pluralize from "pluralize"
import { CommandError, toGardenError } from "../../exceptions.js"
import type { CommandResult } from "../base.js"
import { userPrompt } from "../../util/util.js"
import { styles } from "../../logger/styles.js"

export interface DeleteResult {
  id: string | number
  status: string
}

export interface ApiCommandError {
  identifier: string | number
  message?: string
}

export interface SecretResult {
  id: string
  createdAt: string
  updatedAt: string
  name: string
  environment?: {
    name: string
    id: string
  }
  user?: {
    name: string
    id: string
    vcsUsername: string
  }
}

export interface UserResult {
  id: string
  createdAt: string
  updatedAt: string
  name: string
  vcsUsername: string | null | undefined
  groups: {
    id: string
    name: string
  }[]
}

export const noApiMsg = (action: string, resource: string) => dedent`
  Unable to ${action} ${resource}. Make sure the project is configured for Garden Cloud and that you're logged in.
`

export function makeUserFromResponse(user: UserResultApi): UserResult {
  return {
    id: user.id,
    name: user.name,
    vcsUsername: user.vcsUsername,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    groups: user.groups.map((g) => ({ id: g.id, name: g.name })),
  }
}

export function makeSecretFromResponse(res: SecretResultApi): SecretResult {
  const secret = {
    name: res.name,
    id: res.id,
    updatedAt: res.updatedAt,
    createdAt: res.createdAt,
  }
  if (res.environment) {
    secret["environment"] = {
      name: res.environment.name,
      id: res.environment.id,
    }
  }
  if (res.user) {
    secret["user"] = {
      name: res.user.name,
      id: res.user.id,
      vcsUsername: res.user.vcsUsername,
    }
  }
  return secret
}

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
            : `"${e.identifier} "`
        return `${capitalize(actionVerb)} ${resource} ${identifier}failed with error: ${e.message}`
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

  const answer: any = await userPrompt({
    name: "continue",
    message: msg,
    type: "confirm",
    default: false,
  })

  return answer.continue
}
