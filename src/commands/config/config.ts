/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command } from "../base"
import { ConfigGetCommand } from "./get"
import { ConfigDeleteCommand } from "./delete"
import { ConfigSetCommand } from "./set"

export class ConfigCommand extends Command {
  name = "config"
  alias = "c"
  help = "Manage configuration variables in your environment"

  subCommands = [
    ConfigGetCommand,
    ConfigSetCommand,
    ConfigDeleteCommand,
  ]

  async action() { return {} }
}
