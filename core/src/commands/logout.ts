/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandParams, CommandResult } from "./base"
import { printHeader } from "../logger/util"
import dedent = require("dedent")

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
    if (!garden.enterpriseApi?.getDomain()) {
      // If no domain is found or enterpriseApi is null, this is a noop
      return {}
    }
    log.debug({ msg: `Logging out of ${garden.enterpriseApi?.getDomain()}` })
    log.info({ msg: `Logging out of Garden Enterprise.` })
    try {
      await garden.enterpriseApi.logout()
      log.info({ msg: `Succesfully logged out from Garden Enterprise.` })
    } catch (error) {
      log.error(error)
    }

    return {}
  }
}
