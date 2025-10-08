/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { CommandGroup } from "../base.js"
import { GetGraphCommand } from "./get-graph.js"
import { GetConfigCommand } from "./get-config.js"
import { GetEysiCommand } from "./get-eysi.js"
import { GetStatusCommand } from "./get-status.js"
import { GetRunsCommand } from "./get-runs.js"
import { GetRunResultCommand } from "./get-run-result.js"
import { GetTestResultCommand } from "./get-test-result.js"
import { GetDebugInfoCommand } from "./get-debug-info.js"
import { GetLinkedReposCommand } from "./get-linked-repos.js"
import { GetOutputsCommand } from "./get-outputs.js"
import { GetDoddiCommand } from "./get-doddi.js"
import { GetModulesCommand } from "./get-modules.js"
import { GetTestsCommand } from "./get-tests.js"
import { GetWorkflowsCommand } from "./get-workflows.js"
import { GetActionsCommand } from "./get-actions.js"
import { GetDeploysCommand } from "./get-deploys.js"
import { GetBuildsCommand } from "./get-builds.js"
import { GetFilesCommand } from "./get-files.js"
import { GetVariablesCommand } from "./get-variables.js"
import { GetUsersCommand } from "./get-users.js"
import { GetVariableListsCommand } from "./get-variable-lists.js"
import { GetRemoteVariablesCommand } from "./get-remote-variables.js"

export class GetCommand extends CommandGroup {
  name = "get"
  help = "Retrieve and output data and objects, e.g. secrets, status info etc."

  subCommands = [
    GetGraphCommand,
    GetConfigCommand,
    GetDoddiCommand,
    GetEysiCommand,
    GetFilesCommand,
    GetLinkedReposCommand,
    GetOutputsCommand,
    GetModulesCommand,
    GetStatusCommand,
    GetActionsCommand,
    GetDeploysCommand,
    GetBuildsCommand,
    GetRunsCommand,
    GetTestsCommand,
    GetRunResultCommand,
    GetTestResultCommand,
    GetDebugInfoCommand,
    GetWorkflowsCommand,
    GetVariablesCommand,
    GetUsersCommand,
    GetVariableListsCommand,
    GetRemoteVariablesCommand,
  ]
}
