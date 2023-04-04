/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandParams, CommandResult } from "./base"
import { printHeader } from "../logger/util"
import { CloudApi, getGardenCloudDomain } from "../cloud/api"
import { dedent } from "../util/string"
import { getCloudDistributionName } from "../util/util"
import { ConfigurationError } from "../exceptions"

export class LogOutCommand extends Command {
  name = "logout"
  help = "Log out of Garden Cloud."
  hidden = true
  noProject = true

  description = dedent`
    Logs you out of Garden Cloud.
  `

  printHeader({ headerLog }) {
    printHeader(headerLog, "Log out", "☁️")
  }

  async action({ cli, garden, log }: CommandParams): Promise<CommandResult> {
    // The Enterprise API is missing from the Garden class for commands with noProject
    // so we initialize it here.
    let configuredDomain = garden.cloudDomain

    if (!configuredDomain) {
      const projectConfig = await cli?.getProjectConfig(log, garden.projectRoot)

      // Fail if this is not run within a garden project
      if (!projectConfig) {
        throw new ConfigurationError(
          `Not a project directory (or any of the parent directories): ${garden.projectRoot}`,
          {
            root: garden.projectRoot,
          }
        )
      }
    }

    const cloudDomain: string | undefined = getGardenCloudDomain(configuredDomain)

    const distroName = getCloudDistributionName(cloudDomain)

    try {
      // The Enterprise API is missing from the Garden class for commands with noProject
      // so we initialize it here.

      const token = await garden.globalConfigStore.get("clientAuthTokens", cloudDomain)

      if (!token) {
        log.info({ msg: `You're already logged out from ${cloudDomain}.` })
        return {}
      }

      const cloudApi = await CloudApi.factory({
        log,
        cloudDomain,
        skipLogging: true,
        globalConfigStore: garden.globalConfigStore,
      })

      if (!cloudApi) {
        return {}
      }

      await cloudApi.post("token/logout", { headers: { Cookie: `rt=${token?.refreshToken}` } })
      cloudApi.close()
    } catch (err) {
      const msg = dedent`
      The following issue occurred while logging out from ${distroName} (your session will be cleared regardless): ${err.message}\n
      `
      log.warn({
        symbol: "warning",
        msg,
      })
    } finally {
      await CloudApi.clearAuthToken(log, garden.globalConfigStore, cloudDomain)
      log.info({ msg: `Succesfully logged out from ${cloudDomain}.` })
    }
    return {}
  }
}
