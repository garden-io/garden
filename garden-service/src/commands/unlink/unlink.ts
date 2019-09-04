/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command } from "../base"
import { UnlinkSourceCommand } from "./source"
import { UnlinkModuleCommand } from "./module"

export class UnlinkCommand extends Command {
  name = "unlink"
  help = "Unlink a remote source or module from its local path."

  subCommands = [UnlinkSourceCommand, UnlinkModuleCommand]

  async action() {
    return {}
  }
}
