/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { CommandGroup } from "../base"
import { RunBuildCommand } from "./run-build"
import { RunDeployCommand } from "./run-deploy"
import { RunTaskCommand } from "./run-task"
import { RunTestCommand } from "./run-test"
import { RunWorkflowCommand } from "./run-workflow"

export class RunCommand extends CommandGroup {
  name = "run"
  help = "Run ad-hoc instances of your actions, modules or workflows."

  subCommands = [RunBuildCommand, RunDeployCommand, RunTaskCommand, RunTestCommand, RunWorkflowCommand]
}
