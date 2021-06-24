/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import WebSocket from "ws"
import Bluebird from "bluebird"
import deline = require("deline")
import dedent = require("dedent")
import chalk from "chalk"
import { readFile } from "fs-extra"
import { flatten, isEmpty, omit } from "lodash"
import moment = require("moment")
import { join } from "path"

import { getModuleWatchTasks } from "../tasks/helpers"
import {
  Command,
  CommandResult,
  CommandParams,
  handleProcessResults,
  PrepareParams,
  SessionSettings,
  prepareSessionSettings,
} from "./base"
import { gardenEnv, STATIC_DIR } from "../constants"
import { processModules } from "../process"
import { GardenModule } from "../types/module"
import { getTestTasks } from "../tasks/test"
import { ConfigGraph } from "../config-graph"
import {
  getDevModeModules,
  getDevModeServiceNames,
  getHotReloadServiceNames,
  validateHotReloadServiceNames,
} from "./helpers"
import { startServer } from "../server/server"
import { BuildTask } from "../tasks/build"
import { DeployTask } from "../tasks/deploy"
import { Garden } from "../garden"
import { LogEntry } from "../logger/log-entry"
import { StringsParameter, BooleanParameter } from "../cli/params"
import { printHeader } from "../logger/util"

const ansiBannerPath = join(STATIC_DIR, "garden-banner-2.txt")

const devArgs = {
  services: new StringsParameter({
    help: `Specify which services to develop (defaults to all configured services).`,
  }),
}

const devOpts = {
  "force": new BooleanParameter({ help: "Force redeploy of service(s)." }),
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

  async prepare({ headerLog, footerLog, args, opts, cloudApi }: PrepareParams<DevCommandArgs, DevCommandOpts>) {
    // print ANSI banner image
    if (chalk.supportsColor && chalk.supportsColor.level > 2) {
      const data = await readFile(ansiBannerPath)
      headerLog.info(data.toString())
    }

    headerLog.info(chalk.gray.italic(`Good ${getGreetingTime()}! Let's get your environment wired up...`))
    headerLog.info("")

    if (cloudApi) {
      cloudApi.startWebSocketClient()
    }

    this.server = await startServer({ log: footerLog })
    const sessionSettings = prepareSessionSettings({
      deployServiceNames: args.services || ["*"],
      testModuleNames: opts["skip-tests"] ? [] : ["*"],
      testConfigNames: opts["test-names"] || ["*"],
      devModeServiceNames: args.services || ["*"],
      hotReloadServiceNames: opts["hot-reload"] || [],
    })

    return { persistent: true, sessionSettings }
  }

  terminate() {
    this.garden?.events.emit("_exit", {})
  }

  async action({
    garden,
    log,
    footerLog,
    sessionSettings,
  }: CommandParams<DevCommandArgs, DevCommandOpts>): Promise<CommandResult> {
    this.garden = garden
    this.server?.setGarden(garden)

    const settings = <SessionSettings>sessionSettings

    if (sessionSettings) {
      garden.events.emit("sessionSettings", sessionSettings)
    }

    const graph = await garden.getConfigGraph({ log, emit: true })
    const modules = graph.getModules()

    if (modules.length === 0) {
      footerLog && footerLog.setState({ msg: "" })
      log.info({ msg: "No enabled modules found in project." })
      log.info({ msg: "Aborting..." })
      return {}
    }

    const hotReloadServiceNames = getHotReloadServiceNames(settings.hotReloadServiceNames, graph)
    if (hotReloadServiceNames.length > 0) {
      const errMsg = validateHotReloadServiceNames(hotReloadServiceNames, graph)
      if (errMsg) {
        log.error({ msg: errMsg })
        return { result: {} }
      }
    }

    await wsConnect(garden)

    const initialTasks = await getDevCommandInitialTasks({
      garden,
      log,
      graph,
      sessionSettings: settings,
    })

    const results = await processModules({
      garden,
      graph,
      log,
      footerLog,
      modules,
      watch: true,
      initialTasks,
      skipWatchModules: getDevModeModules(getDevModeServiceNames(settings.devModeServiceNames, graph), graph),
      sessionSettings: settings,
      changeHandler: async (updatedGraph: ConfigGraph, module: GardenModule) => {
        return getDevCommandWatchTasks({
          garden,
          log,
          updatedGraph,
          module,
          sessionSettings: settings,
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
  sessionSettings,
}: {
  garden: Garden
  log: LogEntry
  graph: ConfigGraph
  sessionSettings: SessionSettings
}) {
  const { servicesToDeploy, hotReloadServiceNames, devModeServiceNames, testNames } = applySessionSettings(
    graph,
    sessionSettings
  )
  const modules = graph.getModules()

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
      const testTasks = moduleShouldBeTested(sessionSettings, module)
        ? await getTestTasks({
            garden,
            graph,
            log,
            module,
            devModeServiceNames,
            hotReloadServiceNames,
            filterNames: testNames,
            force: false,
            forceBuild: false,
          })
        : []

      return [...buildTasks, ...testTasks]
    })
  )

  const serviceTasks = servicesToDeploy
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
  sessionSettings,
}: {
  garden: Garden
  log: LogEntry
  updatedGraph: ConfigGraph
  module: GardenModule
  sessionSettings: SessionSettings
}) {
  const { servicesToDeploy, hotReloadServiceNames, devModeServiceNames, testNames } = applySessionSettings(
    updatedGraph,
    sessionSettings
  )
  const tasks = await getModuleWatchTasks({
    garden,
    log,
    graph: updatedGraph,
    module,
    servicesWatched: servicesToDeploy.map((s) => s.name),
    devModeServiceNames,
    hotReloadServiceNames,
  })

  const testModules: GardenModule[] = updatedGraph.withDependantModules([module])
  tasks.push(
    ...flatten(
      await Bluebird.map(testModules, (m) =>
        moduleShouldBeTested(sessionSettings, m)
          ? getTestTasks({
              garden,
              log,
              module: m,
              graph: updatedGraph,
              filterNames: testNames,
              devModeServiceNames,
              hotReloadServiceNames,
            })
          : []
      )
    )
  )

  return tasks
}

export function applySessionSettings(graph: ConfigGraph, sessionSettings: SessionSettings) {
  const hotReloadServiceNames = getHotReloadServiceNames(sessionSettings.hotReloadServiceNames, graph)

  const serviceNames = sessionSettings.deployServiceNames
  const allServices = graph.getServices()
  const servicesToDeploy = serviceNames[0] === "*" ? allServices : graph.getServices({ names: serviceNames })

  let devModeServiceNames = getDevModeServiceNames(sessionSettings.devModeServiceNames, graph)

  devModeServiceNames = servicesToDeploy
    .map((s) => s.name)
    // Since dev mode is implicit when using this command, we consider explicitly enabling hot reloading to
    // take precedence over dev mode.
    .filter((name) => devModeServiceNames.includes(name) && !hotReloadServiceNames.includes(name))
  const testNames = isEmpty(sessionSettings.testConfigNames) ? undefined : sessionSettings.testConfigNames

  return { servicesToDeploy, hotReloadServiceNames, devModeServiceNames, testNames }
}

function moduleShouldBeTested(sessionSettings: SessionSettings, module: GardenModule): boolean {
  const testModuleNames = sessionSettings.testModuleNames
  return testModuleNames[0] === "*" || !!testModuleNames.find((n) => n === module.name)
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

async function wsConnect(garden: Garden) {
  const validEvents = ["deployRequested", "buildRequested", "testRequested"]
  const authToken = gardenEnv.GARDEN_AUTH_TOKEN
  const tokenParam = !!gardenEnv.GARDEN_AUTH_TOKEN ? "ciToken" : "accessToken"
  const wsUrl = `wss://ths.dev.enterprise.garden.io/ws/cli?${tokenParam}=${authToken}&sessionId=${garden.sessionId}`
  console.log(`will connect ws: url ${wsUrl}`)
  // if (garden.enterpriseApi) {
  const ws = new WebSocket(wsUrl)
  ws.on("open", () => {
    // console.log("ws open")
  })
  ws.on("close", () => {
    // console.log("ws closed")
  })
  ws.on("upgrade", () => {
    // console.log("ws upgraded")
  })
  ws.on("ping", () => {
    ws.pong()
  })
  ws.on("error", (err) => {
    console.log("ws err", err)
    console.log("ws err string", JSON.stringify(err))
  })
  ws.on("message", (msg) => {
    const parsed = JSON.parse(msg.toString())
    console.log(parsed)
    if (validEvents.includes(parsed.event)) {
      const payload = omit(parsed, "event")
      garden.events.emit(parsed.event, payload)
    }
  })

  garden.events.onAny((name, payload) => {
    if (ws.readyState === 1) {
      const content = { type: "event", body: { name, payload } }
      // console.log(`sending event via ws: ${JSON.stringify(content, null, 2)}`)
      ws.send(JSON.stringify(content))
    }
  })

  // setInterval(() => {
  //   ws.send(JSON.stringify({ type: "event", name: "foo", message: "ello ello" }))
  // }, 1000)
  // }
}
