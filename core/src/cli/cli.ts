/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { intersection, mapValues, sortBy } from "lodash"
import { resolve, join } from "path"
import chalk from "chalk"
import { pathExists } from "fs-extra"
import { getBuiltinCommands } from "../commands/commands"
import { shutdown, getPackageVersion, getCloudDistributionName } from "../util/util"
import { Command, CommandResult, BuiltinArgs, CommandGroup } from "../commands/base"
import { PluginError, toGardenError, GardenError } from "../exceptions"
import { Garden, GardenOpts, makeDummyGarden } from "../garden"
import { getRootLogger, getTerminalWriterType, LogLevel, parseLogLevel, RootLogger } from "../logger/logger"
import { FileWriter, FileWriterConfig } from "../logger/writers/file-writer"

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
} from "./helpers"
import { ParameterObject, globalOptions, OUTPUT_RENDERERS, GlobalOptions, ParameterValues } from "./params"
import { ProjectConfig } from "../config/project"
import { ERROR_LOG_FILENAME, DEFAULT_GARDEN_DIR_NAME, LOGS_DIR_NAME, gardenEnv } from "../constants"
import { generateBasicDebugInfoReport } from "../commands/get/get-debug-info"
import { AnalyticsHandler } from "../analytics/analytics"
import { GardenPluginReference } from "../plugin/plugin"
import { CloudApi, CloudApiFactory, CloudApiTokenRefreshError, getGardenCloudDomain } from "../cloud/api"
import { findProjectConfig } from "../config/base"
import { pMemoizeDecorator } from "../lib/p-memoize"
import { getCustomCommands } from "../commands/custom"
import { Profile } from "../util/profiling"
import { prepareDebugLogfiles } from "./debug-logs"
import { Log } from "../logger/log-entry"
import { dedent } from "../util/string"
import { GardenProcess, GlobalConfigStore } from "../config-store/global"
import { registerProcess, waitForOutputFlush } from "../process"
import { uuidv4 } from "../util/random"
import { withSessionContext } from "../util/open-telemetry/context"
import { wrapActiveSpan } from "../util/open-telemetry/spans"
import { JsonFileWriter } from "../logger/writers/json-file-writer"
import minimist from "minimist"

export interface RunOutput {
  argv: any
  code: number
  errors: (GardenError | Error)[]
  result: any
  // Mainly used for testing
  consoleOutput?: string
}

export interface GardenCliParams {
  plugins?: GardenPluginReference[]
  initLogger?: boolean
  cloudApiFactory?: CloudApiFactory
  globalConfigStoreDir?: string
}

function hasHelpFlag(argv: minimist.ParsedArgs) {
  return argv.h || argv.help
}

// TODO: this is used in more contexts now, should rename to GardenCommandRunner or something like that
@Profile()
export class GardenCli {
  private commands: { [key: string]: Command } = {}
  private fileWritersInitialized = false
  public plugins: GardenPluginReference[]
  private initLogger: boolean
  public processRecord?: GardenProcess
  protected cloudApiFactory: CloudApiFactory
  private globalConfigStore: GlobalConfigStore

  constructor({
    plugins,
    globalConfigStoreDir: globalConfigStorePath,
    initLogger = false,
    cloudApiFactory = CloudApi.factory,
  }: GardenCliParams = {}) {
    this.plugins = plugins || []
    this.initLogger = initLogger
    this.cloudApiFactory = cloudApiFactory
    this.globalConfigStore = new GlobalConfigStore(globalConfigStorePath)

    const commands = sortBy(getBuiltinCommands(), (c) => c.name)
    commands.forEach((command) => this.addCommand(command))
  }

  async renderHelp(log: Log, workingDir: string) {
    const commands = Object.values(this.commands)
      .sort()
      .filter((cmd) => cmd.getPath().length === 1)

    // `dedent` has a bug where it doesn't indent correctly
    // when there's ANSI codes in the beginning of a line.
    // Thus we have to dedent like this.
    let msg = `
${cliStyles.heading("USAGE")}
  garden ${cliStyles.commandPlaceholder()} ${cliStyles.optionsPlaceholder()}

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
    const {
      "env": environmentName,
      silent,
      output,
      "logger-type": loggerTypeOpt,
      "force-refresh": forceRefresh,
      "var": cliVars,
    } = parsedOpts

    const parsedCliVars = parseCliVarFlags(cliVars)

    // Some commands may set their own logger type so we update the logger config here,
    // once we've resolved the command.
    const commandLoggerType = command.getTerminalWriterType({ opts: parsedOpts, args: parsedArgs })
    getRootLogger().setTerminalWriter(getTerminalWriterType({ silent, output, loggerTypeOpt, commandLoggerType }))

    await validateRuntimeRequirementsCached(log, this.globalConfigStore, checkRequirements)

    command.printHeader({ log, args: parsedArgs, opts: parsedOpts })
    const sessionId = uuidv4()

    return withSessionContext({ sessionId }, async () => {
      // Init Cloud API (if applicable)
      let cloudApi: CloudApi | undefined

      if (!command.noProject) {
        const config = await this.getProjectConfig(log, workingDir)
        const cloudDomain = getGardenCloudDomain(config?.domain)
        const distroName = getCloudDistributionName(cloudDomain)

        try {
          cloudApi = await this.cloudApiFactory({ log, cloudDomain, globalConfigStore: this.globalConfigStore })
        } catch (err) {
          if (err instanceof CloudApiTokenRefreshError) {
            log.warn(dedent`
              ${chalk.yellow(`Unable to authenticate against ${distroName} with the current session token.`)}
              Command results for this command run will not be available in ${distroName}. If this not a
              ${distroName} project you can ignore this warning. Otherwise, please try logging out with
              \`garden logout\` and back in again with \`garden login\`.
            `)

            // Project is configured for cloud usage => fail early to force re-auth
            if (config && config.id) {
              throw err
            }
          } else {
            // unhandled error when creating the cloud api
            throw err
          }
        }
      }

      const commandInfo = {
        name: command.getFullName(),
        args: parsedArgs,
        opts: optionsWithAliasValues(command, parsedOpts),
      }

      const contextOpts: GardenOpts = {
        commandInfo,
        environmentString: environmentName,
        log,
        forceRefresh,
        variableOverrides: parsedCliVars,
        plugins: this.plugins,
        globalConfigStore: this.globalConfigStore,
        cloudApi,
      }

      let garden: Garden
      let result: CommandResult<any> = {}
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
      const nsLog = log.createLog({ name: "garden" })

      try {
        if (command.noProject) {
          garden = await makeDummyGarden(workingDir, contextOpts)
        } else {
          garden = await wrapActiveSpan("initializeGarden", () => this.getGarden(workingDir, contextOpts))

          if (!gardenEnv.GARDEN_DISABLE_VERSION_CHECK) {
            await garden.emitWarning({
              key: "0.13-bonsai",
              log,
              message: chalk.yellow(dedent`
                Garden v0.13 (Bonsai) is a major release with significant changes. Please help us improve it by reporting any issues/bugs here:
                https://go.garden.io/report-bonsai
              `),
            })
          }

          nsLog.info(`Running in Garden environment ${chalk.cyan(`${garden.environmentName}.${garden.namespace}`)}`)

          if (!cloudApi && garden.projectId) {
            log.warn(
              `You are not logged in into Garden Cloud. Please log in via the ${chalk.green("garden login")} command.`
            )
            log.info("")
          }

          if (processRecord) {
            // Update the db record for the process
            await this.globalConfigStore.update("activeProcesses", String(processRecord.pid), {
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

        if (command.enableAnalytics) {
          analytics = await garden.getAnalyticsHandler()
        }

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
          log.debug(chalk.gray("One or more monitors active, waiting until all exit."))
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
        await analytics?.flush()

        throw err
      } finally {
        await server?.close()
        cloudApi?.close()
      }

      return { result, analytics, cloudApi }
    })
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

    const errors: (GardenError | Error)[] = []

    async function done(abortCode: number, consoleOutput: string, result: any = {}) {
      if (exitOnError) {
        // eslint-disable-next-line no-console
        console.log(consoleOutput)
        await waitForOutputFlush()
        await shutdown(abortCode)
      } else {
        await waitForOutputFlush()
      }

      return { argv, code: abortCode, errors, result, consoleOutput }
    }

    const workingDir = resolve(cwd || process.cwd(), argv.root || "")

    if (!(await pathExists(workingDir))) {
      return done(1, chalk.red(`Could not find specified root path (${argv.root})`))
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
      "logger-type": loggerTypeOpt,
      "log-level": logLevelStr,
    } = argv
    let logger: RootLogger
    try {
      logger = RootLogger.initialize({
        level: parseLogLevel(logLevelStr),
        storeEntries: false,
        displayWriterType: getTerminalWriterType({ silent, output, loggerTypeOpt, commandLoggerType: null }),
        useEmoji: emoji,
        showTimestamps,
        force: this.initLogger,
      })
    } catch (error) {
      return done(1, toGardenError(error).explain("Failed to initialize logger"))
    }

    const log = logger.createLog()
    log.verbose(`garden version: ${getPackageVersion()}`)

    // Load custom commands from current project (if applicable) and see if any match the arguments
    if (!command) {
      try {
        projectConfig = await this.getProjectConfig(log, workingDir)

        if (projectConfig) {
          const customCommands = await this.getCustomCommands(log, workingDir)
          const picked = pickCommand(customCommands, argv._)
          command = picked.command
          matchedPath = picked.matchedPath
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

    let commandResult: CommandResult<any> | undefined
    let analytics: AnalyticsHandler | undefined

    if (!processRecord) {
      processRecord = this.processRecord
    }

    if (!processRecord) {
      processRecord = await registerProcess(this.globalConfigStore, command.getFullName(), args)
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
    await analytics?.flush()

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
      await waitForOutputFlush()
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
