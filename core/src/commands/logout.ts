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
import { EnterpriseApi } from "../enterprise/api"

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
    // The Enterprise API is missing from the Garden class for commands with noProject
    // so we initialize it here.
    const enterpriseApi = await EnterpriseApi.factory(log, garden.projectRoot)

    if (!enterpriseApi) {
      log.info({ msg: `You're already logged out from Garden Enterprise.` })
      return {}
    }

    try {
      await enterpriseApi.logout()
      log.info({ msg: `Succesfully logged out from Garden Enterprise.` })
    } catch (error) {
      log.error(error)
    }

    await enterpriseApi.close()

    return {}
  }
}
