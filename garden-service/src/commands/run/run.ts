/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { safeDump } from "js-yaml"
import { RuntimeContext } from "../../types/service"
import { highlightYaml } from "../../util/util"
import { Command } from "../base"
import { RunModuleCommand } from "./module"
import { RunServiceCommand } from "./service"
import { RunWorkflowCommand } from "./workflow"
import { RunTestCommand } from "./test"
import { Garden } from "../../garden"

export class RunCommand extends Command {
  name = "run"
  help = "Run ad-hoc instances of your modules, services and tests"

  subCommands = [
    RunModuleCommand,
    RunServiceCommand,
    RunWorkflowCommand,
    RunTestCommand,
  ]

  async action() { return {} }
}

export function printRuntimeContext(garden: Garden, runtimeContext: RuntimeContext) {
  garden.log.verbose("-----------------------------------\n")
  garden.log.verbose("Environment variables:")
  garden.log.verbose(highlightYaml(safeDump(runtimeContext.envVars)))
  garden.log.verbose("Dependencies:")
  garden.log.verbose(highlightYaml(safeDump(runtimeContext.dependencies)))
  garden.log.verbose("-----------------------------------\n")
}
