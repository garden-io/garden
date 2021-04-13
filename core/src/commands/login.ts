/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandParams, CommandResult } from "./base"
import { printHeader } from "../logger/util"
import dedent = require("dedent")
import { AuthTokenResponse, EnterpriseApi } from "../enterprise/api"
import { LogEntry } from "../logger/log-entry"
import { ConfigurationError, InternalError } from "../exceptions"
import { AuthRedirectServer } from "../enterprise/auth"
import { EventBus } from "../events"
import { findProjectConfigOrFail } from "../config/base"

export class LoginCommand extends Command {
  name = "login"
  help = "Log in to Garden Enterprise."
  hidden = true

  /**
   * Since we're logging in, we don't want to resolve e.g. the project config (since it may use secrets, which are
   * only available after we've logged in).
   */
  noProject = true

  description = dedent`
    Logs you in to Garden Enterprise. Subsequent commands will have access to enterprise features.
  `

  printHeader({ headerLog }) {
    printHeader(headerLog, "Login", "cloud")
  }

  async action({ garden, log }: CommandParams): Promise<CommandResult> {
    const projectConfig = await findProjectConfigOrFail(garden.projectRoot)

    if (!projectConfig.domain || !projectConfig.id) {
      throw new ConfigurationError(`Project config is missing an enterprise domain and/or a project ID.`, {})
    }
    // The Enterprise API is missing from the Garden class for commands with noProject
    // so we initialize it here.
    try {
      const enterpriseApi = await EnterpriseApi.factory({ log, projectConfig, skipLogging: true })
      if (enterpriseApi) {
        log.info({ msg: `You're already logged in to Garden Enteprise.` })
        enterpriseApi.close()
        return {}
      }
    } catch (err) {
      if (err?.detail?.statusCode === 401) {
        const msg = dedent`
          Looks like your session token is invalid. If you were previously logged into a different instance
          of Garden Enterprise, log out first before logging in.
        `
        log.warn({ msg, symbol: "warning" })
        log.info("")
      }
      throw err
    }

    log.info({ msg: `Logging in to ${projectConfig.domain}...` })
    const tokenResponse = await login(log, projectConfig.domain, garden.events)
    await EnterpriseApi.saveAuthToken(log, tokenResponse)
    log.info({ msg: `Successfully logged in to Garden Enteprise.` })
    return {}
  }
}

export async function login(log: LogEntry, enterpriseDomain: string, events: EventBus) {
  // Start auth redirect server and wait for its redirect handler to receive the redirect and finish running.
  const server = new AuthRedirectServer(enterpriseDomain, events, log)
  log.debug(`Redirecting to Garden Enterprise login page...`)
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
