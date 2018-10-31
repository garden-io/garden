/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command } from "../base"
import { CreateProjectCommand } from "./project"
import { CreateModuleCommand } from "./module"

export class CreateCommand extends Command {
  name = "create"
  help = "Create a new project or add a new module"

  subCommands = [
    CreateProjectCommand,
    CreateModuleCommand,
  ]

  async action() { return {} }
}
