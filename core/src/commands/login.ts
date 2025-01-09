/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CommandParams, CommandResult } from "./base.js"
import { Command } from "./base.js"
import { printHeader } from "../logger/util.js"
import dedent from "dedent"
import type { Log } from "../logger/log-entry.js"
import { CloudApiError, InternalError, TimeoutError } from "../exceptions.js"
import type { AuthToken } from "../cloud/auth.js"
import { AuthRedirectServer, saveAuthToken } from "../cloud/auth.js"
import type { EventBus } from "../events/events.js"
import { BooleanParameter } from "../cli/params.js"
import { deline } from "../util/string.js"
import { getCloudDomain } from "../cloud/util.js"
import type { GardenBackend } from "../cloud/backend.js"
import { gardenBackendFactory } from "../cloud/backend.js"
import { gardenEnv } from "../constants.js"
import { deriveCloudDomainForNoProjectCommand } from "./util/no-project.js"

const loginTimeoutSec = 60

export const loginOpts = {
  "disable-project-check": new BooleanParameter({
    help: deline`Disables the check that this is run from within a Garden Project. Logs you in to the default Garden Cloud domain`,
    defaultValue: false,
  }),
}

type Opts = typeof loginOpts

export class LoginCommand extends Command<{}, Opts> {
  name = "login"
  help = "Log in to Garden Cloud."

  /**
   * Since we're logging in, we don't want to resolve e.g. the project config (since it may use secrets, which are
   * only available after we've logged in).
   */
  override noProject = true

  override description = dedent`
    Logs you in to Garden Cloud. Subsequent commands will have access to cloud features.
  `

  override options = loginOpts

  override printHeader({ log }) {
    printHeader(log, "Login", "☁️")
  }

  async action({ garden, log, opts }: CommandParams<{}, Opts>): Promise<CommandResult> {
    const projectConfigDomain = await deriveCloudDomainForNoProjectCommand({
      disableProjectCheck: opts["disable-project-check"],
      garden,
      log,
    })

    const globalConfigStore = garden.globalConfigStore
    const cloudDomain = getCloudDomain(projectConfigDomain)
    const gardenBackend = gardenBackendFactory({ cloudDomain })

    try {
      // NOTE: The Cloud API is missing from the `Garden` class for commands
      // with `noProject = true` so we initialize it here.
      const cloudApi = await gardenBackend.cloudApiFactory({ log, cloudDomain, skipLogging: true, globalConfigStore })
      if (cloudApi) {
        log.success({ msg: `You're already logged in to ${cloudDomain}.` })
        cloudApi.close()
        // If successful, we are already logged in.
        return {}
      }
    } catch (err) {
      if (!(err instanceof CloudApiError) || (err.responseStatusCode === 401 && gardenEnv.GARDEN_AUTH_TOKEN)) {
        throw err
      }
    }

    log.info({ msg: `Logging in to ${cloudDomain}...` })
    const tokenResponse = await login(log, gardenBackend, garden.events)
    await saveAuthToken(log, globalConfigStore, tokenResponse, cloudDomain)
    log.success({ msg: `Successfully logged in to ${cloudDomain}.`, showDuration: false })

    return {}
  }
}

export async function login(log: Log, gardenBackend: GardenBackend, events: EventBus): Promise<AuthToken> {
  // Start auth redirect server and wait for its redirect handler to receive the redirect and finish running.
  const server = new AuthRedirectServer({
    events,
    log,
    ...gardenBackend.getAuthRedirectConfig(),
  })

  log.debug(`Redirecting to ${gardenBackend.config.cloudDomain} login page...`)
  const response = await new Promise<AuthToken>(async (resolve, reject) => {
    // The server resolves the promise with the new auth token once it's received the redirect.
    await server.start()

    let timedOut = false

    const timeout = setTimeout(() => {
      timedOut = true
      reject(
        new TimeoutError({
          message: `Timed out after ${loginTimeoutSec} seconds, waiting for web login response.`,
        })
      )
    }, loginTimeoutSec * 1000)

    events.once("receivedToken", (tokenResponse: AuthToken) => {
      if (timedOut) {
        return
      }
      clearTimeout(timeout)
      log.debug("Received client auth token.")
      resolve(tokenResponse)
    })
  })

  await server.close()
  if (!response) {
    throw new InternalError({ message: `Error: Did not receive an auth token after logging in.` })
  }

  return response
}
