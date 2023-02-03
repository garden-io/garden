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
import { AuthTokenResponse, CloudApi, getGardenCloudDomain } from "../cloud/api"
import { LogEntry } from "../logger/log-entry"
import { InternalError } from "../exceptions"
import { AuthRedirectServer } from "../cloud/auth"
import { EventBus } from "../events"
import { getCloudDistributionName } from "../util/util"
import { ProjectResource } from "../config/project"
import { LocalConfig, localConfigKeys } from "../config-store"
import { DEFAULT_GARDEN_CLOUD_DOMAIN } from "../constants"

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

  async action({ cli, garden, log }: CommandParams): Promise<CommandResult> {
    const currentDirectory = garden.projectRoot

    // The Enterprise API is missing from the Garden class for commands with noProject
    // so we initialize it here.
    const projectConfig: ProjectResource | undefined = await cli!.getProjectConfig(currentDirectory)

    // Garden works by default without Garden Cloud. In order to use cloud, a domain
    // must be known to cloud for any command needing a logged in user.
    //
    // The cloud domain is resolved in the following order:
    // - 1. GARDEN_CLOUD_DOMAIN config variable
    // - 2. `domain`-field from the project config
    // - 3. cloud.domain key in the .garden/local-config.yml
    //
    // The fallback behavior on the local config is set when running login and unset
    // when running logout. This enables the default mode of garden commands to be
    // run without being logged in to Garden Cloud.
    const localConfig: LocalConfig | undefined = await garden.configStore.get()
    let cloudDomain: string | undefined = getGardenCloudDomain(projectConfig, localConfig)

    if (!cloudDomain) {
      // Since this is the login command, we fallback to use the default Garden Cloud
      // domain if it has not already been resolved by the method defined above.
      cloudDomain = DEFAULT_GARDEN_CLOUD_DOMAIN
    }

    const distroName = getCloudDistributionName(cloudDomain || "")

    try {
      const cloudApi = await CloudApi.factory({ log, cloudDomain, skipLogging: true })

      if (cloudApi) {
        log.info({ msg: `You're already logged in to ${distroName} at ${cloudDomain}.` })
        cloudApi.close()
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

    log.info({ msg: `Logging in to ${cloudDomain}...` })
    const tokenResponse = await login(log, cloudDomain, garden.events)
    await CloudApi.saveAuthToken(log, tokenResponse)

    // Update the local config with the cloud domain
    if (cloudDomain === DEFAULT_GARDEN_CLOUD_DOMAIN) {
      await garden.configStore.set([localConfigKeys().cloud], { domain: cloudDomain })
    }

    log.info({ msg: `Successfully logged in to ${distroName} at ${cloudDomain}.` })

    return {}
  }
}

export async function login(log: LogEntry, cloudDomain: string, events: EventBus) {
  // Start auth redirect server and wait for its redirect handler to receive the redirect and finish running.
  const server = new AuthRedirectServer(cloudDomain, events, log)
  const distroName = getCloudDistributionName(cloudDomain)
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
