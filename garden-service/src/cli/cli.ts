/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import sywac from "sywac"
import chalk from "chalk"
import { intersection, merge, sortBy } from "lodash"
import { resolve, join } from "path"
import { safeDump } from "js-yaml"
import { coreCommands } from "../commands/commands"
import { DeepPrimitiveMap } from "../config/common"
import { shutdown, sleep, getPackageVersion } from "../util/util"
import { deline } from "../util/string"
import {
  BooleanParameter,
  ChoicesParameter,
  Command,
  CommandResult,
  EnvironmentOption,
  Parameter,
  StringParameter,
} from "../commands/base"
import { GardenError, PluginError, toGardenError } from "../exceptions"
import { Garden, GardenOpts } from "../garden"
import { getLogger, Logger, LoggerType, LOGGER_TYPES, getWriterInstance } from "../logger/logger"
import { LogLevel } from "../logger/log-node"
import { BasicTerminalWriter } from "../logger/writers/basic-terminal-writer"
import { FileWriter, FileWriterConfig } from "../logger/writers/file-writer"

import {
  envSupportsEmoji,
  failOnInvalidOptions,
  negateConflictingParams,
  filterByKeys,
  getArgSynopsis,
  getKeys,
  getOptionSynopsis,
  prepareArgConfig,
  prepareOptionConfig,
  styleConfig,
  getLogLevelChoices,
  parseLogLevel,
  helpTextMaxWidth,
  checkForUpdates,
  checkForStaticDir,
} from "./helpers"
import { defaultEnvironments, ProjectConfig } from "../config/project"
import { ERROR_LOG_FILENAME, DEFAULT_API_VERSION, DEFAULT_GARDEN_DIR_NAME, LOGS_DIR_NAME } from "../constants"
import stringify = require("json-stringify-safe")
import { generateBasicDebugInfoReport } from "../commands/get/get-debug-info"
import { AnalyticsHandler } from "../analytics/analytics"
import { defaultDotIgnoreFiles } from "../util/fs"
import { renderError } from "../logger/renderers"

const OUTPUT_RENDERERS = {
  json: (data: DeepPrimitiveMap) => {
    return stringify(data, null, 2)
  },
  yaml: (data: DeepPrimitiveMap) => {
    return safeDump(data, { noRefs: true, skipInvalid: true })
  },
}

const GLOBAL_OPTIONS_GROUP_NAME = "Global options"
const DEFAULT_CLI_LOGGER_TYPE = "fancy"

/**
 * Dummy Garden class that doesn't scan for modules nor resolves providers.
 * Used by commands that have noProject=true. That is, commands that need
 * to run outside of valid Garden projects.
 */
class DummyGarden extends Garden {
  async resolveProviders() {
    return []
  }
  async scanModules() {}
}

export async function makeDummyGarden(root: string, gardenOpts: GardenOpts = {}) {
  const config: ProjectConfig = {
    path: root,
    apiVersion: DEFAULT_API_VERSION,
    kind: "Project",
    name: "no-project",
    defaultEnvironment: "",
    dotIgnoreFiles: defaultDotIgnoreFiles,
    environments: defaultEnvironments,
    providers: [],
    variables: {},
  }
  gardenOpts.config = config

  return DummyGarden.factory(root, gardenOpts)
}

// The help text for these commands is only displayed when calling `garden options`.
// However, we can't include them with the global options since that causes the CLI
// to exit with code 1 when they're called.
export const HIDDEN_OPTIONS = {
  version: new StringParameter({
    alias: "v",
    help: "Show the current CLI version.",
  }),
  help: new StringParameter({
    alias: "h",
    help: "Show help",
  }),
}

export const GLOBAL_OPTIONS = {
  "root": new StringParameter({
    alias: "r",
    help: "Override project root directory (defaults to working directory).",
    defaultValue: process.cwd(),
  }),
  "silent": new BooleanParameter({
    alias: "s",
    help: "Suppress log output. Same as setting --logger-type=quiet.",
    defaultValue: false,
  }),
  "env": new EnvironmentOption(),
  "logger-type": new ChoicesParameter({
    choices: [...LOGGER_TYPES],
    help: deline`
      Set logger type.

      ${chalk.bold("fancy:")} updates log lines in-place when their status changes (e.g. when tasks complete),

      ${chalk.bold("basic:")} appends a new log line when a log line's status changes,

      ${chalk.bold("json:")} same as basic, but renders log lines as JSON,

      ${chalk.bold("quiet:")} suppresses all log output, same as --silent.
    `,
  }),
  "log-level": new ChoicesParameter({
    alias: "l",
    choices: getLogLevelChoices(),
    help: deline`
      Set logger level. Values can be either string or numeric and are prioritized from 0 to 5
      (highest to lowest) as follows: error: 0, warn: 1, info: 2, verbose: 3, debug: 4, silly: 5.`,
    hints: "[choice] [default: info] [error || 0, warn || 1, info || 2, verbose || 3, debug || 4, silly || 5]",
    defaultValue: LogLevel[LogLevel.info],
  }),
  "output": new ChoicesParameter({
    alias: "o",
    choices: Object.keys(OUTPUT_RENDERERS),
    help: "Output command result in specified format (note: disables progress logging and interactive functionality).",
  }),
  "emoji": new BooleanParameter({
    help: "Enable emoji in output (defaults to true if the environment supports it).",
    defaultValue: envSupportsEmoji(),
  }),
  "yes": new BooleanParameter({
    alias: "y",
    help: "Automatically approve any yes/no prompts during execution.",
    defaultValue: false,
  }),
}

export type GlobalOptions = typeof GLOBAL_OPTIONS

function initLogger({ level, loggerType, emoji }: { level: LogLevel; loggerType: LoggerType; emoji: boolean }) {
  const writer = getWriterInstance(loggerType, level)
  const writers = writer ? [writer] : undefined
  return Logger.initialize({ level, writers, useEmoji: emoji })
}

export interface ParseResults {
  argv: any
  code: number
  errors: (GardenError | Error)[]
  result: any
}

interface SywacParseResults extends ParseResults {
  output: string
  details: { logger: Logger; result?: CommandResult; analytics?: AnalyticsHandler }
}

export class GardenCli {
  private program: any
  private commands: { [key: string]: Command } = {}
  private fileWritersInitialized: boolean = false

  constructor() {
    const version = getPackageVersion()
    this.program = sywac
      .help("-h, --help", {
        hidden: true,
      })
      .version("-v, --version", {
        version,
        hidden: true,
      })
      .showHelpByDefault()
      .check((argv, _ctx) => {
        // NOTE: Need to mutate argv!
        merge(argv, negateConflictingParams(argv, GLOBAL_OPTIONS))
      })
      .outputSettings({ maxWidth: helpTextMaxWidth() })
      .style(styleConfig)

    const commands = sortBy(coreCommands, (c) => c.name)
    const globalOptions = Object.entries(GLOBAL_OPTIONS)

    commands.forEach((command) => this.addCommand(command, this.program))
    globalOptions.forEach(([key, opt]) => this.addGlobalOption(key, opt))
  }

  async initFileWriters(logger: Logger, root: string, gardenDirPath: string) {
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

  addGlobalOption(key: string, option: Parameter<any>): void {
    this.program.option(getOptionSynopsis(key, option), {
      ...prepareOptionConfig(option),
      group: GLOBAL_OPTIONS_GROUP_NAME,
      hidden: true,
    })
  }

  addCommand(command: Command, program): void {
    const fullName = command.getFullName()

    if (this.commands[fullName]) {
      // For now we don't allow multiple definitions of the same command. We may want to revisit this later.
      throw new PluginError(`Multiple definitions of command "${fullName}"`, {})
    }

    this.commands[fullName] = command

    const { arguments: args = {}, options = {} } = command

    const argKeys = getKeys(args)
    const optKeys = getKeys(options)
    const globalKeys = getKeys(GLOBAL_OPTIONS)
    const dupKeys: string[] = intersection(optKeys, globalKeys)

    if (dupKeys.length > 0) {
      throw new PluginError(`Global option(s) ${dupKeys.join(" ")} cannot be redefined`, {})
    }

    const action = async (argv, cliContext) => {
      // Sywac returns positional args and options in a single object which we separate into args and opts
      // We include the "rest" parameter (`_`) in the arguments passed to the command handler
      const parsedArgs = { _: argv._, ...filterByKeys(argv, argKeys) }
      const parsedOpts = filterByKeys(argv, optKeys.concat(globalKeys))
      const root = resolve(process.cwd(), parsedOpts.root)
      const { "logger-type": loggerTypeOpt, "log-level": logLevel, emoji, env, silent, output } = parsedOpts

      let loggerType = loggerTypeOpt || command.loggerType || DEFAULT_CLI_LOGGER_TYPE

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

      const contextOpts: GardenOpts = {
        commandInfo: {
          name: command.getFullName(),
          args: parsedArgs,
          opts: parsedOpts,
        },
        environmentName: env,
        log,
      }

      let garden: Garden
      let result: any

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
          // Register log file writers. We need to do this after the Garden class is initialised because
          // the file writers depend on the project root.
          await this.initFileWriters(logger, garden.projectRoot, garden.gardenDirPath)
          const analytics = await AnalyticsHandler.init(garden, log)
          await analytics.trackCommand(command.getFullName())

          cliContext.details.analytics = analytics

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

      // We attach the action result to cli context so that we can process it in the parse method
      cliContext.details.result = result
    }

    // Command specific positional args and options are set inside the builder function
    const setup = (parser) => {
      const subCommands = command.getSubCommands()
      subCommands.forEach((subCommand) => this.addCommand(subCommand, parser))

      argKeys.forEach((key) => parser.positional(getArgSynopsis(key, args[key]), prepareArgConfig(args[key])))
      optKeys.forEach((key) => parser.option(getOptionSynopsis(key, options[key]), prepareOptionConfig(options[key])))

      // We only check for invalid flags for the last command since it might contain flags that
      // the parent is unaware of, thus causing the check to fail for the parent
      if (subCommands.length < 1) {
        parser.check(failOnInvalidOptions)
      }
      return parser
    }

    const commandConfig = {
      setup,
      aliases: command.alias,
      desc: command.help,
      hidden: command.hidden,
      run: action,
    }

    program.command(command.name, commandConfig)
  }

  async parse(args?: string[]): Promise<ParseResults> {
    const parseResult: SywacParseResults = await this.program.parse(args)
    const { argv, details, errors, output: cliOutput } = parseResult
    const { result: commandResult } = details
    const { output } = argv
    let { code } = parseResult
    let logger: Logger

    // Note: Circumvents an issue where the process exits before the output is fully flushed.
    // Needed for output renderers and Winston (see: https://github.com/winstonjs/winston/issues/228)
    const waitForOutputFlush = () => sleep(100)

    // Logger might not have been initialised if process exits early
    try {
      logger = getLogger()
    } catch (_) {
      logger = Logger.initialize({
        level: LogLevel.info,
        writers: [new BasicTerminalWriter()],
      })
    }

    // Flushes the Analytics events queue in case there are some remaining events.
    const { analytics } = details
    if (analytics) {
      await analytics.flush()
    }

    // --help or --version options were called so we log the cli output and exit
    if (cliOutput && errors.length < 1) {
      logger.stop()
      // tslint:disable-next-line: no-console
      console.log(cliOutput)

      // fix issue where sywac returns exit code 0 even when a command doesn't exist
      if (!argv.h && !argv.v) {
        code = 1
      }

      process.exit(code)
    }

    const gardenErrors: GardenError[] = errors.map(toGardenError).concat((commandResult && commandResult.errors) || [])

    // --output option set
    if (output) {
      const renderer = OUTPUT_RENDERERS[output]
      if (gardenErrors.length > 0) {
        // tslint:disable-next-line: no-console
        console.error(renderer({ success: false, errors: gardenErrors }))
      } else {
        // tslint:disable-next-line: no-console
        console.log(renderer({ success: true, ...commandResult }))
      }
      await waitForOutputFlush()
    }

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

    logger.stop()
    return { argv, code, errors, result: commandResult?.result }
  }
}

export async function run(): Promise<void> {
  let code: number | undefined
  try {
    const cli = new GardenCli()
    const result = await cli.parse()
    code = result.code
  } catch (err) {
    // tslint:disable-next-line: no-console
    console.log(err)
    code = 1
  } finally {
    shutdown(code)
  }
}
