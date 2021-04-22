/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GetProjectResponse, SecretResponse, UserResponse } from "@garden-io/platform-api-types"
import { EnterpriseApi } from "../../enterprise/api"
import { dedent } from "../../util/string"

import { LogEntry } from "../../logger/log-entry"
import { capitalize } from "lodash"
import minimatch from "minimatch"
import pluralize from "pluralize"
import chalk from "chalk"
import inquirer from "inquirer"
import { CommandError } from "../../exceptions"
import { CommandResult } from "../base"

export interface DeleteResult {
  id: number
  status: string
}

export interface ApiCommandError {
  identifier: string | number
  message?: string
}

export interface SecretResult {
  id: number
  createdAt: string
  updatedAt: string
  name: string
  environment?: {
    name: string
    id: number
  }
  user?: {
    name: string
    id: number
    vcsUsername: string
  }
}

export interface UserResult {
  id: number
  createdAt: string
  updatedAt: string
  name: string
  vcsUsername: string
  groups: {
    id: number
    name: string
  }[]
}

export const noApiMsg = (action: string, resource: string) => dedent`
  Unable to ${action} ${resource}. Make sure the project is configured for Garden Enterprise and that you're logged in.
`

export async function getProject(api: EnterpriseApi, projectUid: string) {
  const res = await api.get<GetProjectResponse>(`/projects/uid/${projectUid}`)
  return res.data
}

export function makeUserFromResponse(user: UserResponse): UserResult {
  return {
    id: user.id,
    name: user.name,
    vcsUsername: user.vcsUsername,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    groups: user.groups.map((g) => ({ id: g.id, name: g.name })),
  }
}

export function makeSecretFromResponse(res: SecretResponse): SecretResult {
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
 * Helper function for consistenly logging outputs for enterprise bulk operation commands.
 *
 * Throws if any errors exist after logging the relavant output.
 */
export function handleBulkOperationResult<T>({
  log,
  results,
  errors,
  action,
  cmdLog,
  resource,
}: {
  log: LogEntry
  cmdLog: LogEntry
  results: T[]
  errors: ApiCommandError[]
  action: "create" | "delete"
  resource: "secret" | "user"
}): CommandResult<T[]> {
  const successCount = results.length
  const totalCount = errors.length + successCount

  log.info("")

  if (errors.length > 0) {
    cmdLog.setError({ msg: "Error", append: true })

    const actionVerb = action === "create" ? "creating" : "deleting"
    const errorMsgs = errors
      .map((e) => {
        // Identifier could be an ID, a name or empty.
        const identifier = Number.isInteger(e.identifier)
          ? `with ID ${e.identifier} `
          : e.identifier === ""
          ? ""
          : `"${e.identifier} "`
        return `→ ${capitalize(actionVerb)} ${resource} ${identifier}failed with error: ${e.message}`
      })
      .join("\n")
    log.error(dedent`
      Failed ${actionVerb} ${errors.length}/${totalCount} ${pluralize(resource)}. See errors below:

      ${errorMsgs}\n
    `)
  } else {
    cmdLog.setSuccess()
  }

  if (successCount > 0) {
    const resourceStr = successCount === 1 ? resource : pluralize(resource)
    log.info({
      msg: `Successfully ${action === "create" ? "created" : "deleted"} ${successCount} ${resourceStr}!`,
    })
    log.info("")
  }

  // Ensure command exits with code 1.
  if (errors.length > 0) {
    throw new CommandError("Command failed.", { errors })
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
  const msg = chalk.yellow(dedent`
    Warning: you are about to delete ${count} ${
    count === 1 ? resource : pluralize(resource)
  }. This operation cannot be undone.
    Are you sure you want to continue? (run the command with the "--yes" flag to skip this check).
  `)

  const answer: any = await inquirer.prompt({
    name: "continue",
    message: msg,
    type: "confirm",
    default: false,
  })

  return answer.continue
}
