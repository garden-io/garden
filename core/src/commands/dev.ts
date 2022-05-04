/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import deline = require("deline")
import dedent = require("dedent")
import chalk from "chalk"
import { readFile } from "fs-extra"
import moment = require("moment")
import { join } from "path"

import { getActionWatchTasks } from "../tasks/helpers"
import { Command, CommandResult, CommandParams, handleProcessResults, PrepareParams } from "./base"
import { STATIC_DIR } from "../constants"
import { processActions } from "../process"
import { TestTask } from "../tasks/test"
import { ConfigGraph } from "../graph/config-graph"
import { getMatchingServiceNames } from "./helpers"
import { startServer } from "../server/server"
import { DeployTask } from "../tasks/deploy"
import { Garden } from "../garden"
import { LogEntry } from "../logger/log-entry"
import { BooleanParameter, StringsParameter } from "../cli/params"
import { printHeader } from "../logger/util"
import { DeployAction } from "../actions/deploy"
import { Action } from "../actions/base"
import { getNames } from "../util/util"

// NOTE: This is all due to change in 0.13, just getting it to compile for now - JE

const ansiBannerPath = join(STATIC_DIR, "garden-banner-2.txt")

const devArgs = {
  deploys: new StringsParameter({
    help: `Specify which deploys to develop (defaults to all configured in project).`,
  }),
}

const devOpts = {
  "force": new BooleanParameter({ help: "Force re-deploy of deploy(s)/service(s)." }),
  "local-mode": new StringsParameter({
    help: deline`
    [EXPERIMENTAL] The name(s) of deploy action(s) to be started locally with local mode enabled.

    Use comma as a separator to specify multiple actions. Use * to deploy all compatible actions with local mode enabled. When this option is used, the command is run in persistent mode.

    This always takes the precedence over the dev mode if there are any conflicts, i.e. if the same services are passed to both \`--dev\` and \`--local\` options.
    `,
    alias: "local",
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
    It builds, deploys and tests everything in your project, and re-builds, re-deploys and re-tests
    as you modify the code.

    Examples:

        garden dev
        garden dev --local=service-1,service-2    # enable local mode for service-1 and service-2
        garden dev --local=*                      # enable local mode for all compatible deploys
        garden dev --skip-tests                   # skip running any tests
        garden dev --force                        # force redeploy of services when the command starts
        garden dev --name integ                   # run all tests with the name 'integ' in the project
        garden test --name integ*                 # run all tests with the name starting with 'integ' in the project
  `

  arguments = devArgs
  options = devOpts

  private garden?: Garden

  printHeader({ headerLog }) {
    printHeader(headerLog, "Dev", "keyboard")
  }

  isPersistent() {
    return true
  }

  async prepare({ headerLog, footerLog }: PrepareParams<DevCommandArgs, DevCommandOpts>) {
    // print ANSI banner image
    if (chalk.supportsColor && chalk.supportsColor.level > 2) {
      const data = await readFile(ansiBannerPath)
      headerLog.info(data.toString())
    }

    headerLog.info(chalk.gray.italic(`Good ${getGreetingTime()}! Let's get your environment wired up...`))
    headerLog.info("")

    this.server = await startServer({ log: footerLog })
  }

  terminate() {
    this.garden?.events.emit("_exit", {})
  }

  async action({
    garden,
    log,
    footerLog,
    args,
    opts,
  }: CommandParams<DevCommandArgs, DevCommandOpts>): Promise<CommandResult> {
    this.garden = garden
    this.server?.setGarden(garden)

    const graph = await garden.getConfigGraph({ log, emit: true })
    const actions = graph.getActions()

    const skipTests = opts["skip-tests"]
    const testNames = opts["test-names"]

    if (actions.length === 0) {
      footerLog && footerLog.setState({ msg: "" })
      log.info({ msg: "No enabled actions found in project." })
      log.info({ msg: "Aborting..." })
      return {}
    }

    const deploys = graph.getDeploys({ names: args.deploys })

    const localModeDeployNames = getMatchingServiceNames(opts["local-mode"], graph)

    const devModeDeployNames = deploys
      .map((s) => s.name)
      // Since dev mode is implicit when using this command, we consider explicitly enabling local mode to
      // take precedence over dev mode.
      .filter((name) => !localModeDeployNames.includes(name))

    const initialTasks = await getDevCommandInitialTasks({
      garden,
      log,
      graph,
      deploys,
      devModeDeployNames,
      localModeDeployNames,
      skipTests,
      testNames,
      forceDeploy: opts.force,
    })

    const results = await processActions({
      garden,
      graph,
      log,
      footerLog,
      actions,
      watch: true,
      initialTasks,
      skipWatch: [], // TODO-G2: need to work out what to ignore, but here we don't know what's actually in dev mode
      changeHandler: async (updatedGraph: ConfigGraph, action: Action) => {
        return getDevCommandWatchTasks({
          garden,
          log,
          updatedGraph,
          updatedAction: action,
          devModeDeployNames,
          localModeDeployNames,
          testNames,
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
  deploys,
  devModeDeployNames,
  localModeDeployNames,
  skipTests,
  testNames,
  forceDeploy,
}: {
  garden: Garden
  log: LogEntry
  graph: ConfigGraph
  deploys: DeployAction[]
  devModeDeployNames: string[]
  localModeDeployNames: string[]
  skipTests: boolean
  testNames?: string[]
  forceDeploy: boolean
}) {
  const testTasks = skipTests
    ? []
    : graph.getTests({ names: testNames }).map(
        (action) =>
          new TestTask({
            garden,
            log,
            graph,
            action,
            force: false,
            forceBuild: false,
            fromWatch: false,
            devModeDeployNames,
            localModeDeployNames,
          })
      )

  const deployTasks = deploys
    .filter((s) => !s.isDisabled())
    .map(
      (action) =>
        new DeployTask({
          garden,
          log,
          graph,
          action,
          force: forceDeploy,
          forceBuild: false,
          fromWatch: false,
          devModeDeployNames,
          localModeDeployNames,
        })
    )

  return [...testTasks, ...deployTasks]
}

export async function getDevCommandWatchTasks({
  garden,
  log,
  updatedGraph,
  updatedAction,
  devModeDeployNames,
  localModeDeployNames,
  testNames,
  skipTests,
}: {
  garden: Garden
  log: LogEntry
  updatedGraph: ConfigGraph
  updatedAction: Action
  devModeDeployNames: string[]
  localModeDeployNames: string[]
  testNames: string[] | undefined
  skipTests: boolean
}) {
  const testsWatched = skipTests ? [] : testNames || getNames(updatedGraph.getTests())

  const tasks = await getActionWatchTasks({
    garden,
    log,
    graph: updatedGraph,
    updatedAction,
    deploysWatched: devModeDeployNames,
    devModeDeployNames,
    localModeDeployNames,
    testsWatched,
  })

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
