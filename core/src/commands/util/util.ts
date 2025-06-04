/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { CommandGroup } from "../base.js"
import { FetchToolsCommand } from "./fetch-tools.js"
import { HideWarningCommand } from "./hide-warning.js"
import { MutagenCommand } from "./mutagen.js"
import { ProfileProjectCommand } from "./profile-project.js"

export class UtilCommand extends CommandGroup {
  name = "util"
  help = "Misc utility commands."

  subCommands = [FetchToolsCommand, HideWarningCommand, MutagenCommand, ProfileProjectCommand]
}
