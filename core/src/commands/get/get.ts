/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { CommandGroup } from "../base"
import { GetGraphCommand } from "./get-graph"
import { GetConfigCommand } from "./get-config"
import { GetEysiCommand } from "./get-eysi"
import { GetSecretCommand } from "./get-secret"
import { GetStatusCommand } from "./get-status"
import { GetTasksCommand } from "./get-tasks"
import { GetTaskResultCommand } from "./get-task-result"
import { GetTestResultCommand } from "./get-test-result"
import { GetDebugInfoCommand } from "./get-debug-info"
import { GetLinkedReposCommand } from "./get-linked-repos"
import { GetOutputsCommand } from "./get-outputs"
import { GetDoddiCommand } from "./get-doddi"
import { GetModulesCommand } from "./get-modules"
import { GetVaccineCommand } from "./get-vaccine"
import { GetTestsCommand } from "./get-tests"

export class GetCommand extends CommandGroup {
  name = "get"
  help = "Retrieve and output data and objects, e.g. secrets, status info etc."

  subCommands = [
    GetGraphCommand,
    GetConfigCommand,
    GetDoddiCommand,
    GetEysiCommand,
    GetLinkedReposCommand,
    GetOutputsCommand,
    GetModulesCommand,
    GetSecretCommand,
    GetStatusCommand,
    GetTasksCommand,
    GetTestsCommand,
    GetTaskResultCommand,
    GetTestResultCommand,
    GetDebugInfoCommand,
    GetVaccineCommand,
  ]
}
