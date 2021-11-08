/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dedent } from "../../util/string"
import { CommandGroup } from "../base"
import { GroupsCommand } from "./groups/groups"
import { SecretsCommand } from "./secrets/secrets"
import { UsersCommand } from "./users/users"

export class CloudCommand extends CommandGroup {
  name = "cloud"
  alias = "enterprise"
  help = dedent`
    Manage Garden Cloud/Enterprise resources such as users, groups and secrets.
  `

  subCommands = [SecretsCommand, UsersCommand, GroupsCommand]
}
