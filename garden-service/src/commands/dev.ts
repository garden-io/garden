/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Bluebird from "bluebird"
import deline = require("deline")
import dedent = require("dedent")
import chalk from "chalk"
import { readFile } from "fs-extra"
import { flatten } from "lodash"
import moment = require("moment")
import { join } from "path"

import { BuildTask } from "../tasks/build"
import { BaseTask } from "../tasks/base"
import { hotReloadAndLog, validateHotReloadOpt } from "./helpers"
import { getTasksForModule, getHotReloadModuleNames } from "../tasks/helpers"
import {
  Command,
  CommandResult,
  CommandParams,
  StringsParameter,
  handleTaskResults,
} from "./base"
import { STATIC_DIR } from "../constants"
import { processModules } from "../process"
import { Module } from "../types/module"
import { getTestTasks } from "../tasks/test"

const ansiBannerPath = join(STATIC_DIR, "garden-banner-2.txt")

const devArgs = {}

const devOpts = {
  "hot-reload": new StringsParameter({
    help: deline`The name(s) of the service(s) to deploy with hot reloading enabled.
      Use comma as a separator to specify multiple services.
    `}),
}

type Args = typeof devArgs
type Opts = typeof devOpts

// TODO: allow limiting to certain modules and/or services
export class DevCommand extends Command<Args, Opts> {
  name = "dev"
  help = "Starts the garden development console."

  // Currently it doesn't make sense to do file watching except in the CLI
  cliOnly = true

  description = dedent`
    The Garden dev console is a combination of the \`build\`, \`deploy\` and \`test\` commands.
    It builds, deploys and tests all your modules and services, and re-builds, re-deploys and re-tests
    as you modify the code.

    Examples:

        garden dev
        garden dev --hot-reload=foo-service,bar-service # enable hot reloading for foo-service and bar-service
  `

  options = devOpts

  async printHeader(log) {
    // print ANSI banner image
    const data = await readFile(ansiBannerPath)
    log.info(data.toString())

    log.info(chalk.gray.italic(`\nGood ${getGreetingTime()}! Let's get your environment wired up...\n`))
  }

  async action({ garden, log, opts }: CommandParams<Args, Opts>): Promise<CommandResult> {
    await garden.actions.prepareEnvironment({ log })

    const modules = await garden.getModules()

    if (modules.length === 0) {
      log.info({ msg: "No modules found in project." })
      log.info({ msg: "Aborting..." })
      return {}
    }

    const hotReloadServiceNames = opts["hot-reload"] || []
    const hotReloadModuleNames = await getHotReloadModuleNames(garden, hotReloadServiceNames)

    if (opts["hot-reload"] && !validateHotReloadOpt(garden, log, hotReloadServiceNames)) {
      return {}
    }

    const dependencyGraph = await garden.getDependencyGraph()

    const tasksForModule = (watch: boolean) => {
      return async (module: Module) => {

        const hotReload = hotReloadModuleNames.has(module.name)

        if (watch && hotReload) {
          await hotReloadAndLog(garden, log, module)
        }

        const testModules: Module[] = watch
          ? (await dependencyGraph.withDependantModules([module]))
          : [module]

        const testTasks: BaseTask[] = flatten(await Bluebird.map(
          testModules, m => getTestTasks({ garden, log, module: m })))

        const tasks = testTasks.concat(await getTasksForModule({
          garden,
          log,
          module,
          fromWatch: watch,
          hotReloadServiceNames,
          force: watch,
          forceBuild: watch,
          includeDependants: watch,
        }))

        if (tasks.length === 0) {
          return [new BuildTask({ garden, log, module, force: watch })]
        } else {
          return tasks
        }
      }

    }

    const results = await processModules({
      garden,
      log,
      modules,
      watch: true,
      handler: tasksForModule(false),
      changeHandler: tasksForModule(true),
    })

    return handleTaskResults(log, "dev", results)

  }
}

function getGreetingTime() {
  const m = moment()

  const currentHour = parseFloat(m.format("HH"))

  if (currentHour >= 17) {
    return "evening"
  } else if (currentHour >= 12) {
    return "afternoon"
  } else {
    return "morning"
  }
}
