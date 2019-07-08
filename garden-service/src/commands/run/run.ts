/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { safeDump } from "js-yaml"
import { RuntimeContext, prepareRuntimeContext } from "../../types/service"
import { highlightYaml } from "../../util/util"
import { Command } from "../base"
import { RunModuleCommand } from "./module"
import { RunServiceCommand } from "./service"
import { RunTaskCommand } from "./task"
import { RunTestCommand } from "./test"
import { LogEntry } from "../../logger/log-entry"
import { ConfigGraph } from "../../config-graph"
import { Module } from "../../types/module"
import { Garden } from "../../garden"

export class RunCommand extends Command {
  name = "run"
  help = "Run ad-hoc instances of your modules, services and tests."

  subCommands = [
    RunModuleCommand,
    RunServiceCommand,
    RunTaskCommand,
    RunTestCommand,
  ]

  async action() { return {} }
}

export async function runtimeContextForServiceDeps(garden: Garden, graph: ConfigGraph, module: Module) {
  const depNames = module.serviceDependencyNames
  const allServices = await graph.getServices()
  const deps = allServices.filter(s => depNames.includes(s.name))
  return prepareRuntimeContext(garden, graph, module, deps)
}

export function printRuntimeContext(log: LogEntry, runtimeContext: RuntimeContext) {
  log.verbose("-----------------------------------\n")
  log.verbose("Environment variables:")
  log.verbose(highlightYaml(safeDump(runtimeContext.envVars)))
  log.verbose("Dependencies:")
  log.verbose(highlightYaml(safeDump(runtimeContext.dependencies)))
  log.verbose("-----------------------------------\n")
}
