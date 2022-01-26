/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dotenv = require("dotenv")
import { intersection, sortBy } from "lodash"
import { resolve, join } from "path"
import chalk from "chalk"
import { pathExists } from "fs-extra"
import { getBuiltinCommands } from "../commands/commands"
import { shutdown, sleep, getPackageVersion, uuidv4, registerCleanupFunction } from "../util/util"
import { Command, CommandResult, CommandGroup, BuiltinArgs } from "../commands/base"
import { PluginError, toGardenError, GardenBaseError } from "../exceptions"
import { Garden, GardenOpts, DummyGarden } from "../garden"
import { getLogger, Logger, LoggerType, LogLevel, parseLogLevel } from "../logger/logger"
import { FileWriter, FileWriterConfig } from "../logger/writers/file-writer"

import {
  checkForUpdates,
  checkForStaticDir,
  renderCommands,
  processCliArgs,
  pickCommand,
  parseCliArgs,
  optionsWithAliasValues,
  getCliStyles,
} from "./helpers"
import { Parameters, globalOptions, OUTPUT_RENDERERS, GlobalOptions, ParameterValues } from "./params"
import {
  defaultEnvironments,
  ProjectConfig,
  defaultNamespace,
  parseEnvironment,
  ProjectResource,
} from "../config/project"
import { ERROR_LOG_FILENAME, DEFAULT_API_VERSION, DEFAULT_GARDEN_DIR_NAME, LOGS_DIR_NAME } from "../constants"
import { generateBasicDebugInfoReport } from "../commands/get/get-debug-info"
import { AnalyticsHandler } from "../analytics/analytics"
import { BufferedEventStream, ConnectBufferedEventStreamParams } from "../cloud/buffered-event-stream"
import { defaultDotIgnoreFiles } from "../util/fs"
import type { GardenProcess } from "../db/entities/garden-process"
import { DashboardEventStream } from "../server/dashboard-event-stream"
import { GardenPluginReference } from "../types/plugin/plugin"
import { renderError } from "../logger/renderers"
import { CloudApi } from "../cloud/api"
import { findProjectConfig } from "../config/base"
import { pMemoizeDecorator } from "../lib/p-memoize"
import { getCustomCommands } from "../commands/custom"
import { Profile } from "../util/profiling"
import { prepareDebugLogfiles } from "./debug-logs"
import { LogEntry } from "../logger/log-entry"
import { JsonFileWriter } from "../logger/writers/json-file-writer"

export async function makeDummyGarden(root: string, gardenOpts: GardenOpts) {
  const environments = gardenOpts.environmentName
    ? [{ name: parseEnvironment(gardenOpts.environmentName).environment, defaultNamespace, variables: {} }]
    : defaultEnvironments

  const config: ProjectConfig = {
    path: root,
    apiVersion: DEFAULT_API_VERSION,
    kind: "Project",
    name: "no-project",
    defaultEnvironment: "",
    dotIgnoreFiles: defaultDotIgnoreFiles,
    environments,
    providers: [],
    variables: {},
  }
  gardenOpts.config = config

  return DummyGarden.factory(root, { noEnterprise: true, ...gardenOpts })
}

export interface RunOutput {
  argv: any
  code: number
  errors: (GardenBaseError | Error)[]
  result: any
  // Mainly used for testing
  consoleOutput?: string
}

@Profile()
export class GardenCli {
  private commands: { [key: string]: Command } = {}
  private fileWritersInitialized: boolean = false
  private plugins: GardenPluginReference[]
  private bufferedEventStream: BufferedEventStream | undefined
  private sessionFinished = false
  public processRecord: GardenProcess

  constructor({ plugins }: { plugins?: GardenPluginReference[] } = {}) {
    this.plugins = plugins || []

    const commands = sortBy(getBuiltinCommands(), (c) => c.name)
    commands.forEach((command) => this.addCommand(command))
  }

  async renderHelp(workingDir: string) {
    const cliStyles = getCliStyles()

    const commands = Object.values(this.commands)
      .sort()
      .filter((cmd) => cmd.getPath().length === 1)

    let msg = `
${cliStyles.heading("USAGE")}
  garden ${cliStyles.commandPlaceholder()} ${cliStyles.optionsPlaceholder()}

${cliStyles.heading("COMMANDS")}
${renderCommands(commands)}
    `

    const customCommands = await this.getCustomCommands(workingDir)

    if (customCommands.length > 0) {
      msg += `\n${cliStyles.heading("CUSTOM COMMANDS")}\n${renderCommands(customCommands)}`
    }

    return msg
  }

  private async initFileWriters({
    logger,
    log,
    gardenDirPath,
    commandFullName,
  }: {
    logger: Logger
    log: LogEntry
    gardenDirPath: string
    commandFullName: string
  }) {
    if (this.fileWritersInitialized) {
      return
    }
    const { debugLogfileName, jsonLogfileName } = await prepareDebugLogfiles(
      log,
      join(gardenDirPath, LOGS_DIR_NAME),
      commandFullName
    )
    const logConfigs: FileWriterConfig[] = [
      {
        logFilePath: join(gardenDirPath, LOGS_DIR_NAME, debugLogfileName),
        truncatePrevious: true,
        level: LogLevel.debug,
      },
      {
        logFilePath: join(gardenDirPath, LOGS_DIR_NAME, jsonLogfileName),
        truncatePrevious: true,
        level: LogLevel.silly,
        json: true,
      },
      {
        logFilePath: join(gardenDirPath, ERROR_LOG_FILENAME),
        truncatePrevious: true,
        level: LogLevel.error,
      },
      {
        logFilePath: join(gardenDirPath, LOGS_DIR_NAME, ERROR_LOG_FILENAME),
        level: LogLevel.error,
      },
      {
        logFilePath: join(gardenDirPath, LOGS_DIR_NAME, "development.log"),
        level: logger.level,
      },
    ]
    for (const config of logConfigs) {
      logger.addWriter(await (config.json ? JsonFileWriter : FileWriter).factory(config))
    }
    this.fileWritersInitialized = true
  }

  addCommand(command: Command): void {
    const fullName = command.getFullName()

    if (this.commands[fullName]) {
      // For now we don't allow multiple definitions of the same command. We may want to revisit this later.
      throw new PluginError(`Multiple definitions of command "${fullName}"`, {})
    }

    this.commands[fullName] = command

    const { options = {} } = command

    const optKeys = Object.keys(options)
    const globalKeys = Object.keys(globalOptions)
    const dupKeys: string[] = intersection(optKeys, globalKeys)

    if (dupKeys.length > 0) {
      throw new PluginError(`Global option(s) ${dupKeys.join(" ")} cannot be redefined`, {})
    }
  }

  async getGarden(workingDir: string, opts: GardenOpts) {
    return Garden.factory(workingDir, opts)
  }

  async runCommand<A extends Parameters, O extends Parameters>({
    command,
    parsedArgs,
    parsedOpts,
    processRecord,
    workingDir,
  }: {
    command: Command<A, O>
    parsedArgs: BuiltinArgs & ParameterValues<A>
    parsedOpts: ParameterValues<GlobalOptions & O>
    processRecord?: GardenProcess
    workingDir: string
  }) {
    const {
      "logger-type": loggerTypeOpt,
      "log-level": logLevel,
      "show-timestamps": showTimestamps,
      emoji,
      "env": environmentName,
      silent,
      output,
      "force-refresh": forceRefresh,
      "var": cliVars,
      "disable-port-forwards": disablePortForwards,
    } = parsedOpts

    // Parse command line --var input
    const parsedCliVars = cliVars ? dotenv.parse(cliVars.join("\n")) : {}

    // Init logger
    const level = parseLogLevel(logLevel)
    let loggerType = <LoggerType>loggerTypeOpt || command.getLoggerType({ opts: parsedOpts, args: parsedArgs })

    if (silent || output) {
      loggerType = "quiet"
    }

    const logger = Logger.initialize({ level, type: loggerType, useEmoji: emoji, showTimestamps })

    // Currently we initialise empty placeholder entries and pass those to the
    // framework as opposed to the logger itself. This is to give better control over where on
    // the screen the logs are printed.
    const headerLog = logger.placeholder()
    const log = logger.placeholder()
    const footerLog = logger.placeholder()

    command.printHeader({ headerLog, args: parsedArgs, opts: parsedOpts })

    // Init enterprise API
    let cloudApi: CloudApi | null = null
    if (!command.noProject) {
      cloudApi = await CloudApi.factory({ log, currentDirectory: workingDir })
    }

    // Init event & log streaming.
    const sessionId = uuidv4()
    this.bufferedEventStream = new BufferedEventStream({
      log,
      cloudApi: cloudApi || undefined,
      sessionId,
    })

    registerCleanupFunction("stream-session-cancelled-event", () => {
      if (!this.sessionFinished) {
        this.bufferedEventStream?.streamEvent("sessionCancelled", {})
        this.bufferedEventStream?.flushAll()
      }
    })

    const dashboardEventStream = new DashboardEventStream({ log, sessionId })

    const commandInfo = {
      name: command.getFullName(),
      args: parsedArgs,
      opts: optionsWithAliasValues(command, parsedOpts),
    }

    const contextOpts: GardenOpts = {
      commandInfo,
      disablePortForwards,
      environmentName,
      log,
      sessionId,
      forceRefresh,
      variables: parsedCliVars,
      plugins: this.plugins,
      cloudApi: cloudApi || undefined,
    }

    let garden: Garden
    let result: CommandResult<any> = {}
    let analytics: AnalyticsHandler

    const prepareParams = {
      log,
      headerLog,
      footerLog,
      args: parsedArgs,
      opts: parsedOpts,
    }

    const persistent = command.isPersistent(prepareParams)

    await command.prepare(prepareParams)

    contextOpts.persistent = persistent
    const { streamEvents, streamLogEntries } = command
    // Print header log before we know the namespace to prevent content from
    // jumping.
    // TODO: Link to Cloud namespace page here.
    const nsLog = headerLog.info("")

    do {
      try {
        if (command.noProject) {
          garden = await makeDummyGarden(workingDir, contextOpts)
        } else {
          garden = await this.getGarden(workingDir, contextOpts)

          const envDescription = `${garden.namespace}.${garden.environmentName}`
          nsLog.setState(`${chalk.gray(`Using environment ${chalk.white.bold(envDescription)}\n`)}`)

          if (processRecord) {
            // Update the db record for the process
            await processRecord.setCommand({
              command: command.name,
              sessionId: garden.sessionId,
              persistent,
              serverHost: command.server?.port ? `http://localhost:${command.server.port}` : null,
              serverAuthKey: command.server?.authKey || null,
              projectRoot: garden.projectRoot,
              projectName: garden.projectName,
              environmentName: garden.environmentName,
              namespace: garden.namespace,
            })
          }

          // Connect the dashboard event streamer (making sure it doesn't stream to the local server)
          const commandServerUrl = command.server?.getUrl() || undefined
          dashboardEventStream.connect({ garden, ignoreHost: commandServerUrl, streamEvents, streamLogEntries })
          const runningServers = await dashboardEventStream.updateTargets()

          if (cloudApi && !cloudApi.sessionRegistered && command.streamEvents) {
            // Note: If a config change during a watch-mode command's execution results in the resolved environment
            // and/or namespace name changing, we don't change the session ID, environment ID or namespace ID used when
            // streaming events.
            await cloudApi.registerSession({
              sessionId,
              commandInfo,
              localServerPort: command.server?.port,
              environment: garden.environmentName,
              namespace: garden.namespace,
            })
          }

          if (persistent && command.server) {
            // If there is an explicit `garden dashboard` process running for the current project+env, and a server
            // is started in this Command, we show the URL to the external dashboard. Otherwise the built-in one.

            // Note: Lazy-loading for startup performance
            const { GardenProcess: GP } = require("../db/entities/garden-process")

            const dashboardProcess = GP.getDashboardProcess(runningServers, {
              projectRoot: garden.projectRoot,
              projectName: garden.projectName,
              environmentName: garden.environmentName,
              namespace: garden.namespace,
            })

            command.server.showUrl(dashboardProcess?.serverHost || undefined)
          }
        }

        if (cloudApi) {
          log.silly(`Connecting Garden instance to GE BufferedEventStream`)
          const connectParams: ConnectBufferedEventStreamParams = {
            garden,
            streamEvents,
            streamLogEntries,
            targets: [
              {
                enterprise: true,
              },
            ],
          }
          this.bufferedEventStream.connect(connectParams)
          if (streamEvents) {
            this.bufferedEventStream.streamEvent("commandInfo", commandInfo)
          }
        }

        // Register log file writers. We need to do this after the Garden class is initialised because
        // the file writers depend on the project root.
        await this.initFileWriters({
          logger,
          log,
          gardenDirPath: garden.gardenDirPath,
          commandFullName: command.getFullName(),
        })
        analytics = await AnalyticsHandler.init(garden, log)
        analytics.trackCommand(command.getFullName())

        // tslint:disable-next-line: no-floating-promises
        checkForUpdates(garden.globalConfigStore, headerLog)

        await checkForStaticDir()

        // Check if the command is protected and ask for confirmation to proceed if production flag is "true".
        if (await command.isAllowedToRun(garden, log, parsedOpts)) {
          // TODO: enforce that commands always output DeepPrimitiveMap

          result = await command.action({
            garden,
            cli: this,
            log,
            footerLog,
            headerLog,
            args: parsedArgs,
            opts: parsedOpts,
          })
        } else {
          // The command is protected and the user decided to not continue with the exectution.
          log.setState("\nCommand aborted.")
          result = {}
        }
        await garden.close()
      } catch (err) {
        // Generate a basic report in case Garden.factory(...) fails and command is "get debug-info".
        // Other exceptions are handled within the implementation of "get debug-info".
        if (command.name === "debug-info") {
          // Use default Garden dir name as fallback since Garden class hasn't been initialised
          await generateBasicDebugInfoReport(
            workingDir,
            join(workingDir, DEFAULT_GARDEN_DIR_NAME),
            log,
            parsedOpts.format
          )
        }
        throw err
      } finally {
        if (!result.restartRequired) {
          await dashboardEventStream.close()
          await command.server?.close()
          cloudApi?.close()
        }
      }
    } while (result.restartRequired)

    return { result, analytics }
  }

  async run({
    args,
    exitOnError,
    processRecord,
    cwd,
  }: {
    args: string[]
    exitOnError: boolean
    processRecord?: GardenProcess
    cwd?: string
  }): Promise<RunOutput> {
    let argv = parseCliArgs({ stringArgs: args, cli: true })

    let logger: Logger
    const errors: (GardenBaseError | Error)[] = []

    // Note: Circumvents an issue where the process exits before the output is fully flushed.
    // Needed for output renderers and Winston (see: https://github.com/winstonjs/winston/issues/228)
    const waitForOutputFlush = () => sleep(100)

    async function done(abortCode: number, consoleOutput: string, result: any = {}) {
      if (exitOnError) {
        logger && logger.stop()
        // tslint:disable-next-line: no-console
        console.log(consoleOutput)
        await waitForOutputFlush()
        await shutdown(abortCode)
      } else {
        await waitForOutputFlush()
      }

      return { argv, code: abortCode, errors, result, consoleOutput }
    }

    if (argv.v || argv.version || argv._[0] === "version") {
      return done(0, getPackageVersion())
    }

    const workingDir = resolve(cwd || process.cwd(), argv.root || "")

    if (!(await pathExists(workingDir))) {
      return done(1, chalk.red(`Could not find specified root path (${argv.root})`))
    }

    let projectConfig: ProjectResource | undefined

    // First look for native Garden commands
    let { command, matchedPath } = pickCommand(Object.values(this.commands), argv._)

    // Load custom commands from current project (if applicable) and see if any match the arguments
    if (!command) {
      projectConfig = await this.getProjectConfig(workingDir)

      if (projectConfig) {
        const customCommands = await this.getCustomCommands(workingDir)
        const picked = pickCommand(customCommands, argv._)
        command = picked.command
        matchedPath = picked.matchedPath
      }
    }

    if (!command) {
      const exitCode = argv.h || argv.help || argv._[0] === "help" ? 0 : 1
      return done(exitCode, await this.renderHelp(workingDir))
    }

    if (command instanceof CommandGroup) {
      return done(0, command.renderHelp())
    }

    // Parse the arguments again with the Command set, to fully validate, and to ensure boolean options are
    // handled correctly
    argv = parseCliArgs({ stringArgs: args, command, cli: true })

    // Slice command name from the positional args
    argv._ = argv._.slice(command.getPath().length)

    // handle -h/--help
    if (argv.h || argv.help) {
      if (command) {
        // Show help for command
        return done(0, command.renderHelp())
      } else {
        // Show general help text
        return done(0, await this.renderHelp(workingDir))
      }
    }

    let parsedArgs: BuiltinArgs & ParameterValues<any>
    let parsedOpts: ParameterValues<any>

    try {
      const parseResults = processCliArgs({ rawArgs: args, parsedArgs: argv, command, matchedPath, cli: true })
      parsedArgs = parseResults.args
      parsedOpts = parseResults.opts
    } catch (err) {
      errors.push(...(err.detail?.errors || []).map(toGardenError))
      return done(1, err.message + "\n" + command.renderHelp())
    }

    let commandResult: CommandResult<any> | undefined = undefined
    let analytics: AnalyticsHandler | undefined = undefined

    if (!processRecord) {
      processRecord = this.processRecord
    }

    if (!processRecord) {
      // Note: Lazy-loading for startup performance
      const { ensureConnected } = require("../db/connection")
      await ensureConnected()
      const { GardenProcess: GP } = require("../db/entities/garden-process")
      processRecord = await GP.register(args)
    }

    this.processRecord = processRecord!

    try {
      const runResults = await this.runCommand({ command, parsedArgs, parsedOpts, processRecord, workingDir })
      commandResult = runResults.result
      analytics = runResults.analytics
    } catch (err) {
      commandResult = { errors: [err] }
    }

    errors.push(...(commandResult.errors || []))

    // Flushes the Analytics events queue in case there are some remaining events.
    if (analytics) {
      await analytics.flush()
    }

    const gardenErrors: GardenBaseError[] = errors.map(toGardenError)

    // --output option set
    if (argv.output) {
      const renderer = OUTPUT_RENDERERS[argv.output]!

      if (gardenErrors.length > 0 || (commandResult.exitCode && commandResult.exitCode !== 0)) {
        return done(
          commandResult.exitCode || 1,
          renderer({ success: false, errors: gardenErrors }),
          commandResult?.result
        )
      } else {
        return done(0, renderer({ success: true, ...commandResult }), commandResult?.result)
      }
    }

    // Logger might not have been initialised if process exits early
    try {
      logger = getLogger()
    } catch (_) {
      logger = Logger.initialize({
        level: LogLevel.info,
        type: "basic",
      })
    }

    let code = 0
    if (gardenErrors.length > 0) {
      if (!command.skipCliErrorSummary) {
        for (const error of gardenErrors) {
          const entry = logger.error({
            msg: error.message,
            error,
          })
          // Output error details to console when log level is silly
          logger.silly({
            msg: renderError(entry),
          })
        }
      }

      if (logger.getWriters().find((w) => w instanceof FileWriter)) {
        logger.info(`\nSee .garden/${ERROR_LOG_FILENAME} for detailed error message`)
        await waitForOutputFlush()
      }

      code = commandResult.exitCode || 1
    }
    if (exitOnError) {
      logger.stop()
      logger.cleanup()
    }

    if (this.bufferedEventStream) {
      if (code === 0) {
        this.bufferedEventStream.streamEvent("sessionCompleted", {})
      } else {
        this.bufferedEventStream.streamEvent("sessionFailed", {})
      }
      await this.bufferedEventStream.close()
      this.sessionFinished = true
    }

    return { argv, code, errors, result: commandResult?.result }
  }

  @pMemoizeDecorator()
  private async getProjectConfig(workingDir: string): Promise<ProjectResource | undefined> {
    return findProjectConfig(workingDir)
  }

  @pMemoizeDecorator()
  private async getCustomCommands(workingDir: string): Promise<Command[]> {
    const projectConfig = await this.getProjectConfig(workingDir)
    const projectRoot = projectConfig?.path

    if (!projectRoot) {
      return []
    }

    return await getCustomCommands(Object.values(this.commands), projectRoot)
  }
}
