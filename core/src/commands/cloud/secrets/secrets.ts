/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { CommandGroup } from "../../base.js"
import { SecretsCreateCommand } from "./secrets-create.js"
import { SecretsDeleteCommand } from "./secrets-delete.js"
import { SecretsListCommand } from "./secrets-list.js"
import { SecretsUpdateCommand } from "./secrets-update.js"

export class SecretsCommand extends CommandGroup {
  name = "secrets"
  help = "List, create, and delete secrets."

  subCommands = [SecretsListCommand, SecretsCreateCommand, SecretsUpdateCommand, SecretsDeleteCommand]
}
