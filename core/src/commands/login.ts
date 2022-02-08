/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandParams, CommandResult } from "./base"
import { printHeader } from "../logger/util"
import dedent = require("dedent")
import { AuthTokenResponse, CloudApi, getEnterpriseConfig } from "../cloud/api"
import { LogEntry } from "../logger/log-entry"
import { ConfigurationError, InternalError } from "../exceptions"
import { AuthRedirectServer } from "../cloud/auth"
import { EventBus } from "../events"
import { getCloudDistributionName } from "../util/util"

export class LoginCommand extends Command {
  name = "login"
  help = "Log in to Garden Cloud."
  hidden = true

  /**
   * Since we're logging in, we don't want to resolve e.g. the project config (since it may use secrets, which are
   * only available after we've logged in).
   */
  noProject = true

  description = dedent`
    Logs you in to Garden Cloud. Subsequent commands will have access to cloud features.
  `

  printHeader({ headerLog }) {
    printHeader(headerLog, "Login", "cloud")
  }

  async action({ garden, log }: CommandParams): Promise<CommandResult> {
    const currentDirectory = garden.projectRoot
    const distroName = getCloudDistributionName(garden.enterpriseDomain || "")

    // The Enterprise API is missing from the Garden class for commands with noProject
    // so we initialize it here.
    try {
      const enterpriseApi = await CloudApi.factory({ log, currentDirectory, skipLogging: true })
      if (enterpriseApi) {
        log.info({ msg: `You're already logged in to ${distroName}.` })
        enterpriseApi.close()
        return {}
      }
    } catch (err) {
      if (err?.detail?.statusCode === 401) {
        const msg = dedent`
          Looks like your session token is invalid. If you were previously logged into a different instance
          of ${distroName}, log out first before logging in.
        `
        log.warn({ msg, symbol: "warning" })
        log.info("")
      }
      throw err
    }

    const config = await getEnterpriseConfig(currentDirectory)
    if (!config) {
      throw new ConfigurationError(`Project config is missing a cloud domain and/or a project ID.`, {})
    }

    log.info({ msg: `Logging in to ${config.domain}...` })
    const tokenResponse = await login(log, config.domain, garden.events)
    await CloudApi.saveAuthToken(log, tokenResponse)
    log.info({ msg: `Successfully logged in to ${distroName}.` })
    return {}
  }
}

export async function login(log: LogEntry, enterpriseDomain: string, events: EventBus) {
  // Start auth redirect server and wait for its redirect handler to receive the redirect and finish running.
  const server = new AuthRedirectServer(enterpriseDomain, events, log)
  const distroName = getCloudDistributionName(enterpriseDomain)
  log.debug(`Redirecting to ${distroName} login page...`)
  const response: AuthTokenResponse = await new Promise(async (resolve, _reject) => {
    // The server resolves the promise with the new auth token once it's received the redirect.
    await server.start()
    events.once("receivedToken", (tokenResponse: AuthTokenResponse) => {
      log.debug("Received client auth token.")
      resolve(tokenResponse)
    })
  })
  await server.close()
  if (!response) {
    throw new InternalError(`Error: Did not receive an auth token after logging in.`, {})
  }

  return response
}
