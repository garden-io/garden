/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { CommandGroup } from "../base.js"
import { SyncRestartCommand } from "./sync-restart.js"
import { SyncStartCommand } from "./sync-start.js"
import { SyncStatusCommand } from "./sync-status.js"
import { SyncStopCommand } from "./sync-stop.js"

export class SyncCommand extends CommandGroup {
  name = "sync"
  help = "Manage synchronization to running actions."

  subCommands = [SyncStartCommand, SyncStopCommand, SyncRestartCommand, SyncStatusCommand]
}

export type SyncCommandName = SyncCommand["subCommands"][number]["name"]
