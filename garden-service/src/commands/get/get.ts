/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Command } from "../base"
import { GetGraphCommand } from "./get-graph"
import { GetConfigCommand } from "./get-config"
import { GetEysiCommand } from "./get-eysi"
import { GetSecretCommand } from "./get-secret"
import { GetStatusCommand } from "./get-status"
import { GetTasksCommand } from "./get-tasks"
import { GetTaskResultCommand } from "./get-task-result"
import { GetTestResultCommand } from "./get-test-result"
import { GetDebugInfoCommand } from "./get-debug-info"

export class GetCommand extends Command {
  name = "get"
  help = "Retrieve and output data and objects, e.g. secrets, status info etc."

  subCommands = [
    GetGraphCommand,
    GetConfigCommand,
    GetEysiCommand,
    GetSecretCommand,
    GetStatusCommand,
    GetTasksCommand,
    GetTaskResultCommand,
    GetTestResultCommand,
    GetDebugInfoCommand,
  ]

  async action() {
    return {}
  }
}
