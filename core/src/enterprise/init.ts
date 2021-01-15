/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import dedent from "dedent"
import { LogEntry } from "../logger/log-entry"
import { readAuthToken, checkClientAuthToken } from "./auth"
import { deline } from "../util/string"
import { getSecrets } from "./get-secrets"
import { StringMap } from "../config/common"
import { Garden } from "../garden"

export interface EnterpriseInitParams {
  log: LogEntry
  projectId: string | null
  enterpriseDomain: string | null
  environmentName: string
}

export interface EnterpriseConnectParams extends EnterpriseInitParams {
  projectId: string
  enterpriseDomain: string
  clientAuthToken: string
}

export interface GardenEnterpriseContext {
  clientAuthToken: string
  projectId: string
  enterpriseDomain: string
}

export async function enterpriseInit({ log, projectId, enterpriseDomain, environmentName }: EnterpriseInitParams) {
  const clientAuthToken = await readAuthToken(log)
  let secrets: StringMap = {}
  // If a client auth token exists in local storage, we assume that the user wants to be logged in.
  if (clientAuthToken) {
    if (!enterpriseDomain || !projectId) {
      await handleMissingConfig(log, enterpriseDomain, projectId)
    } else {
      secrets = await enterpriseConnect({ log, projectId, enterpriseDomain, environmentName, clientAuthToken })
    }
  }
  return { clientAuthToken, secrets }
}

async function handleMissingConfig(log: LogEntry, enterpriseDomain: string | null, projectId: string | null) {
  const errorMessages: string[] = []
  if (!enterpriseDomain) {
    errorMessages.push(deline`
      ${chalk.bold("project.domain")} is not set in your project-level ${chalk.bold("garden.yml")}. Make sure it
      is set to the appropriate API backend endpoint (e.g. http://myusername-cloud-api.cloud.dev.garden.io,
      with an http/https prefix).
    `)
  }
  if (!projectId) {
    errorMessages.push(deline`
      ${chalk.bold("project.id")} is not set in your project-level ${chalk.bold("garden.yml")}. Please visit
      Garden Enterprise's web UI for your project and copy your project's ID from there.
    `)
  }
  if (errorMessages.length > 0) {
    log.verbose(
      chalk.gray(dedent`
        ${errorMessages.join("\n\n")}

        Logging out via the ${chalk.bold("garden logout")} command will suppress this message.`)
    )
  }
}

async function enterpriseConnect({
  log,
  projectId,
  enterpriseDomain,
  environmentName,
  clientAuthToken,
}: EnterpriseConnectParams) {
  let success = true
  let secrets: StringMap = {}

  const enterpriseLog = log.info({ section: "garden-enterprise", msg: "Connecting...", status: "active" })
  const tokenIsValid = await checkClientAuthToken(clientAuthToken, enterpriseDomain, enterpriseLog)
  if (tokenIsValid) {
    try {
      secrets = await getSecrets({
        projectId,
        enterpriseDomain,
        clientAuthToken,
        log: enterpriseLog,
        environmentName,
      })
    } catch (err) {
      success = false
    }
    enterpriseLog.silly(`Fetched ${Object.keys(secrets).length} secrets from ${enterpriseDomain}`)
  } else {
    success = false
    enterpriseLog.warn(deline`
        You were previously logged in to Garden Enterprise, but your session has expired or is invalid. Please run
        ${chalk.bold("garden login")} to continue using enterprise features, or run ${chalk.bold("garden logout")}
        to suppress this message.
      `)
  }

  if (success) {
    enterpriseLog.setSuccess("Ready")
  } else {
    enterpriseLog.setWarn()
  }

  return secrets
}

/**
 * Returns null if one or more parameters are null.
 *
 * Returns a `GardenEnterpriseContext` otherwise.
 */
export function makeEnterpriseContext(garden: Garden): GardenEnterpriseContext | null {
  const missing: string[] = []
  if (!garden.clientAuthToken) {
    missing.push("client auth token")
  }
  if (!garden.projectId) {
    missing.push("project id")
  }
  if (!garden.enterpriseDomain) {
    missing.push("domain")
  }
  if (missing.length > 0) {
    garden.log.silly(`Enterprise features disabled. Missing values: ${missing.join(",")}`)
    return null
  } else {
    return {
      clientAuthToken: garden.clientAuthToken!,
      projectId: garden.projectId!,
      enterpriseDomain: garden.enterpriseDomain!,
    }
  }
}
