/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
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
import {
  Command,
  CommandResult,
  CommandParams,
  StringsParameter,
  handleTaskResults,
  PrepareParams,
  BooleanParameter,
} from "./base"
import { STATIC_DIR } from "../constants"
import { processModules } from "../process"
import { Module } from "../types/module"
import { getTestTasks } from "../tasks/test"
import { ConfigGraph } from "../config-graph"
import { getHotReloadServiceNames, validateHotReloadServiceNames } from "./helpers"
import { GardenServer, startServer } from "../server/server"
import { BuildTask } from "../tasks/build"
import { DeployTask } from "../tasks/deploy"

const ansiBannerPath = join(STATIC_DIR, "garden-banner-2.txt")

const devArgs = {}

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

  options = devOpts

  private server: GardenServer

  async prepare({ log, footerLog }: PrepareParams<DevCommandArgs, DevCommandOpts>) {
    // print ANSI banner image
    const data = await readFile(ansiBannerPath)
    log.info(data.toString())

    log.info(chalk.gray.italic(`Good ${getGreetingTime()}! Let's get your environment wired up...\n`))

    this.server = await startServer(footerLog)

    return { persistent: true }
  }

  async action({
    garden,
    log,
    footerLog,
    opts,
  }: CommandParams<DevCommandArgs, DevCommandOpts>): Promise<CommandResult> {
    this.server.setGarden(garden)

    const graph = await garden.getConfigGraph(log)
    const modules = await graph.getModules()

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

    const initialTasks = flatten(
      await Bluebird.map(modules, async (module) => {
        // Build the module (in case there are no tests, tasks or services here that need to be run)
        const buildTasks = await BuildTask.factory({
          garden,
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
              force: false,
              forceBuild: false,
            })

        // Deploy all enabled services in module
        const services = await graph.getServices({ names: module.serviceNames, includeDisabled: true })
        const deployTasks = services
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
                hotReloadServiceNames,
              })
          )

        return [...buildTasks, ...testTasks, ...deployTasks]
      })
    )

    const results = await processModules({
      garden,
      graph,
      log,
      footerLog,
      modules,
      watch: true,
      initialTasks,
      changeHandler: async (updatedGraph: ConfigGraph, module: Module) => {
        const tasks = await getModuleWatchTasks({
          garden,
          log,
          graph: updatedGraph,
          module,
          hotReloadServiceNames,
        })

        if (!skipTests) {
          const filterNames = opts["test-names"]
          const testModules: Module[] = await updatedGraph.withDependantModules([module])
          tasks.push(
            ...flatten(
              await Bluebird.map(testModules, (m) =>
                getTestTasks({
                  garden,
                  log,
                  module: m,
                  graph: updatedGraph,
                  filterNames,
                  hotReloadServiceNames,
                })
              )
            )
          )
        }

        return tasks
      },
    })

    return handleTaskResults(footerLog, "dev", results)
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
