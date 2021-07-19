/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import deline = require("deline")
import dedent = require("dedent")
import chalk from "chalk"
import { readFile } from "fs-extra"
import { flatten } from "lodash"
import moment = require("moment")
import { join } from "path"

import { getModuleWatchTasks } from "../tasks/helpers"
import { Command, CommandResult, CommandParams, handleProcessResults, PrepareParams } from "./base"
import { STATIC_DIR } from "../constants"
import { processModules } from "../process"
import { GardenModule } from "../types/module"
import { getTestTasks } from "../tasks/test"
import { ConfigGraph } from "../config-graph"
import { emitStackGraphEvent, getHotReloadServiceNames, validateHotReloadServiceNames } from "./helpers"
import { startServer } from "../server/server"
import { BuildTask } from "../tasks/build"
import { DeployTask } from "../tasks/deploy"
import { Garden } from "../garden"
import { LogEntry } from "../logger/log-entry"
import { StringsParameter, BooleanParameter } from "../cli/params"
import { printHeader } from "../logger/util"
import { GardenService } from "../types/service"

const ansiBannerPath = join(STATIC_DIR, "garden-banner-2.txt")

const devArgs = {
  services: new StringsParameter({
    help: `Specify which services to develop (defaults to all configured services).`,
  }),
}

const devOpts = {
  "hot-reload": new StringsParameter({
    help: deline`The name(s) of the service(s) to deploy with hot reloading enabled.
      Use comma as a separator to specify multiple services. Use * to deploy all
      services with hot reloading enabled (ignores services belonging to modules that
      don't support or haven't configured hot reloading).
    `,
    alias: "hot",
  }),
  "skip-tests": new BooleanParameter({
    help: "Disable running the tests.",
  }),
  "test-names": new StringsParameter({
    help:
      "Filter the tests to run by test name across all modules (leave unset to run all tests). " +
      "Accepts glob patterns (e.g. integ* would run both 'integ' and 'integration').",
    alias: "tn",
  }),
}

export type DevCommandArgs = typeof devArgs
export type DevCommandOpts = typeof devOpts

// TODO: allow limiting to certain modules and/or services
export class DevCommand extends Command<DevCommandArgs, DevCommandOpts> {
  name = "dev"
  help = "Starts the garden development console."
  protected = true

  // Currently it doesn't make sense to do file watching except in the CLI
  cliOnly = true

  streamEvents = true

  description = dedent`
    The Garden dev console is a combination of the \`build\`, \`deploy\` and \`test\` commands.
    It builds, deploys and tests all your modules and services, and re-builds, re-deploys and re-tests
    as you modify the code.

    Examples:

        garden dev
        garden dev --hot=foo-service,bar-service  # enable hot reloading for foo-service and bar-service
        garden dev --hot=*                        # enable hot reloading for all compatible services
        garden dev --skip-tests=                  # skip running any tests
        garden dev --name integ                   # run all tests with the name 'integ' in the project
        garden test --name integ*                 # run all tests with the name starting with 'integ' in the project
  `

  arguments = devArgs
  options = devOpts

  private garden?: Garden

  printHeader({ headerLog }) {
    printHeader(headerLog, "Dev", "keyboard")
  }

  async prepare({ log, footerLog }: PrepareParams<DevCommandArgs, DevCommandOpts>) {
    // print ANSI banner image
    const data = await readFile(ansiBannerPath)
    log.info(data.toString())

    log.info(chalk.gray.italic(`Good ${getGreetingTime()}! Let's get your environment wired up...`))
    log.info("")

    this.server = await startServer({ log: footerLog })

    return { persistent: true }
  }

  terminate() {
    this.garden?.events.emit("_exit", {})
  }

  async action({
    garden,
    isWorkflowStepCommand,
    log,
    footerLog,
    args,
    opts,
  }: CommandParams<DevCommandArgs, DevCommandOpts>): Promise<CommandResult> {
    this.garden = garden
    this.server?.setGarden(garden)

    const graph = await garden.getConfigGraph(log)
    if (!isWorkflowStepCommand) {
      emitStackGraphEvent(garden, graph)
    }
    const modules = graph.getModules()

    const skipTests = opts["skip-tests"]

    if (modules.length === 0) {
      footerLog && footerLog.setState({ msg: "" })
      log.info({ msg: "No enabled modules found in project." })
      log.info({ msg: "Aborting..." })
      return {}
    }

    const hotReloadServiceNames = await getHotReloadServiceNames(opts["hot-reload"], graph)
    if (hotReloadServiceNames.length > 0) {
      const errMsg = await validateHotReloadServiceNames(hotReloadServiceNames, graph)
      if (errMsg) {
        log.error({ msg: errMsg })
        return { result: {} }
      }
    }

    const services = graph.getServices({ names: args.services })

    const devModeServiceNames = services
      .map((s) => s.name)
      // Since dev mode is implicit when using this command, we consider explicitly enabling hot reloading to
      // take precedence over dev mode.
      .filter((name) => !hotReloadServiceNames.includes(name))

    const initialTasks = await getDevCommandInitialTasks({
      garden,
      log,
      graph,
      modules,
      services,
      devModeServiceNames,
      hotReloadServiceNames,
      skipTests,
    })

    const results = await processModules({
      garden,
      graph,
      log,
      footerLog,
      modules,
      watch: true,
      initialTasks,
      changeHandler: async (updatedGraph: ConfigGraph, module: GardenModule) => {
        return getDevCommandWatchTasks({
          garden,
          log,
          updatedGraph,
          module,
          servicesWatched: devModeServiceNames,
          devModeServiceNames,
          hotReloadServiceNames,
          testNames: opts["test-names"],
          skipTests,
        })
      },
    })

    return handleProcessResults(footerLog, "dev", results)
  }
}

export async function getDevCommandInitialTasks({
  garden,
  log,
  graph,
  modules,
  services,
  devModeServiceNames,
  hotReloadServiceNames,
  skipTests,
}: {
  garden: Garden
  log: LogEntry
  graph: ConfigGraph
  modules: GardenModule[]
  services: GardenService[]
  devModeServiceNames: string[]
  hotReloadServiceNames: string[]
  skipTests: boolean
}) {
  const moduleTasks = flatten(
    await Bluebird.map(modules, async (module) => {
      // Build the module (in case there are no tests, tasks or services here that need to be run)
      const buildTasks = await BuildTask.factory({
        garden,
        graph,
        log,
        module,
        force: false,
      })

      // Run all tests in module
      const testTasks = skipTests
        ? []
        : await getTestTasks({
            garden,
            graph,
            log,
            module,
            devModeServiceNames,
            hotReloadServiceNames,
            force: false,
            forceBuild: false,
          })

      return [...buildTasks, ...testTasks]
    })
  )

  const serviceTasks = services
    .filter((s) => !s.disabled)
    .map(
      (service) =>
        new DeployTask({
          garden,
          log,
          graph,
          service,
          force: false,
          forceBuild: false,
          fromWatch: false,
          devModeServiceNames,
          hotReloadServiceNames,
        })
    )

  return [...moduleTasks, ...serviceTasks]
}

export async function getDevCommandWatchTasks({
  garden,
  log,
  updatedGraph,
  module,
  servicesWatched,
  devModeServiceNames,
  hotReloadServiceNames,
  testNames,
  skipTests,
}: {
  garden: Garden
  log: LogEntry
  updatedGraph: ConfigGraph
  module: GardenModule
  servicesWatched: string[]
  devModeServiceNames: string[]
  hotReloadServiceNames: string[]
  testNames: string[] | undefined
  skipTests: boolean
}) {
  const tasks = await getModuleWatchTasks({
    garden,
    log,
    graph: updatedGraph,
    module,
    servicesWatched,
    devModeServiceNames,
    hotReloadServiceNames,
  })

  if (!skipTests) {
    const testModules: GardenModule[] = await updatedGraph.withDependantModules([module])
    tasks.push(
      ...flatten(
        await Bluebird.map(testModules, (m) =>
          getTestTasks({
            garden,
            log,
            module: m,
            graph: updatedGraph,
            filterNames: testNames,
            devModeServiceNames,
            hotReloadServiceNames,
          })
        )
      )
    )
  }

  return tasks
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
