/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { RuntimeContext } from "../../runtime-context"
import { highlightYaml, safeDumpYaml } from "../../util/util"
import { CommandGroup } from "../base"
import { RunModuleCommand } from "./module"
import { RunServiceCommand } from "./service"
import { RunTaskCommand } from "./task"
import { RunTestCommand } from "./test"
import { RunWorkflowCommand } from "./workflow"
import { LogEntry } from "../../logger/log-entry"

export class RunCommand extends CommandGroup {
  name = "run"
  help = "Run ad-hoc instances of your modules, services, tests, tasks or workflows."

  subCommands = [RunModuleCommand, RunServiceCommand, RunTaskCommand, RunTestCommand, RunWorkflowCommand]
}

export function printRuntimeContext(log: LogEntry, runtimeContext: RuntimeContext) {
  log.verbose("-----------------------------------\n")
  log.verbose("Environment variables:")
  log.verbose(highlightYaml(safeDumpYaml(runtimeContext.envVars)))
  log.verbose("Dependencies:")
  log.verbose(highlightYaml(safeDumpYaml(runtimeContext.dependencies)))
  log.verbose("-----------------------------------\n")
}
