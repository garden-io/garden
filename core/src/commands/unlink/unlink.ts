/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { CommandGroup } from "../base.js"
import { UnlinkSourceCommand } from "./source.js"
import { UnlinkModuleCommand } from "./module.js"
import { UnlinkActionCommand } from "./action.js"

export class UnlinkCommand extends CommandGroup {
  name = "unlink"
  help = "Unlink a remote source or module from its local path."

  subCommands = [UnlinkSourceCommand, UnlinkActionCommand, UnlinkModuleCommand]
}
