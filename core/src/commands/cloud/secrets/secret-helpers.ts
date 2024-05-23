/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type {
  CreateSecretRequest,
  ListSecretsResponse,
  SecretResult as CloudApiSecretResult,
} from "@garden-io/platform-api-types"
import type { CloudApi, CloudEnvironment, CloudProject } from "../../../cloud/api.js"
import type { Log } from "../../../logger/log-entry.js"
import queryString from "query-string"
import { CloudApiError, GardenError } from "../../../exceptions.js"
import { dedent } from "../../../util/string.js"
import type { ApiCommandError } from "../helpers.js"
import { enumerate } from "../../../util/enumerate.js"

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

export function getEnvironmentByNameOrThrow({
  envName,
  project,
}: {
  envName: string | undefined
  project: CloudProject
}): CloudEnvironment | undefined {
  if (!envName) {
    return undefined
  }

  const environment = project.environments.find((e) => e.name === envName)
  if (environment) {
    return environment
  }

  const availableEnvironmentNames = project.environments.map((e) => e.name)
  throw new CloudApiError({
    message: dedent`
            Environment with name ${envName} not found in project.
            Available environments: ${availableEnvironmentNames.join(", ")}
          `,
  })
}

export interface Secret {
  name: string
  value: string
}

export interface BulkCreateSecretRequest extends Omit<CreateSecretRequest, "name" | "value"> {
  secrets: Secret[]
}

export async function createSecrets({
  request,
  api,
  log,
}: {
  request: BulkCreateSecretRequest
  api: CloudApi
  log: Log
}): Promise<{ results: SecretResult[]; errors: ApiCommandError[] }> {
  const { secrets, environmentId, userId, projectId } = request

  const errors: ApiCommandError[] = []
  const results: SecretResult[] = []

  for (const [counter, { name, value }] of enumerate(secrets, 1)) {
    log.info({ msg: `Creating secrets... → ${counter}/${secrets.length}` })
    try {
      const body = { environmentId, userId, projectId, name, value }
      const res = await api.createSecret(body)
      results.push(makeSecretFromResponse(res.data))
    } catch (err) {
      if (!(err instanceof GardenError)) {
        throw err
      }
      errors.push({
        identifier: name,
        message: err.message,
      })
    }
  }

  return { results, errors }
}

// TODO: consider moving this to CloudApis
export function makeSecretFromResponse(res: CloudApiSecretResult): SecretResult {
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

const secretsPageLimit = 100

export async function fetchAllSecrets(api: CloudApi, projectId: string, log: Log): Promise<CloudApiSecretResult[]> {
  let page = 0
  const secrets: CloudApiSecretResult[] = []
  let hasMore = true
  while (hasMore) {
    log.debug(`Fetching page ${page}`)
    const q = queryString.stringify({ projectId, offset: page * secretsPageLimit, limit: secretsPageLimit })
    const res = await api.get<ListSecretsResponse>(`/secrets?${q}`)
    if (res.data.length === 0) {
      hasMore = false
    } else {
      secrets.push(...res.data)
      page++
    }
  }
  return secrets
}
