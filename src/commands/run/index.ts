/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { safeDump } from "js-yaml"
import { PluginContext } from "../../plugin-context"
import { RuntimeContext } from "../../types/service"
import { highlightYaml } from "../../util"
import { Command } from "../base"
import { RunModuleCommand } from "./module"
import { RunServiceCommand } from "./service"
import { RunTestCommand } from "./test"

export class RunCommand extends Command {
  name = "run"
  alias = "r"
  help = "Run ad-hoc instances of your modules, services and tests"

  subCommands = [
    new RunModuleCommand(),
    new RunServiceCommand(),
    new RunTestCommand(),
  ]

  async action() { }
}

export function printRuntimeContext(ctx: PluginContext, runtimeContext: RuntimeContext) {
  ctx.log.verbose("-----------------------------------\n")
  ctx.log.verbose("Environment variables:")
  ctx.log.verbose(highlightYaml(safeDump(runtimeContext.envVars)))
  ctx.log.verbose("Dependencies:")
  ctx.log.verbose(highlightYaml(safeDump(runtimeContext.dependencies)))
  ctx.log.verbose("-----------------------------------\n")
}
