/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { getPackageVersion } from "../util/util"
import { Command, CommandResult } from "./base"

interface VersionCommandResult {
  version: string
}

export class VersionCommand extends Command {
  name = "version"
  override aliases = ["v", "V"]
  help = "Shows the current garden version."
  override noProject = true

  async action({ log }): Promise<CommandResult<VersionCommandResult>> {
    const version = getPackageVersion()
    log.info(`garden version: ${version}`)

    return {
      result: { version },
    }
  }
}
