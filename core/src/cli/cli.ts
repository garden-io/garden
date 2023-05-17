/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import dotenv = require("dotenv")
import { intersection, mapValues, sortBy } from "lodash"
import { resolve, join } from "path"
import chalk from "chalk"
import { pathExists } from "fs-extra"
import { getBuiltinCommands } from "../commands/commands"
import {
  shutdown,
  getPackageVersion,
  registerCleanupFunction,
  getCloudDistributionName,
  getCloudLogSectionName,
} from "../util/util"
import { Command, CommandResult, CommandGroup, BuiltinArgs } from "../commands/base"
import { PluginError, toGardenError, GardenBaseError } from "../exceptions"
import { Garden, GardenOpts, DummyGarden } from "../garden"
import { getRootLogger, getTerminalWriterType, LogLevel, parseLogLevel, RootLogger } from "../logger/logger"
import { FileWriter, FileWriterConfig } from "../logger/writers/file-writer"

import {
  checkForUpdates,
  checkForStaticDir,
  renderCommands,
  processCliArgs,
  pickCommand,
  parseCliArgs,
  optionsWithAliasValues,
  checkRequirements,
  renderCommandErrors,
  cliStyles,
} from "./helpers"
import { Parameters, globalOptions, OUTPUT_RENDERERS, GlobalOptions, ParameterValues } from "./params"
import {
  ProjectConfig,
  defaultNamespace,
  parseEnvironment,
  ProjectResource,
  defaultEnvironment,
} from "../config/project"
import {
  ERROR_LOG_FILENAME,
  DEFAULT_API_VERSION,
  DEFAULT_GARDEN_DIR_NAME,
  LOGS_DIR_NAME,
  gardenEnv,
} from "../constants"
import { generateBasicDebugInfoReport } from "../commands/get/get-debug-info"
import { AnalyticsHandler } from "../analytics/analytics"
import { BufferedEventStream, ConnectBufferedEventStreamParams } from "../cloud/buffered-event-stream"
import { defaultDotIgnoreFile } from "../util/fs"
import { CoreEventStream } from "../server/core-event-stream"
import { GardenPluginReference } from "../plugin/plugin"
import { CloudApi, CloudApiTokenRefreshError, getGardenCloudDomain } from "../cloud/api"
import { findProjectConfig } from "../config/base"
import { pMemoizeDecorator } from "../lib/p-memoize"
import { getCustomCommands } from "../commands/custom"
import { Profile } from "../util/profiling"
import { prepareDebugLogfiles } from "./debug-logs"
import { Log } from "../logger/log-entry"
import { JsonFileWriter } from "../logger/writers/json-file-writer"
import { dedent } from "../util/string"
import { GardenProcess, GlobalConfigStore } from "../config-store/global"
import { registerProcess, waitForOutputFlush } from "../process"
import { ServeCommand } from "../commands/serve"
import { uuidv4 } from "../util/random"

export async function makeDummyGarden(root: string, gardenOpts: GardenOpts) {
  if (!gardenOpts.environmentName) {
    gardenOpts.environmentName = `${defaultEnvironment}.${defaultNamespace}`
  }

  const parsed = parseEnvironment(gardenOpts.environmentName)
  const environmentName = parsed.environment || defaultEnvironment
  const _defaultNamespace = parsed.namespace || defaultNamespace

  const config: ProjectConfig = {
    path: root,
    apiVersion: DEFAULT_API_VERSION,
    kind: "Project",
    name: "no-project",
    defaultEnvironment: "",
    dotIgnoreFile: defaultDotIgnoreFile,
    environments: [{ name: environmentName, defaultNamespace: _defaultNamespace, variables: {} }],
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
  private sessionFinished = false
  private initLogger: boolean
  public processRecord: GardenProcess
  // FIXME @instance-manager: This was changed from public to private so that we can
  // access the bufferedEventStream instance via the cli instance for
  // some commands. We can remove this all together when we introduce the
  // instance manager.
  public bufferedEventStream: BufferedEventStream | undefined

  constructor({ plugins, initLogger = false }: { plugins?: GardenPluginReference[]; initLogger?: boolean } = {}) {
    this.plugins = plugins || []
    this.initLogger = initLogger

    const commands = sortBy(getBuiltinCommands(), (c) => c.name)
    commands.forEach((command) => this.addCommand(command))
  }

  async renderHelp(log: Log, workingDir: string) {
    const commands = Object.values(this.commands)
      .sort()
      .filter((cmd) => cmd.getPath().length === 1)

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
    log,
  }: {
    command: Command<A, O>
    parsedArgs: BuiltinArgs & ParameterValues<A>
    parsedOpts: ParameterValues<GlobalOptions & O>
    processRecord?: GardenProcess
    workingDir: string
    log: Log
  }) {
    let {
      "env": environmentName,
      silent,
      output,
      "logger-type": loggerTypeOpt,
      "force-refresh": forceRefresh,
      "var": cliVars,
      "disable-port-forwards": disablePortForwards,
    } = parsedOpts

    // Parse command line --var input
    const parsedCliVars = cliVars ? dotenv.parse(cliVars.join("\n")) : {}

    // Some commands may set their own logger type so we update the logger config here,
    // once we've resolved the command.
    const commandLoggerType = command.getTerminalWriterType({ opts: parsedOpts, args: parsedArgs })
    getRootLogger().setTerminalWriter(getTerminalWriterType({ silent, output, loggerTypeOpt, commandLoggerType }))

    const globalConfigStore = new GlobalConfigStore()

    await validateRuntimeRequirementsCached(log, globalConfigStore, checkRequirements)

    command.printHeader({ headerLog: log, args: parsedArgs, opts: parsedOpts })
    const sessionId = uuidv4()

    // Init Cloud API
    let cloudApi: CloudApi | null = null

    if (!command.noProject) {
      const config: ProjectResource | undefined = await this.getProjectConfig(log, workingDir)

      const cloudDomain = getGardenCloudDomain(config?.domain)
      const distroName = getCloudDistributionName(cloudDomain)

      try {
        cloudApi = await CloudApi.factory({ log, cloudDomain, globalConfigStore })
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

    // Init event & log streaming.
    this.bufferedEventStream = new BufferedEventStream({
      log,
      cloudApi: cloudApi || undefined,
      sessionId,
    })

    registerCleanupFunction("stream-session-cancelled-event", () => {
      if (!this.sessionFinished) {
        this.bufferedEventStream?.streamEvent("sessionCancelled", {})
        this.bufferedEventStream?.flushAll().catch(() => {})
      }
    })

    const coreEventStream = new CoreEventStream({ log, sessionId, globalConfigStore })

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
    let analytics: AnalyticsHandler | undefined = undefined
    let commandStartTime: Date | undefined = undefined

    const prepareParams = {
      log,
      headerLog: log,
      footerLog: log,
      args: parsedArgs,
      opts: parsedOpts,
      cloudApi: cloudApi || undefined,
    }

    const persistent = command.maybePersistent(prepareParams)

    await command.prepare(prepareParams)

    const server = command instanceof ServeCommand ? command.server : undefined

    contextOpts.persistent = persistent
    const { streamEvents, streamLogEntries } = command
    // TODO: Link to Cloud namespace page here.
    const nsLog = log.createLog({ name: "garden" })

    do {
      try {
        if (command.noProject) {
          garden = await makeDummyGarden(workingDir, contextOpts)
        } else {
          garden = await this.getGarden(workingDir, contextOpts)

          if (!gardenEnv.GARDEN_DISABLE_VERSION_CHECK) {
            await garden.emitWarning({
              key: "0.13-bonsai",
              log,
              message:
                chalk.yellow(dedent`Garden v0.13 is a major release with significant changes. Please help us improve it by reporting any issues/bugs here:
              https://github.com/garden-io/garden/issues/new?labels=0.13&template=0-13-issue-template.md&title=0.13%3A+%5BBug%5D%3A`),
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
            await globalConfigStore.update("activeProcesses", String(processRecord.pid), {
              command: command.name,
              sessionId: garden.sessionId,
              persistent,
              serverHost: server?.port ? `http://localhost:${server.port}` : null,
              serverAuthKey: server?.authKey || null,
              projectRoot: garden.projectRoot,
              projectName: garden.projectName,
              environmentName: garden.environmentName,
              namespace: garden.namespace,
            })
          }

          // Connect the core server event streamer (making sure it doesn't stream to the local server)
          const commandServerUrl = server?.getBaseUrl() || undefined
          coreEventStream.connect({ garden, ignoreHost: commandServerUrl, streamEvents, streamLogEntries })
          await coreEventStream.updateTargets()

          if (cloudApi && garden.projectId && !cloudApi.sessionRegistered && command.streamEvents) {
            // Note: If a config change during a watch-mode command's execution results in the resolved environment
            // and/or namespace name changing, we don't change the session ID, environment ID or namespace ID used when
            // streaming events.
            await cloudApi.registerSession({
              sessionId,
              commandInfo,
              localServerPort: server?.port,
              environment: garden.environmentName,
              namespace: garden.namespace,
            })
          }

          if (cloudApi?.sessionRegistered) {
            const distroName = getCloudDistributionName(cloudApi.domain)
            const userId = (await cloudApi.getProfile()).id
            const commandResultUrl = cloudApi.getCommandResultUrl({ sessionId, userId }).href
            const cloudLog = log.createLog({ name: getCloudLogSectionName(distroName) })

            const msg = dedent`🌸  Connected to ${distroName}. View logs and command results at: \n\n${chalk.cyan(
              commandResultUrl
            )}\n`
            cloudLog.info(msg)
          }
        }

        if (cloudApi && garden.projectId) {
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
            const commandInfoPayload = {
              ...commandInfo,
              environmentName: garden.environmentName,
              environmentId: cloudApi.environmentId,
              projectName: garden.projectName,
              projectId: garden.projectId,
              namespaceName: garden.namespace,
              namespaceId: cloudApi.namespaceId,
              coreVersion: getPackageVersion(),
              vcsBranch: garden.vcsInfo.branch,
              vcsCommitHash: garden.vcsInfo.commitHash,
              vcsOriginUrl: garden.vcsInfo.originUrl,
            }
            this.bufferedEventStream.streamEvent("commandInfo", commandInfoPayload)
          }
        }

        // Register log file writers. We need to do this after the Garden class is initialised because
        // the file writers depend on the project root.
        await this.initFileWriters({
          log,
          gardenDirPath: garden.gardenDirPath,
          commandFullName: command.getFullName(),
        })
        analytics = await AnalyticsHandler.init(garden, log)
        analytics.trackCommand(command.getFullName())

        // Note: No reason to await the check
        checkForUpdates(garden.globalConfigStore, log).catch((err) => {
          log.verbose("Something went wrong while checking for the latest Garden version.")
          log.verbose(err)
        })

        await checkForStaticDir()

        commandStartTime = new Date()

        // Check if the command is protected and ask for confirmation to proceed if production flag is "true".
        if (await command.isAllowedToRun(garden, log, parsedOpts)) {
          // TODO: enforce that commands always output DeepPrimitiveMap

          result = await command.action({
            garden,
            cli: this,
            log,
            footerLog: log,
            headerLog: log,
            args: parsedArgs,
            opts: parsedOpts,
          })
        } else {
          // The command is protected and the user decided to not continue with the exectution.
          log.info("\nCommand aborted.")
          result = {}
        }

        // Track the result of the command run
        const allErrors = result.errors || []
        analytics.trackCommandResult(command.getFullName(), allErrors, commandStartTime, result.exitCode)

        // This is a little trick to do a round trip in the event loop, which may be necessary for event handlers to
        // fire, which may be needed to e.g. capture monitors added in event handlers
        await waitForOutputFlush()

        if (garden.monitors.anyMonitorsActive()) {
          // Wait for monitors to exit
          log.debug(chalk.gray("One or more monitors active, waiting until all exit."))
          await garden.monitors.waitUntilStopped()
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

        analytics?.trackCommandResult(command.getFullName(), [err], commandStartTime || new Date(), result.exitCode)

        // flush analytics early since when we throw the instance is not returned
        await analytics?.flush()

        throw err
      } finally {
        if (!result.restartRequired) {
          await coreEventStream.close()
          await server?.close()
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

    const errors: (GardenBaseError | Error)[] = []

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

    if (argv.v || argv.version || argv._[0] === "version") {
      return done(0, getPackageVersion())
    }

    const workingDir = resolve(cwd || process.cwd(), argv.root || "")

    if (!(await pathExists(workingDir))) {
      return done(1, chalk.red(`Could not find specified root path (${argv.root})`))
    }

    let projectConfig: ProjectResource | undefined

    // First look for native Garden commands
    let { command, rest, matchedPath } = pickCommand(Object.values(this.commands), argv._)

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
    const logger = RootLogger.initialize({
      level: parseLogLevel(logLevelStr),
      storeEntries: false,
      displayWriterType: getTerminalWriterType({ silent, output, loggerTypeOpt, commandLoggerType: null }),
      useEmoji: emoji,
      showTimestamps,
      force: this.initLogger,
    })

    const log = logger.createLog()

    // Load custom commands from current project (if applicable) and see if any match the arguments
    if (!command) {
      projectConfig = await this.getProjectConfig(log, workingDir)

      if (projectConfig) {
        const customCommands = await this.getCustomCommands(log, workingDir)
        const picked = pickCommand(customCommands, argv._)
        command = picked.command
        matchedPath = picked.matchedPath
      }
    }

    // If we still haven't found a valid command, print help
    if (!command) {
      const exitCode = argv._.length === 0 || argv._[0] === "help" ? 0 : 1
      return done(exitCode, await this.renderHelp(log, workingDir))
    }

    // Parse the arguments again with the Command set, to fully validate, and to ensure boolean options are
    // handled correctly
    argv = parseCliArgs({ stringArgs: args, command, cli: true })

    // Slice command name from the positional args
    argv._ = argv._.slice(command.getPath().length)

    // Handle -h, --help, and subcommand listings
    if (argv.h || argv.help || command instanceof CommandGroup) {
      // Try to show specific help for given subcommand
      if (command instanceof CommandGroup) {
        for (const subCommand of command.subCommands) {
          const sub = new subCommand()
          if (sub.name === rest[0]) {
            return done(0, sub.renderHelp())
          }
        }
        // If not found, falls through to general command help below
      }
      return done(0, command.renderHelp())
    }

    let parsedArgs: BuiltinArgs & ParameterValues<any>
    let parsedOpts: ParameterValues<any>

    if (command.ignoreOptions) {
      parsedArgs = { $all: args }
      parsedOpts = mapValues(globalOptions, (spec) => spec.getDefaultValue(true))
    } else {
      try {
        const parseResults = processCliArgs({ rawArgs: args, parsedArgs: argv, command, matchedPath, cli: true })
        parsedArgs = parseResults.args
        parsedOpts = parseResults.opts
      } catch (err) {
        errors.push(...(err.detail?.errors || []).map(toGardenError))
        return done(1, err.message + "\n" + command.renderHelp())
      }
    }

    let commandResult: CommandResult<any> | undefined = undefined
    let analytics: AnalyticsHandler | undefined = undefined

    if (!processRecord) {
      processRecord = this.processRecord
    }

    if (!processRecord) {
      const globalConfigStore = new GlobalConfigStore()
      processRecord = await registerProcess(globalConfigStore, command.getFullName(), args)
    }

    this.processRecord = processRecord!

    try {
      const runResults = await this.runCommand({ command, parsedArgs, parsedOpts, processRecord, workingDir, log })
      commandResult = runResults.result
      analytics = runResults.analytics
    } catch (err) {
      commandResult = { errors: [err] }
    }

    errors.push(...(commandResult.errors || []))

    const gardenErrors: GardenBaseError[] = errors.map(toGardenError)

    // Flushes the Analytics events queue in case there are some remaining events.
    await analytics?.flush()

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

    let code = 0
    if (gardenErrors.length > 0) {
      renderCommandErrors(logger, gardenErrors)
      await waitForOutputFlush()
      code = commandResult.exitCode || 1
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
  async getProjectConfig(log: Log, workingDir: string): Promise<ProjectResource | undefined> {
    return findProjectConfig(log, workingDir)
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
