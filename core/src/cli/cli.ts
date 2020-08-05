/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dotenv = require("dotenv")
import { intersection, sortBy } from "lodash"
import { resolve, join } from "path"
import { getAllCommands } from "../commands/commands"
import { shutdown, sleep, getPackageVersion, uuidv4 } from "../util/util"
import { Command, CommandResult, CommandGroup } from "../commands/base"
import { GardenError, PluginError, toGardenError, GardenBaseError } from "../exceptions"
import { Garden, GardenOpts, DummyGarden } from "../garden"
import { getLogger, Logger, LoggerType, getWriterInstance, parseLogLevel } from "../logger/logger"
import { LogLevel } from "../logger/log-node"
import { BasicTerminalWriter } from "../logger/writers/basic-terminal-writer"
import { FileWriter, FileWriterConfig } from "../logger/writers/file-writer"

import {
  cliStyles,
  checkForUpdates,
  checkForStaticDir,
  renderCommands,
  processCliArgs,
  pickCommand,
  parseCliArgs,
} from "./helpers"
import { Parameters, globalOptions, OUTPUT_RENDERERS, GlobalOptions, ParameterValues } from "./params"
import { defaultEnvironments, ProjectConfig, defaultNamespace } from "../config/project"
import {
  ERROR_LOG_FILENAME,
  DEFAULT_API_VERSION,
  DEFAULT_GARDEN_DIR_NAME,
  LOGS_DIR_NAME,
  gardenEnv,
} from "../constants"
import { generateBasicDebugInfoReport } from "../commands/get/get-debug-info"
import { AnalyticsHandler } from "../analytics/analytics"
import { defaultDotIgnoreFiles } from "../util/fs"
import { renderError } from "../logger/renderers"
import { getDefaultProfiler } from "../util/profiling"
import { BufferedEventStream } from "../enterprise/buffered-event-stream"
import { makeEnterpriseContext } from "../enterprise/init"

export async function makeDummyGarden(root: string, gardenOpts: GardenOpts = {}) {
  const environments = gardenOpts.environmentName
    ? [{ name: gardenOpts.environmentName, defaultNamespace, variables: {} }]
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

  return DummyGarden.factory(root, { ...gardenOpts, noEnterprise: true })
}

function initLogger({ level, loggerType, emoji }: { level: LogLevel; loggerType: LoggerType; emoji: boolean }) {
  const writer = getWriterInstance(loggerType, level)
  const writers = writer ? [writer] : undefined
  return Logger.initialize({ level, writers, useEmoji: emoji })
}

export interface RunOutput {
  argv: any
  code: number
  errors: (GardenError | Error)[]
  result: any
  // Mainly used for testing
  consoleOutput?: string
}

export class GardenCli {
  private commands: { [key: string]: Command } = {}
  private fileWritersInitialized: boolean = false

  constructor() {
    const commands = sortBy(getAllCommands(), (c) => c.name)
    commands.forEach((command) => this.addCommand(command))
  }

  renderHelp() {
    const commands = Object.values(this.commands)
      .sort()
      .filter((cmd) => cmd.getPath().length === 1)

    return `
${cliStyles.heading("USAGE")}
  garden ${cliStyles.commandPlaceholder()} ${cliStyles.optionsPlaceholder()}

${cliStyles.heading("COMMANDS")}
${renderCommands(commands)}
    `
  }

  private async initFileWriters(logger: Logger, root: string, gardenDirPath: string) {
    if (this.fileWritersInitialized) {
      return
    }
    const logConfigs: FileWriterConfig[] = [
      {
        logFilePath: join(root, ERROR_LOG_FILENAME),
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
      logger.writers.push(await FileWriter.factory(config))
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

  async runCommand<A extends Parameters, O extends Parameters>({
    command,
    parsedArgs,
    parsedOpts,
  }: {
    command: Command<A, O>
    parsedArgs: ParameterValues<A>
    parsedOpts: ParameterValues<GlobalOptions & O>
  }) {
    const root = resolve(process.cwd(), parsedOpts.root)
    const {
      "logger-type": loggerTypeOpt,
      "log-level": logLevel,
      emoji,
      "env": environmentName,
      silent,
      output,
      "force-refresh": forceRefresh,
      "var": cliVars,
    } = parsedOpts

    // Parse command line --var input
    const parsedCliVars = cliVars ? dotenv.parse(cliVars.join("\n")) : {}

    let loggerType = <LoggerType>loggerTypeOpt || command.getLoggerType({ opts: parsedOpts, args: parsedArgs })

    if (silent || output) {
      loggerType = "quiet"
    }

    // Init logger
    const level = parseLogLevel(logLevel)
    const logger = initLogger({ level, loggerType, emoji })

    // Currently we initialise empty placeholder entries and pass those to the
    // framework as opposed to the logger itself. This is to give better control over where on
    // the screen the logs are printed.
    const headerLog = logger.placeholder()
    const log = logger.placeholder()
    const footerLog = logger.placeholder()

    // Init event & log streaming.
    const sessionId = uuidv4()
    const bufferedEventStream = new BufferedEventStream(log, sessionId)

    const contextOpts: GardenOpts = {
      commandInfo: {
        name: command.getFullName(),
        args: parsedArgs,
        opts: parsedOpts,
      },
      environmentName,
      log,
      sessionId,
      forceRefresh,
      variables: parsedCliVars,
    }

    let garden: Garden
    let result: CommandResult<any>
    let analytics: AnalyticsHandler

    const { persistent } = await command.prepare({
      log,
      headerLog,
      footerLog,
      args: parsedArgs,
      opts: parsedOpts,
    })

    contextOpts.persistent = persistent

    do {
      try {
        if (command.noProject) {
          garden = await makeDummyGarden(root, contextOpts)
        } else {
          garden = await Garden.factory(root, contextOpts)
        }

        const enterpriseContext = makeEnterpriseContext(garden)
        if (enterpriseContext) {
          log.silly(`Connecting Garden instance to BufferedEventStream`)
          bufferedEventStream.connect({
            enterpriseContext,
            eventBus: garden.events,
            environmentName: garden.environmentName,
            namespace: garden.namespace,
          })
        } else {
          log.silly(`Skip connecting Garden instance to BufferedEventStream`)
        }

        // Register log file writers. We need to do this after the Garden class is initialised because
        // the file writers depend on the project root.
        await this.initFileWriters(logger, garden.projectRoot, garden.gardenDirPath)
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
          await generateBasicDebugInfoReport(root, join(root, DEFAULT_GARDEN_DIR_NAME), log, parsedOpts.format)
        }
        throw err
      }
    } while (result.restartRequired)

    await bufferedEventStream.close()

    return { result, analytics }
  }

  async run({ args, exitOnError }: { args: string[]; exitOnError: boolean }): Promise<RunOutput> {
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
        process.exit(abortCode)
      } else {
        await waitForOutputFlush()
        return { argv, code: abortCode, errors, result, consoleOutput }
      }
    }

    if (argv.v || argv.version || argv._[0] === "version") {
      return done(0, getPackageVersion())
    }

    const { command } = pickCommand(Object.values(this.commands), args)

    if (!command) {
      return done(0, this.renderHelp())
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
        return done(0, this.renderHelp())
      }
    }

    let parsedArgs: ParameterValues<any>
    let parsedOpts: ParameterValues<any>

    try {
      const parseResults = processCliArgs({ parsedArgs: argv, command, cli: true })
      parsedArgs = parseResults.args
      parsedOpts = parseResults.opts
    } catch (err) {
      errors.push(...(err.detail?.errors || []).map(toGardenError))
      return done(1, err.message + "\n" + command.renderHelp())
    }

    let commandResult: CommandResult<any> | undefined = undefined
    let analytics: AnalyticsHandler | undefined = undefined

    try {
      const runResults = await this.runCommand({ command, parsedArgs, parsedOpts })
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

      if (gardenErrors.length > 0) {
        return done(1, renderer({ success: false, errors: gardenErrors }), commandResult?.result)
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
        writers: [new BasicTerminalWriter()],
      })
    }

    let code = 0

    if (gardenErrors.length > 0) {
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

      if (logger.writers.find((w) => w instanceof FileWriter)) {
        logger.info(`\nSee ${ERROR_LOG_FILENAME} for detailed error message`)
        await waitForOutputFlush()
      }

      code = 1
    }

    if (exitOnError) {
      logger.stop()
      logger.cleanup()
    }

    return { argv, code, errors, result: commandResult?.result }
  }
}

export async function runCli(): Promise<void> {
  let code = 0

  try {
    const cli = new GardenCli()
    // Note: We slice off the binary/script name from argv.
    const result = await cli.run({ args: process.argv.slice(2), exitOnError: true })
    code = result.code
  } catch (err) {
    // tslint:disable-next-line: no-console
    console.log(err.message)
    code = 1
  } finally {
    if (gardenEnv.GARDEN_ENABLE_PROFILING) {
      // tslint:disable-next-line: no-console
      console.log(getDefaultProfiler().report())
    }

    shutdown(code)
  }
}
