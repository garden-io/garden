/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { getPackageVersion } from "../util/util.js"
import type { CommandParams, CommandResult } from "./base.js"
import { Command } from "./base.js"

interface VersionCommandResult {
  version: string
}

export class VersionCommand extends Command {
  name = "version"
  override aliases = ["v", "V"]
  help = "Shows the current garden version."
  override noProject = true

  override async action(params: CommandParams): Promise<CommandResult<VersionCommandResult>> {
    const { log } = params
    const version = getPackageVersion()
    log.info(`garden version: ${version}`)

    return {
      result: { version },
    }
  }
}
