/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { intersection, mapValues, sortBy } from "lodash-es"
import { resolve, join } from "path"
import fsExtra from "fs-extra"
import { getBuiltinCommands } from "../commands/commands.js"
import { getPackageVersion } from "../util/util.js"
import type { Command, CommandResult, BuiltinArgs } from "../commands/base.js"
import { CommandGroup } from "../commands/base.js"
import type { GardenError } from "../exceptions.js"
import { PluginError, toGardenError } from "../exceptions.js"
import type { GardenOpts } from "../garden.js"
import { Garden, makeDummyGarden } from "../garden.js"
import { getRootLogger, getTerminalWriterType, LogLevel, parseLogLevel, RootLogger } from "../logger/logger.js"
import type { FileWriterConfig } from "../logger/writers/file-writer.js"
import { FileWriter } from "../logger/writers/file-writer.js"

import {
  checkForUpdates,
  checkForStaticDir,
  renderCommands,
  processCliArgs,
  pickCommand,
  parseCliArgs,
  parseCliVarFlags,
  optionsWithAliasValues,
  checkRequirements,
  renderCommandErrors,
  cliStyles,
} from "./helpers.js"
import type { ParameterObject, GlobalOptions, ParameterValues } from "./params.js"
import { globalOptions, OUTPUT_RENDERERS } from "./params.js"
import type { ProjectConfig } from "../config/project.js"
import { ERROR_LOG_FILENAME, DEFAULT_GARDEN_DIR_NAME, LOGS_DIR_NAME, gardenEnv } from "../constants.js"
import { generateBasicDebugInfoReport } from "../commands/get/get-debug-info.js"
import type { AnalyticsHandler } from "../analytics/analytics.js"
import type { GardenPluginReference } from "../plugin/plugin.js"
import { findProjectConfig } from "../config/base.js"
import { pMemoizeDecorator } from "../lib/p-memoize.js"
import { getCustomCommands } from "../commands/custom.js"
import { Profile } from "../util/profiling.js"
import { prepareDebugLogfiles } from "./debug-logs.js"
import type { Log } from "../logger/log-entry.js"
import type { GardenProcess } from "../config-store/global.js"
import { GlobalConfigStore } from "../config-store/global.js"
import { registerProcess } from "../process.js"
import { uuidv4 } from "../util/random.js"
import { withSessionContext } from "../util/open-telemetry/context.js"
import { wrapActiveSpan } from "../util/open-telemetry/spans.js"
import { JsonFileWriter } from "../logger/writers/json-file-writer.js"
import type minimist from "minimist"
import { styles } from "../logger/styles.js"
import { enforceLogin } from "../cloud/enforce-login.js"

const { pathExists } = fsExtra

export interface RunOutput {
  argv: any
  code: number
  errors: (GardenError | Error)[]
  result: any
  // Mainly used for testing
  consoleOutput?: string
}

export interface GardenCliParams {
  initLogger: boolean
  plugins?: GardenPluginReference[]
}

function hasHelpFlag(argv: minimist.ParsedArgs) {
  return argv.h || argv.help
}

// TODO: this is used in more contexts now, should rename to GardenCommandRunner or something like that
@Profile()
export class GardenCli {
  private readonly commands: { [key: string]: Command } = {}
  private readonly initLogger: boolean
  private fileWritersInitialized = false

  public readonly plugins: GardenPluginReference[]
  public processRecord?: GardenProcess

  constructor({ plugins, initLogger }: GardenCliParams) {
    this.plugins = plugins || []
    this.initLogger = initLogger

    const commands = sortBy(getBuiltinCommands(), (c) => c.name)
    commands.forEach((command) => this.addCommand(command))
  }

  async renderHelp(log: Log, workingDir: string) {
    const commands = Object.values(this.commands)
      .sort()
      .filter((cmd) => !cmd.hidden)
      .filter((cmd) => cmd.getPath().length === 1)

    // `dedent` has a bug where it doesn't indent correctly
    // when there's ANSI codes in the beginning of a line.
    // Thus we have to dedent like this.
    let msg = `
${cliStyles.heading("USAGE")}
  garden ${cliStyles.commandPlaceholder()} ${cliStyles.argumentsPlaceholder()} ${cliStyles.optionsPlaceholder()}

${cliStyles.heading("COMMANDS")}
${renderCommands(commands)}
`

    const customCommands = await this.getCustomCommands(log, workingDir)

    if (customCommands.length > 0) {
      msg += `\n${cliStyles.heading("CUSTOM COMMANDS")}\n${renderCommands(customCommands)}`
    }

    return msg
  }

  private async initFileWriters({
    log,
    gardenDirPath,
    commandFullName,
  }: {
    log: Log
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
        level: LogLevel.debug,
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
        level: log.root.level,
      },
    ]
    for (const config of logConfigs) {
      getRootLogger().addFileWriter(await (config.json ? JsonFileWriter : FileWriter).factory(config))
    }
    this.fileWritersInitialized = true
  }

  addCommand(command: Command): void {
    const fullName = command.getFullName()

    if (this.commands[fullName]) {
      // For now we don't allow multiple definitions of the same command. We may want to revisit this later.
      throw new PluginError({ message: `Multiple definitions of command "${fullName}"` })
    }

    this.commands[fullName] = command

    const { options = {} } = command

    const optKeys = Object.keys(options)
    const globalKeys = Object.keys(globalOptions)
    const dupKeys: string[] = intersection(optKeys, globalKeys)

    if (dupKeys.length > 0) {
      throw new PluginError({ message: `Global option(s) ${dupKeys.join(" ")} cannot be redefined` })
    }
  }

  async getGarden(workingDir: string, opts: GardenOpts) {
    return Garden.factory(workingDir, opts)
  }

  async runCommand<A extends ParameterObject, O extends ParameterObject>({
    command,
    parsedArgs,
    parsedOpts,
    processRecord,
    workingDir,
    log,
  }: {
    command: Command<A, O>
    parsedArgs: BuiltinArgs & ParameterValues<A>
    parsedOpts: ParameterValues<GlobalOptions & O>
    processRecord?: GardenProcess
    workingDir: string
    log: Log
  }) {
    const { "env": environmentName, silent, output, "force-refresh": forceRefresh, "var": cliVars } = parsedOpts

    const parsedCliVars = parseCliVarFlags(cliVars)
    // Some commands may set their own logger type so we update the logger config here,
    // once we've resolved the command.

    // For commands that use Ink we overwrite the terminal writer configuration (unless silent/output flags are set)
    if (command.useInkTerminalWriter({ opts: parsedOpts, args: parsedArgs })) {
      getRootLogger().setTerminalWriter(getTerminalWriterType({ silent, output, loggerType: "ink" }))
    }

    const globalConfigStore = new GlobalConfigStore()

    await validateRuntimeRequirementsCached(log, globalConfigStore, checkRequirements)

    command.printHeader({ log, args: parsedArgs, opts: parsedOpts })
    const sessionId = uuidv4()

    return withSessionContext({ sessionId }, async () => {
      const gardenLog = log.createLog({ name: "garden", showDuration: true })
      // Log context for printing the start and finish of Garden initialization when not using the dev console
      const gardenInitLog =
        !command.noProject && command.getFullName() !== "dev" && command.getFullName() !== "serve"
          ? log.createLog({ name: "garden", showDuration: true })
          : null
      gardenInitLog?.info("Initializing...")

      const commandInfo = {
        name: command.getFullName(),
        args: parsedArgs,
        opts: optionsWithAliasValues(command, parsedOpts),
        rawArgs: parsedArgs["$all"] || [],
        isCustomCommand: command.isCustom,
      }

      const contextOpts: GardenOpts = {
        sessionId,
        parentSessionId: undefined,
        commandInfo,
        environmentString: environmentName,
        globalConfigStore,
        log,
        gardenInitLog: gardenInitLog || undefined,
        forceRefresh,
        variableOverrides: parsedCliVars,
        plugins: this.plugins,
        skipCloudConnect: command.noProject,
      }

      let garden: Garden
      let result: CommandResult = {}
      let analytics: AnalyticsHandler | undefined = undefined

      const prepareParams = {
        log,
        args: parsedArgs,
        opts: parsedOpts,
      }

      const persistent = command.maybePersistent(prepareParams)

      await command.prepare(prepareParams)

      const server = command.server

      contextOpts.persistent = persistent
      // TODO: Link to Cloud namespace page here.

      try {
        if (command.noProject) {
          garden = await makeDummyGarden(workingDir, contextOpts)
        } else {
          garden = await wrapActiveSpan("initializeGarden", () => this.getGarden(workingDir, contextOpts))

          enforceLogin({
            garden,
            log,
            isOfflineModeEnabled: parsedOpts.offline || gardenEnv.GARDEN_OFFLINE,
          })

          gardenLog.info(
            `Running in environment ${styles.highlight(`${garden.environmentName}.${garden.namespace}`)} in project ${styles.highlight(garden.projectName)}`
          )

          if (processRecord) {
            // Update the db record for the process
            await globalConfigStore.update("activeProcesses", String(processRecord.pid), {
              command: command.name,
              sessionId,
              persistent,
              serverHost: server?.getUrl() || null,
              serverAuthKey: server?.authKey || null,
              projectRoot: garden.projectRoot,
              projectName: garden.projectName,
              environmentName: garden.environmentName,
              namespace: garden.namespace,
            })
          }
        }

        analytics = await garden.getAnalyticsHandler()

        // Register log file writers. We need to do this after the Garden class is initialised because
        // the file writers depend on the project root.
        await this.initFileWriters({
          log,
          gardenDirPath: garden.gardenDirPath,
          commandFullName: command.getFullName(),
        })

        // Note: No reason to await the check
        checkForUpdates(garden.globalConfigStore, log).catch((err) => {
          log.verbose(`Something went wrong while checking for the latest Garden version.`)
          log.verbose(err.toString())
        })

        await checkForStaticDir()

        result = await command.run({
          cli: this,
          garden,
          log: garden.log,
          args: parsedArgs,
          opts: parsedOpts,
          sessionId,
          parentSessionId: null,
        })

        if (garden.monitors.anyMonitorsActive()) {
          // Wait for monitors to exit
          log.debug(styles.primary("One or more monitors active, waiting until all exit."))
          await garden.monitors.waitUntilStopped()
        }

        garden.close()
      } catch (err) {
        // Generate a basic report in case Garden.factory(...) fails and command is "get debug-info".
        // Other exceptions are handled within the implementation of "get debug-info".
        if (command.name === "debug-info") {
          // Use default Garden dir name as fallback since Garden class hasn't been initialised
          await generateBasicDebugInfoReport(
            workingDir,
            join(workingDir, DEFAULT_GARDEN_DIR_NAME),
            log,
            parsedOpts.output
          )
        }

        // flush analytics early since when we throw the instance is not returned
        await analytics?.closeAndFlush()

        throw err
      } finally {
        await server?.close()
      }

      return { result, analytics }
    })
  }

  async run({
    args,
    processRecord,
    cwd,
  }: {
    args: string[]
    processRecord?: GardenProcess
    cwd?: string
  }): Promise<RunOutput> {
    let argv = parseCliArgs({ stringArgs: args, cli: true })

    const errors: (GardenError | Error)[] = []

    async function done(abortCode: number, consoleOutput: string, result: any = {}) {
      // eslint-disable-next-line no-console
      console.log(consoleOutput)

      return { argv, code: abortCode, errors, result, consoleOutput }
    }

    const workingDir = resolve(cwd || process.cwd(), argv.root || "")

    if (!(await pathExists(workingDir))) {
      return done(1, styles.error(`Could not find specified root path (${argv.root})`))
    }

    let projectConfig: ProjectConfig | undefined

    // First look for native Garden commands
    const picked = pickCommand(Object.values(this.commands), argv._)
    const { rest } = picked
    let { command, matchedPath } = picked

    // Note: We partially initialize the logger here with the default writer or the one set via
    // command line flags / env var by the user so that we can use it right away.
    // Some commands require a specific writer so we update the writers (if needed) once
    // we've resolved the commands.
    const {
      emoji,
      silent,
      output,
      "show-timestamps": showTimestamps,
      "logger-type": loggerType,
      "log-level": logLevelStr,
    } = argv
    let logger: RootLogger
    try {
      logger = RootLogger.initialize({
        level: parseLogLevel(logLevelStr),
        storeEntries: false,
        displayWriterType: getTerminalWriterType({ silent, output, loggerType }),
        outputRenderer: output,
        useEmoji: emoji,
        showTimestamps,
        force: this.initLogger,
      })
    } catch (error) {
      return done(1, toGardenError(error).explain("Failed to initialize logger"))
    }

    const log = logger.createLog()
    log.debug(`garden version: ${getPackageVersion()}`)

    // Load custom commands from current project (if applicable) and see if any match the arguments
    if (!command) {
      try {
        projectConfig = await this.getProjectConfig(log, workingDir)

        if (projectConfig) {
          const customCommands = await this.getCustomCommands(log, workingDir)
          const pickedCommand = pickCommand(customCommands, argv._)
          command = pickedCommand.command
          matchedPath = pickedCommand.matchedPath
        }
      } catch (error) {
        return done(1, toGardenError(error).explain("Failed to get custom commands"))
      }
    }

    // If we still haven't found a valid command, print help
    if (!command) {
      const exitCode = argv._.length === 0 && hasHelpFlag(argv) ? 0 : 1
      return done(exitCode, await this.renderHelp(log, workingDir))
    }

    // Parse the arguments again with the Command set, to fully validate, and to ensure boolean options are
    // handled correctly.
    argv = parseCliArgs({ stringArgs: args, command, cli: true })

    // Slice command name from the positional args
    argv._ = argv._.slice(command.getPath().length)

    // Handle -h and --help flags, those are always valid and should return exit code 0
    if (hasHelpFlag(argv)) {
      // Handle subcommand listings
      if (command instanceof CommandGroup) {
        const subCommandName = rest[0]
        if (subCommandName === undefined) {
          // Exit code 0 if sub-command is not specified and --help flag is passed, e.g. garden get --help
          return done(0, command.renderHelp())
        }

        // Try to show specific help for given subcommand
        for (const subCommand of command.subCommands) {
          const sub = new subCommand()
          if (sub.name === rest[0]) {
            return done(0, sub.renderHelp())
          }
        }

        // If sub-command was not found, then the sub-command name is incorrect.
        // Falls through to general command help and exit code 1.
        return done(1, command.renderHelp())
      }

      return done(0, command.renderHelp())
    }

    // Handle incomplete subcommand listings.
    // A complete sub-command won't be recognized as CommandGroup.
    if (command instanceof CommandGroup) {
      const subCommandName = rest[0]
      if (subCommandName === undefined) {
        // exit code 1 if sub-command is missing
        return done(1, command.renderHelp())
      }

      // Try to show specific help for given subcommand
      for (const subCommand of command.subCommands) {
        const sub = new subCommand()
        if (sub.name === rest[0]) {
          return done(1, sub.renderHelp())
        }
      }

      // If sub-command was not found, then the sub-command name is incorrect.
      // Falls through to general command help and exit code 1.
      return done(1, command.renderHelp())
    }

    let parsedArgs: BuiltinArgs & ParameterValues<ParameterObject>
    let parsedOpts: ParameterValues<GlobalOptions & ParameterObject>

    if (command.ignoreOptions) {
      parsedArgs = { $all: args }
      parsedOpts = mapValues(globalOptions, (spec) => spec.getDefaultValue(true)) as ParameterValues<GlobalOptions>
    } else {
      try {
        const parseResults = processCliArgs({ rawArgs: args, parsedArgs: argv, command, matchedPath, cli: true })
        parsedArgs = parseResults.args
        parsedOpts = parseResults.opts
      } catch (err) {
        errors.push(toGardenError(err))
        return done(1, `${err}\n` + command.renderHelp())
      }
    }

    let commandResult: CommandResult | undefined
    let analytics: AnalyticsHandler | undefined

    if (!processRecord) {
      processRecord = this.processRecord
    }

    if (!processRecord) {
      const globalConfigStore = new GlobalConfigStore()
      processRecord = await registerProcess(globalConfigStore, command.getFullName(), args)
    }

    this.processRecord = processRecord!

    try {
      const runResults = await wrapActiveSpan("garden", async (span) => {
        span.setAttribute("garden.version", getPackageVersion())

        const results = await this.runCommand({
          command: command!,
          parsedArgs,
          parsedOpts,
          processRecord,
          workingDir,
          log,
        })

        return results
      })

      commandResult = runResults.result
      analytics = runResults.analytics
    } catch (err) {
      commandResult = { errors: [toGardenError(err)] }
    }

    errors.push(...(commandResult.errors || []))

    const gardenErrors: GardenError[] = errors.map(toGardenError)

    // Flushes the Analytics events queue in case there are some remaining events.
    await analytics?.closeAndFlush()

    // --output option set
    if (argv.output) {
      const renderer = OUTPUT_RENDERERS[argv.output]!

      if (gardenErrors.length > 0 || (commandResult.exitCode && commandResult.exitCode !== 0)) {
        return done(
          commandResult.exitCode || 1,
          renderer({
            success: false,
            errors: gardenErrors,
          }),
          commandResult?.result
        )
      } else {
        return done(0, renderer({ success: true, ...commandResult }), commandResult?.result)
      }
    }

    let code = 0
    if (gardenErrors.length > 0) {
      renderCommandErrors(logger, gardenErrors)
      code = commandResult.exitCode || 1
    }

    return { argv, code, errors, result: commandResult?.result }
  }

  @pMemoizeDecorator()
  async getProjectConfig(log: Log, workingDir: string): Promise<ProjectConfig | undefined> {
    return findProjectConfig({ log, path: workingDir })
  }

  @pMemoizeDecorator()
  private async getCustomCommands(log: Log, workingDir: string): Promise<Command[]> {
    const projectConfig = await this.getProjectConfig(log, workingDir)
    const projectRoot = projectConfig?.path

    if (!projectRoot) {
      return []
    }

    return await getCustomCommands(log, projectRoot)
  }
}

export async function validateRuntimeRequirementsCached(
  log: Log,
  globalConfig: GlobalConfigStore,
  requirementCheckFunction: () => Promise<void>
) {
  const requirementsCheck = await globalConfig.get("requirementsCheck")

  if (!requirementsCheck || !requirementsCheck.passed) {
    const setReqCheck = async (passed: boolean) => {
      await globalConfig.set("requirementsCheck", {
        lastRunDateUNIX: Date.now(),
        lastRunGardenVersion: getPackageVersion(),
        passed,
      })
    }
    try {
      log.debug("checking for garden runtime requirements")
      await requirementCheckFunction()
      // didn't throw means requirements are met
      await setReqCheck(true)
    } catch (err) {
      await setReqCheck(false)
      throw err
    }
  }
}
