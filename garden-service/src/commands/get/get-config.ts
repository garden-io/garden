/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command, CommandResult, CommandParams } from "../base"
import { ConfigDump } from "../../garden"

export class GetConfigCommand extends Command {
  name = "config"
  help = "Outputs the fully resolved configuration for this project and environment."

  async action({ garden, log }: CommandParams): Promise<CommandResult<ConfigDump>> {
    const config = await garden.dumpConfig(log)

    // TODO: do a nicer print of this by default
    log.info({ data: config })

    return { result: config }
  }
}
