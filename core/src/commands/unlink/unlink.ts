/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { CommandGroup } from "../base"
import { UnlinkSourceCommand } from "./source"
import { UnlinkModuleCommand } from "./module"
import { UnlinkActionCommand } from "./action"

export class UnlinkCommand extends CommandGroup {
  name = "unlink"
  help = "Unlink a remote source or module from its local path."

  subCommands = [UnlinkSourceCommand, UnlinkActionCommand, UnlinkModuleCommand]
}
