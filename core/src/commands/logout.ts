/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandParams, CommandResult } from "./base"
import { printHeader } from "../logger/util"
import { CloudApi } from "../cloud/api"
import { dedent } from "../util/string"
import { getCloudDistributionName } from "../util/util"

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

  async action({ garden, log }: CommandParams): Promise<CommandResult> {
    // Note: lazy-loading for startup performance
    const { ClientAuthToken } = require("../db/entities/client-auth-token")

    const token = await ClientAuthToken.findOne()
    const distroName = getCloudDistributionName(garden.enterpriseDomain || "")

    if (!token) {
      log.info({ msg: `You're already logged out from ${distroName}.` })
      return {}
    }

    try {
      // The Enterprise API is missing from the Garden class for commands with noProject
      // so we initialize it here.
      const cloudApi = await CloudApi.factory({
        log,
        currentDirectory: garden.projectRoot,
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
      log.info({ msg: `Succesfully logged out from ${distroName}.` })
      await CloudApi.clearAuthToken(log)
    }
    return {}
  }
}
