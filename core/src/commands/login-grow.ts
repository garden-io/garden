/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import dedent from "dedent"
import { Command, type CommandParams, type CommandResult } from "./base.js"
import { GrowCloudApi } from "../cloud/grow/api.js"
import { cloudApiOrigin } from "../cloud/grow/config.js"
import { GlobalConfigStore } from "../config-store/global.js"
import { CloudApiTokenRefreshError } from "../cloud/api.js"
import type { AuthToken } from "../cloud/auth.js"
import { AuthRedirectServer, saveAuthToken } from "../cloud/auth.js"
import { getCloudDistributionName } from "../cloud/util.js"
import type { EventBus } from "../events/events.js"
import { GrowCloudBackend } from "../cloud/backend.js"
import { printHeader } from "../logger/util.js"
import { InternalError, TimeoutError } from "../exceptions.js"
import type { Log } from "../logger/log-entry.js"
import { BooleanParameter } from "../cli/params.js"
import { deline } from "../util/string.js"

const loginTimeoutSec = 60

export const loginOpts = {
  "disable-project-check": new BooleanParameter({
    help: deline`Disables the check that this is run from within a Garden Project. Logs you in to the default Garden Cloud domain`,
    defaultValue: false,
  }),
}

type Opts = typeof loginOpts

export class GrowLoginCommand extends Command<{}, Opts> {
  name = "login-grow"
  help = "Log in to Grow Cloud."

  /**
   * Since we're logging in, we don't want to resolve e.g. the project config (since it may use secrets, which are
   * only available after we've logged in).
   */
  override noProject = true

  override description = dedent`
    Logs you in to Grow Cloud. Subsequent commands will have access to cloud features.
  `

  override options = loginOpts

  override printHeader({ log }) {
    printHeader(log, "Login", "☁️")
  }

  async action({ garden, log, opts: _opts }: CommandParams<{}, Opts>): Promise<CommandResult> {
    const cloudDomain = cloudApiOrigin
    const globalConfigStore = new GlobalConfigStore()

    async function checkAuthenticationState(): Promise<boolean> {
      const cloudApi = await GrowCloudApi.factory({ log, cloudDomain, skipLogging: true, globalConfigStore })
      if (cloudApi) {
        log.success({ msg: `You're already logged in to ${cloudDomain}.` })
        cloudApi.close()
        return true
      }
      return false
    }

    try {
      if (await checkAuthenticationState()) {
        // If successful, we are already logged in.
        return {}
      }
    } catch (err) {
      if (err instanceof CloudApiTokenRefreshError) {
        // Let's retry.
        try {
          await checkAuthenticationState()
        } catch (innerError) {
          if (innerError instanceof CloudApiTokenRefreshError) {
            const msg = dedent`
              It looks like your existing session token is invalid. Attempting to log in again...
            `
            log.warn(msg)
            log.info("")
          }
        }
      } else {
        throw err
      }
    }

    log.info({ msg: `Logging in to ${cloudDomain}...` })
    const tokenResponse = await login(log, cloudDomain, garden.events)
    if (!tokenResponse) {
      throw new InternalError({ message: `Error: Did not receive an auth token after logging in.` })
    }
    await saveAuthToken(log, globalConfigStore, tokenResponse, cloudDomain)
    log.success({ msg: `Successfully logged in to ${getCloudDistributionName(cloudDomain)}.`, showDuration: false })

    return {}
  }
}

export async function login(log: Log, cloudDomain: string, events: EventBus): Promise<AuthToken | undefined> {
  // Start auth redirect server and wait for its redirect handler to receive the redirect and finish running.
  const gardenBackend = new GrowCloudBackend({ cloudDomain })
  const server = new AuthRedirectServer({
    events,
    log,
    ...gardenBackend.getAuthRedirectConfig(),
  })

  log.debug(`Redirecting to ${cloudDomain} login page...`)
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
