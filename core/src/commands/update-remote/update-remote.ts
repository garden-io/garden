/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { CommandGroup } from "../base"
import { UpdateRemoteSourcesCommand } from "./sources"
import { UpdateRemoteModulesCommand } from "./modules"
import { UpdateRemoteAllCommand } from "./all"
import { UpdateRemoteActionsCommand } from "./actions"

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
