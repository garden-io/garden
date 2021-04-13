/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandParams, CommandResult } from "./base"
import { printHeader } from "../logger/util"
import { EnterpriseApi } from "../enterprise/api"
import { ClientAuthToken } from "../db/entities/client-auth-token"
import { dedent } from "../util/string"
import { findProjectConfigOrFail } from "../config/base"
import { ConfigurationError } from "../exceptions"

export class LogOutCommand extends Command {
  name = "logout"
  help = "Log out of Garden Enterprise."
  hidden = true
  noProject = true

  description = dedent`
    Logs you out of Garden Enterprise.
  `

  printHeader({ headerLog }) {
    printHeader(headerLog, "Log out", "cloud")
  }

  async action({ garden, log }: CommandParams): Promise<CommandResult> {
    const token = await ClientAuthToken.findOne()
    if (!token) {
      log.info({ msg: `You're already logged out from Garden Enterprise.` })
      return {}
    }

    const projectConfig = await findProjectConfigOrFail(garden.projectRoot)
    if (!projectConfig.domain || !projectConfig.id) {
      throw new ConfigurationError(`Project config is missing an enterprise domain and/or a project ID.`, {})
    }
    try {
      // The Enterprise API is missing from the Garden class for commands with noProject
      // so we initialize it here.
      const enterpriseApi = await EnterpriseApi.factory({
        log,
        projectConfig,
        skipLogging: true,
      })

      if (!enterpriseApi) {
        return {}
      }

      await enterpriseApi.post("token/logout", {
        headers: {
          Cookie: `rt=${token?.refreshToken}`,
        },
      })
      enterpriseApi.close()
    } catch (err) {
      const msg = dedent`
      The following issue occurred while logging out from Garden Enterprise (your session will be cleared regardless): ${err.message}\n
      `
      log.warn({
        symbol: "warning",
        msg,
      })
    } finally {
      log.info({ msg: `Succesfully logged out from Garden Enterprise.` })
      await EnterpriseApi.clearAuthToken(log)
    }
    return {}
  }
}
