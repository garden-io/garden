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
import { GardenCloudApi } from "../cloud/api.js"
import type { Log } from "../logger/log-entry.js"
import { CloudApiError, ConfigurationError, InternalError, TimeoutError } from "../exceptions.js"
import type { AuthRedirectServerConfig, AuthToken } from "../cloud/auth.js"
import { AuthRedirectServer, saveAuthToken } from "../cloud/auth.js"
import type { EventBus } from "../events/events.js"
import type { ProjectConfig } from "../config/project.js"
import { findProjectConfig } from "../config/base.js"
import { BooleanParameter } from "../cli/params.js"
import { deline } from "../util/string.js"
import { gardenEnv } from "../constants.js"
import { getCloudDistributionName, getGardenCloudDomain } from "../cloud/util.js"
import { isArray } from "lodash-es"

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
    // NOTE: The Cloud API is missing from the Garden class for commands with noProject
    // so we initialize it here. noProject also make sure that the project config is not
    // initialized in the garden class, so we need to read it in here to get the cloud
    // domain.
    let projectConfig: ProjectConfig | undefined = undefined
    const forceProjectCheck = !opts["disable-project-check"]

    if (forceProjectCheck) {
      projectConfig = await findProjectConfig({ log, path: garden.projectRoot })

      // Fail if this is not run within a garden project
      if (!projectConfig) {
        throw new ConfigurationError({
          message: `Not a project directory (or any of the parent directories): ${garden.projectRoot}`,
        })
      }
    }

    const globalConfigStore = garden.globalConfigStore

    // Garden works by default without Garden Cloud. In order to use cloud, a domain
    // must be known to cloud for any command needing a logged in user.
    //
    // The cloud domain is resolved in the following order:
    // - 1. GARDEN_CLOUD_DOMAIN config variable
    // - 2. `domain`-field from the project config
    // - 3. fallback to the default garden cloud domain
    //
    // If the fallback was used, we rely on the token to decide if the Cloud API instance
    // should use the default domain or not. The token lifecycle ends on logout.
    const cloudDomain: string = getGardenCloudDomain(projectConfig?.domain)

    try {
      const cloudApi = await GardenCloudApi.factory({ log, cloudDomain, skipLogging: true, globalConfigStore })

      if (cloudApi) {
        log.success({ msg: `You're already logged in to ${cloudDomain}.` })
        cloudApi.close()
        return {}
      }
    } catch (err) {
      if (!(err instanceof CloudApiError) || (err.responseStatusCode === 401 && gardenEnv.GARDEN_AUTH_TOKEN)) {
        throw err
      }
    }

    log.info({ msg: `Logging in to ${cloudDomain}...` })
    const tokenResponse = await login(log, cloudDomain, garden.events)
    await saveAuthToken(log, globalConfigStore, tokenResponse, cloudDomain)
    log.success({ msg: `Successfully logged in to ${cloudDomain}.`, showDuration: false })

    return {}
  }
}

function getFirstValue(v: string | string[]) {
  return isArray(v) ? v[0] : v
}

export type GardenBackendConfig = { readonly cloudDomain: string }

type AuthRedirectConfig = Pick<AuthRedirectServerConfig, "getLoginUrl" | "successUrl" | "extractAuthToken">

export abstract class AbstractGardenBackend {
  constructor(protected readonly config: GardenBackendConfig) {}

  abstract getAuthRedirectConfig(): AuthRedirectConfig
}

export class GardenCloudBackend extends AbstractGardenBackend {
  override getAuthRedirectConfig(): AuthRedirectConfig {
    return {
      getLoginUrl: (port) => new URL(`/clilogin/${port}`, this.config.cloudDomain).href,
      successUrl: new URL("/clilogin/success", this.config.cloudDomain).href,
      extractAuthToken: (query) => {
        const { jwt, rt, jwtval } = query
        // TODO: validate properly
        return {
          token: getFirstValue(jwt!),
          refreshToken: getFirstValue(rt!),
          tokenValidity: parseInt(getFirstValue(jwtval!), 10),
        }
      },
    }
  }
}

export async function login(log: Log, cloudDomain: string, events: EventBus) {
  // Start auth redirect server and wait for its redirect handler to receive the redirect and finish running.
  const gardenBackend = new GardenCloudBackend({ cloudDomain })
  const server = new AuthRedirectServer({
    events,
    log,
    ...gardenBackend.getAuthRedirectConfig(),
  })

  const distroName = getCloudDistributionName(cloudDomain)
  log.debug(`Redirecting to ${distroName} login page...`)
  const response: AuthToken = await new Promise(async (resolve, reject) => {
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
