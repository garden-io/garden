/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
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
import { ProjectResource } from "../config/project"
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
    printHeader(headerLog, "Log out", "cloud")
  }

  async action({ cli, garden, log }: CommandParams): Promise<CommandResult> {
    // Note: lazy-loading for startup performance
    const { ClientAuthToken } = require("../db/entities/client-auth-token")

    const projectConfig: ProjectResource | undefined = await cli!.getProjectConfig(garden.projectRoot)

    // Fail if this is not run within a garden project
    if (!projectConfig) {
      throw new ConfigurationError(
        `Not a project directory (or any of the parent directories): ${garden.projectRoot}`,
        {
          root: garden.projectRoot,
        }
      )
    }

    const cloudDomain: string = getGardenCloudDomain(projectConfig)
    const distroName = getCloudDistributionName(cloudDomain)

    try {
      // The Enterprise API is missing from the Garden class for commands with noProject
      // so we initialize it here.

      const token = await ClientAuthToken.findOne()

      if (!token) {
        log.info({ msg: `You're already logged out from ${distroName} at ${cloudDomain}.` })
        return {}
      }

      const cloudApi = await CloudApi.factory({
        log,
        cloudDomain,
        skipLogging: true,
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
      // always clear the auth token
      await CloudApi.clearAuthToken(log)

      log.info({ msg: `Succesfully logged out from ${distroName} at ${cloudDomain}.` })
    }
    return {}
  }
}
