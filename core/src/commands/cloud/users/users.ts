/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { CommandGroup } from "../../base"
import { UsersCreateCommand } from "./users-create"
import { UsersDeleteCommand } from "./users-delete"
import { UsersListCommand } from "./users-list"

export class UsersCommand extends CommandGroup {
  name = "users"
  help = "List, create, and delete users."

  subCommands = [UsersListCommand, UsersCreateCommand, UsersDeleteCommand]
}
