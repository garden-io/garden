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
import { GardenCloudApi } from "../cloud/api.js"
import { dedent, deline } from "../util/string.js"
import { BooleanParameter } from "../cli/params.js"
import { clearAuthToken, getStoredAuthToken } from "../cloud/auth.js"
import { getCloudDomain } from "../cloud/util.js"
import { deriveCloudDomainForNoProjectCommand } from "./util/no-project.js"
import type { Log } from "../logger/log-entry.js"
import type { ClientAuthToken, GlobalConfigStore } from "../config-store/global.js"

export const logoutOpts = {
  "disable-project-check": new BooleanParameter({
    help: deline`Disables the check that this is run from within a Garden Project. Logs you out from the default Garden Cloud domain`,
    defaultValue: false,
  }),
}

type Opts = typeof logoutOpts

export class LogOutCommand extends Command<{}, Opts> {
  name = "logout"
  help = "Log out of Garden Cloud."

  override noProject = true

  override description = dedent`
    Logs you out of Garden Cloud.
  `
  override options = logoutOpts

  override printHeader({ log }) {
    printHeader(log, "Log out", "☁️")
  }

  async action({ garden, log, opts }: CommandParams): Promise<CommandResult> {
    const projectConfigDomain = await deriveCloudDomainForNoProjectCommand({
      disableProjectCheck: opts["disable-project-check"],
      garden,
      log,
    })

    const cloudDomain = getCloudDomain(projectConfigDomain)
    const globalConfigStore = garden.globalConfigStore

    try {
      const clientAuthToken = await getStoredAuthToken(log, globalConfigStore, cloudDomain)
      if (!clientAuthToken) {
        log.info({ msg: `You're already logged out from ${cloudDomain}.` })
        return {}
      }

      await revokeToken({ clientAuthToken, cloudDomain, globalConfigStore, log })
    } catch (err) {
      const msg = dedent`
      The following issue occurred while logging out from ${cloudDomain} (your session will be cleared regardless): ${err}\n
      `
      log.warn(msg)
    } finally {
      await clearAuthToken(log, globalConfigStore, cloudDomain)
      log.success(`Successfully logged out from ${cloudDomain}.`)
    }

    return {}
  }
}

async function revokeToken({
  clientAuthToken,
  cloudDomain,
  globalConfigStore,
  log,
}: {
  clientAuthToken: ClientAuthToken
  cloudDomain: string
  globalConfigStore: GlobalConfigStore
  log: Log
}): Promise<void> {
  // NOTE: The Cloud API is missing from the `Garden` class for commands
  // with `noProject = true` so we initialize it here.
  const cloudApi = await GardenCloudApi.factory({
    log,
    cloudDomain,
    skipLogging: true,
    globalConfigStore,
  })

  if (!cloudApi) {
    return
  }

  try {
    await cloudApi.post("token/logout", { headers: { Cookie: `rt=${clientAuthToken?.refreshToken}` } })
  } catch (err) {
    log.debug({ msg: "Failed to revoke token; it was either invalid or already expired." })
    throw err
  } finally {
    cloudApi.close()
  }
}
