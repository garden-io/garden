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
import { shutdown, sleep, getPackageVersion, registerCleanupFunction, getCloudDistributionName } from "../util/util"
import { Command, CommandResult, CommandGroup, BuiltinArgs } from "../commands/base"
import { PluginError, toGardenError, GardenBaseError } from "../exceptions"
import { Garden, GardenOpts, DummyGarden } from "../garden"
import { Logger, LoggerType, LogLevel, parseLogLevel } from "../logger/logger"
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
  EnvironmentConfig,
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
import { printEmoji, renderDivider } from "../logger/util"
import { GardenProcess, GlobalConfigStore } from "../config-store/global"
import { registerProcess } from "../process"
import { ServeCommand } from "../commands/serve"
import { uuidv4 } from "../util/random"
import { SemVer } from "semver"

export async function makeDummyGarden(root: string, gardenOpts: GardenOpts) {
  const environments: EnvironmentConfig[] = gardenOpts.environmentName
    ? [{ name: parseEnvironment(gardenOpts.environmentName).environment, defaultNamespace, variables: {} }]
    : [{ defaultNamespace: "default", name: "default", variables: {} }]

  const config: ProjectConfig = {
    path: root,
    apiVersion: DEFAULT_API_VERSION,
    kind: "Project",
    name: "no-project",
    defaultEnvironment: "",
    dotIgnoreFile: defaultDotIgnoreFile,
    environments,
    providers: [],
    variables: {},
  }
  gardenOpts.config = config

  return DummyGarden.factory(root, { noEnterprise: true, ...gardenOpts })
}

function renderHeader({
  environmentName,
  namespaceName,
  log,
}: {
  environmentName: string
  namespaceName: string
  log: Log
}) {
  const divider = chalk.gray(renderDivider())
  let msg = `${printEmoji("🌍", log)}  Running in namespace ${chalk.cyan(namespaceName)} in environment ${chalk.cyan(
    environmentName
  )}`

  return dedent`
    ${divider}
    ${msg}
    ${divider}\n
  `
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
    logger,
    log,
    gardenDirPath,
    commandFullName,
  }: {
    logger: Logger
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

    const logger = Logger.initialize({
      level,
      storeEntries: false,
      type: loggerType,
      useEmoji: emoji,
      showTimestamps,
    })

    // Currently we initialise empty placeholder entries and pass those to the
    // framework as opposed to the logger itself. This is to give better control over where on
    // the screen the logs are printed.
    // TODO: Remove header and footer logs. Not needed any more.
    const headerLog = logger.makeNewLogContext()
    const log = logger.makeNewLogContext()
    const footerLog = logger.makeNewLogContext()

    // TODO: remove for the proper 0.13 release
    if (!gardenEnv.GARDEN_DISABLE_VERSION_CHECK && new SemVer(getPackageVersion()).minor === 13) {
      log.warn(
        chalk.yellow(dedent`Garden Bonsai (0.13) is in beta. Please report any issues here:
          https://github.com/garden-io/garden/issues/new?labels=0.13&template=0-13-issue-template.md&title=0.13%3A+%5BBug%5D%3A`)
      )
    }

    const globalConfigStore = new GlobalConfigStore()

    await validateRuntimeRequirementsCached(log, globalConfigStore, checkRequirements)

    command.printHeader({ headerLog, args: parsedArgs, opts: parsedOpts })
    const sessionId = uuidv4()

    // Init Cloud API
    let cloudApi: CloudApi | null = null

    if (!command.noProject) {
      const config: ProjectResource | undefined = await this.getProjectConfig(log, workingDir)

      const cloudDomain = getGardenCloudDomain(config)
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
    let analytics: AnalyticsHandler

    const prepareParams = {
      log,
      headerLog,
      footerLog,
      args: parsedArgs,
      opts: parsedOpts,
      cloudApi: cloudApi || undefined,
    }

    const persistent = command.isPersistent(prepareParams)

    await command.prepare(prepareParams)

    const server = command instanceof ServeCommand ? command.server : undefined

    contextOpts.persistent = persistent
    const { streamEvents, streamLogEntries } = command
    // TODO: Link to Cloud namespace page here.
    const nsLog = headerLog.makeNewLogContext({})

    do {
      try {
        if (command.noProject) {
          garden = await makeDummyGarden(workingDir, contextOpts)
        } else {
          garden = await this.getGarden(workingDir, contextOpts)

          nsLog.info(renderHeader({ namespaceName: garden.namespace, environmentName: garden.environmentName, log }))

          if (!cloudApi && garden.projectId) {
            log.warn({
              symbol: "warning",
              msg: `You are not logged in into Garden Cloud. Please log in via the ${chalk.green(
                "garden login"
              )} command.`,
            })
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
            const msg = dedent`
              \n${printEmoji("🌩️", log)}   ${chalk.cyan(
              `Connected to ${distroName}! Click the link below to view logs and command results.`
            )}
              ${printEmoji("🔗", log)}  ${chalk.blueBright.underline(commandResultUrl)}
            `
            footerLog.info(msg)
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
          logger,
          log,
          gardenDirPath: garden.gardenDirPath,
          commandFullName: command.getFullName(),
        })
        analytics = await AnalyticsHandler.init(garden, log)
        analytics.trackCommand(command.getFullName())

        // Note: No reason to await the check
        checkForUpdates(garden.globalConfigStore, headerLog).catch((err) => {
          headerLog.verbose("Something went wrong while checking for the latest Garden version.")
          headerLog.verbose(err)
        })

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
          log.info("\nCommand aborted.")
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

    // Note: Circumvents an issue where the process exits before the output is fully flushed.
    // Needed for output renderers and Winston (see: https://github.com/winstonjs/winston/issues/228)
    const waitForOutputFlush = () => sleep(100)

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

    // Logger might not have been initialised if process exits early
    const logger = Logger.initialize({
      level: LogLevel.info,
      type: "default",
      storeEntries: false,
    })

    const log = logger.makeNewLogContext()

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
      const globalConfigStore = new GlobalConfigStore()
      processRecord = await registerProcess(globalConfigStore, command.getFullName(), args)
    }

    this.processRecord = processRecord!

    const commandStartTime = new Date()

    try {
      const runResults = await this.runCommand({ command, parsedArgs, parsedOpts, processRecord, workingDir })
      commandResult = runResults.result
      analytics = runResults.analytics
    } catch (err) {
      commandResult = { errors: [err] }
    }

    errors.push(...(commandResult.errors || []))

    const gardenErrors: GardenBaseError[] = errors.map(toGardenError)

    analytics?.trackCommandResult(command.getFullName(), gardenErrors, commandStartTime)

    // Flushes the Analytics events queue in case there are some remaining events.
    if (analytics) {
      await analytics.flush()
    }

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
