/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  Command,
  CommandResult,
  CommandParams,
} from "./base"
import { getPackageVersion } from "../cli/helpers"
import chalk from "chalk"

export class VersionCommand extends Command {
  name = "version"
  help = "Show's the current cli version."

  async action({ log }: CommandParams<{}>): Promise<CommandResult<String>> {
    const result = `${getPackageVersion()}`

    log.info(`${chalk.white(result)}`)
    return { result }
  }
}
