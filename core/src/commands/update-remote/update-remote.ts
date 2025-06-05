/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { CommandGroup } from "../base.js"
import { UpdateRemoteSourcesCommand } from "./sources.js"
import { UpdateRemoteModulesCommand } from "./modules.js"
import { UpdateRemoteAllCommand } from "./all.js"
import { UpdateRemoteActionsCommand } from "./actions.js"

export class UpdateRemoteCommand extends CommandGroup {
  name = "update-remote"
  help = "Pulls the latest version of remote sources, actions or modules from their repository."

  subCommands = [
    UpdateRemoteSourcesCommand,
    UpdateRemoteActionsCommand,
    UpdateRemoteModulesCommand,
    UpdateRemoteAllCommand,
  ]
}
