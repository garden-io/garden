/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../util/string.js"
import { CommandGroup } from "../base.js"
import { GroupsCommand } from "./groups/groups.js"
import { SecretsCommand } from "./secrets/secrets.js"
import { UsersCommand } from "./users/users.js"

export class CloudCommand extends CommandGroup {
  name = "cloud"
  override aliases = ["enterprise"]
  help = dedent`
    Manage Garden Cloud/Enterprise resources such as users, groups and secrets.
  `

  subCommands = [SecretsCommand, UsersCommand, GroupsCommand]
}
