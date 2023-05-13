/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Joi from "@hapi/joi"
import chalk from "chalk"
import dedent from "dedent"
import stripAnsi from "strip-ansi"
import { mapValues, memoize, pickBy, size } from "lodash"

import { createSchema, joi } from "../config/common"
import { InternalError, RuntimeError, GardenBaseError } from "../exceptions"
import { Garden } from "../garden"
import { Log } from "../logger/log-entry"
import { LoggerType, LoggerBase, LoggerConfigBase, eventLogLevel } from "../logger/logger"
import { printFooter, renderMessageWithDivider } from "../logger/util"
import { GraphResultMapWithoutTask } from "../graph/results"
import { capitalize } from "lodash"
import { getCloudDistributionName, getCloudLogSectionName, getPackageVersion, userPrompt } from "../util/util"
import { renderOptions, renderCommands, renderArguments, cliStyles, optionsWithAliasValues } from "../cli/helpers"
import { GlobalOptions, ParameterValues, Parameters, globalOptions } from "../cli/params"
import { GardenCli } from "../cli/cli"
import { CommandLine } from "../cli/command-line"
import { SolveResult } from "../graph/solver"
import { waitForOutputFlush } from "../process"
import { BufferedEventStream } from "../cloud/buffered-event-stream"
import { CommandInfo } from "../plugin-context"
import type { GardenServer } from "../server/server"
import { CloudSession } from "../cloud/api"

export interface CommandConstructor {
  new (parent?: CommandGroup): Command
}

export interface CommandResult<T = any> {
  result?: T
  errors?: GardenBaseError[]
  exitCode?: number
}

export interface BuiltinArgs {
  // The raw unprocessed arguments
  "$all"?: string[]
  // Everything following -- on the command line
  "--"?: string[]
}

export interface CommandParamsBase<T extends Parameters = {}, U extends Parameters = {}> {
  args: ParameterValues<T> & BuiltinArgs
  opts: ParameterValues<GlobalOptions & U>
}

export interface PrintHeaderParams<T extends Parameters = {}, U extends Parameters = {}>
  extends CommandParamsBase<T, U> {
  log: Log
}

export interface PrepareParams<T extends Parameters = {}, U extends Parameters = {}> extends CommandParamsBase<T, U> {
  log: Log
  commandLine?: CommandLine
  // The ServeCommand or DevCommand when applicable
  parentCommand?: Command
}

export interface CommandParams<T extends Parameters = {}, U extends Parameters = {}> extends PrepareParams<T, U> {
  cli?: GardenCli
  garden: Garden
}

export interface RunCommandParams<A extends Parameters = {}, O extends Parameters = {}> extends CommandParams<A, O> {
  sessionId: string
  nested: boolean // Set to true if running in dev command or WS server
}

type DataCallback = (data: string) => void

export abstract class Command<A extends Parameters = {}, O extends Parameters = {}, R = any> {
  abstract name: string
  abstract help: string

  description?: string
  aliases?: string[]

  allowUndefinedArguments: boolean = false
  arguments: A
  options: O
  _resultType: R

  outputsSchema?: () => Joi.ObjectSchema

  cliOnly: boolean = false
  hidden: boolean = false
  noProject: boolean = false
  protected: boolean = false
  streamEvents: boolean = false // Set to true to stream events for the command
  streamLogEntries: boolean = false // Set to true to stream log entries for the command
  isCustom: boolean = false // Used to identify custom commands
  isDevCommand: boolean = false // Set to true for internal commands in interactive command-line commands
  ignoreOptions: boolean = false // Completely ignore all option flags and pass all arguments directly to the command

  subscribers: DataCallback[]
  terminated: boolean
  public server?: GardenServer

  // FIXME: The parent command is not set via the constructor but rather needs to be set "manually" after
  // the command class has been initialised.
  // E.g: const cmd = new Command(); cmd["parent"] = parentCommand.
  // This is so that commands that are initialised via arguments can be cloned which is required
  // for the websocket server to work properly.
  private parent?: CommandGroup

  // FIXME: This is a little hack so that we can clone commands that are initialised with
  // arbitrary parameters.
  // See also comment above on the "parent" property.
  constructor(private _params?: any) {
    this.subscribers = []
    this.terminated = false

    const commandName = this.getFullName()

    // Make sure arguments and options don't have overlapping key names.
    if (this.arguments && this.options) {
      for (const key of Object.keys(this.options)) {
        if (key in this.arguments) {
          throw new InternalError(`Key ${key} is defined in both options and arguments for command ${commandName}`, {
            commandName,
            key,
          })
        }
      }
    }

    const args = Object.values(this.arguments || [])
    let foundOptional = false

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]

      // Make sure arguments don't have default values
      if (arg.defaultValue) {
        throw new InternalError(`A positional argument cannot have a default value`, {
          commandName,
          arg,
        })
      }

      if (arg.required) {
        // Make sure required arguments don't follow optional ones
        if (foundOptional) {
          throw new InternalError(`A required argument cannot follow an optional one`, {
            commandName,
            arg,
          })
        }
      } else {
        foundOptional = true
      }

      // Make sure only last argument is spread
      if (arg.spread && i < args.length - 1) {
        throw new InternalError(`Only the last command argument can set spread to true`, {
          commandName,
          arg,
        })
      }
    }
  }

  /**
   * Shorthand helper to call the action method on the given command class.
   * Also validates the result against the outputsSchema on the command, if applicable.
   *
   * @returns The result from the command action
   */
  async run({
    garden: parentGarden,
    args,
    opts,
    cli,
    commandLine,
    sessionId,
    nested,
    parentCommand,
  }: RunCommandParams<A, O>): Promise<CommandResult<R>> {
    const commandStartTime = new Date()
    const server = this.server

    let garden = parentGarden
    let parentSessionId: string | undefined

    if (nested) {
      // Make an instance clone to override anything that needs to be scoped to a specific command run
      // TODO: this could be made more elegant
      garden = parentGarden.cloneForCommand(sessionId)
      parentSessionId = parentGarden.sessionId
    }

    const log = garden.log
    let cloudSession: CloudSession | undefined

    if (garden.cloudApi && garden.projectId && this.streamEvents) {
      cloudSession = await garden.cloudApi.registerSession({
        parentSessionId,
        sessionId: garden.sessionId,
        projectId: garden.projectId,
        commandInfo: garden.commandInfo,
        localServerPort: server?.port,
        environment: garden.environmentName,
        namespace: garden.namespace,
      })
    }

    if (cloudSession) {
      const distroName = getCloudDistributionName(cloudSession.api.domain)
      const userId = (await cloudSession.api.getProfile()).id
      const commandResultUrl = cloudSession.api.getCommandResultUrl({
        sessionId: garden.sessionId,
        projectId: cloudSession.projectId,
        userId,
      }).href
      const cloudLog = log.createLog({ name: getCloudLogSectionName(distroName) })

      const msg = dedent`🌸  Connected to ${distroName}. View logs and command results at: \n\n${chalk.cyan(
        commandResultUrl
      )}\n`
      cloudLog.info(msg)
    }

    const analytics = await garden.getAnalyticsHandler()
    analytics.trackCommand(this.getFullName())

    const allOpts = <ParameterValues<GlobalOptions & O>>{
      ...mapValues(globalOptions, (opt) => opt.defaultValue),
      ...opts,
    }

    const commandInfo: CommandInfo = {
      name: this.getFullName(),
      args,
      opts: optionsWithAliasValues(this, allOpts),
    }

    const cloudEventStream = new BufferedEventStream({
      log,
      cloudSession,
      maxLogLevel: eventLogLevel,
      garden,
      streamEvents: this.streamEvents,
      streamLogEntries: this.streamLogEntries,
    })

    let result: CommandResult<R>

    try {
      if (cloudSession && this.streamEvents) {
        log.silly(`Connecting Garden instance events to Cloud API`)
        cloudEventStream.emit("commandInfo", {
          ...commandInfo,
          environmentName: garden.environmentName,
          environmentId: cloudSession.environmentId,
          projectName: garden.projectName,
          projectId: cloudSession.projectId,
          namespaceName: garden.namespace,
          namespaceId: cloudSession.namespaceId,
          coreVersion: getPackageVersion(),
          vcsBranch: garden.vcsInfo.branch,
          vcsCommitHash: garden.vcsInfo.commitHash,
          vcsOriginUrl: garden.vcsInfo.originUrl,
        })
      }

      // Check if the command is protected and ask for confirmation to proceed if production flag is "true".
      if (await this.isAllowedToRun(garden, log, allOpts)) {
        // Clear the VCS handler's tree cache to make sure we pick up any changed sources.
        // FIXME: use file watching to be more surgical here, this is suboptimal
        garden.treeCache.invalidateDown(log, ["path"])

        log.silly(`Starting command '${this.getFullName()}' action`)
        result = await this.action({
          garden,
          cli,
          log,
          args,
          opts: allOpts,
          commandLine,
          parentCommand,
        })
        log.silly(`Completed command '${this.getFullName()}' action successfully`)
      } else {
        // The command is protected and the user decided to not continue with the exectution.
        log.info("\nCommand aborted.")
        return {}
      }

      // Track the result of the command run
      const allErrors = result.errors || []
      analytics.trackCommandResult(this.getFullName(), allErrors, commandStartTime, result.exitCode)

      cloudEventStream.emit("sessionCompleted", {})
    } catch (err) {
      analytics.trackCommandResult(this.getFullName(), [err], commandStartTime || new Date(), 1)
      cloudEventStream.emit("sessionFailed", {})
      throw err
    } finally {
      if (nested) {
        garden.close()
        parentGarden.nestedSessions.delete(sessionId)
      }
      await cloudEventStream.close()
    }

    // This is a little trick to do a round trip in the event loop, which may be necessary for event handlers to
    // fire, which may be needed to e.g. capture monitors added in event handlers
    await waitForOutputFlush()

    return result
  }

  getFullName(): string {
    return !!this.parent ? `${this.parent.getFullName()} ${this.name}` : this.name
  }

  getPath(): string[] {
    return !!this.parent ? [...this.parent.getPath(), this.name] : [this.name]
  }

  /**
   * Returns all paths that this command should match, including all aliases and permutations of those.
   */
  getPaths(): string[][] {
    if (this.parent) {
      const parentPaths = this.parent.getPaths()

      if (this.aliases) {
        return parentPaths.flatMap((parentPath) => [
          [...parentPath, this.name],
          ...this.aliases!.map((a) => [...parentPath, a]),
        ])
      } else {
        return parentPaths.map((parentPath) => [...parentPath, this.name])
      }
    } else if (this.aliases) {
      return [[this.name], ...this.aliases.map((a) => [a])]
    } else {
      return [[this.name]]
    }
  }

  getTerminalWriterType(_: CommandParamsBase<A, O>): LoggerType {
    return "default"
  }

  describe() {
    const { name, help, description, cliOnly } = this

    return {
      name,
      fullName: this.getFullName(),
      help,
      description: description ? stripAnsi(description) : undefined,
      cliOnly,
      arguments: describeParameters(this.arguments),
      options: describeParameters(this.options),
      outputsSchema: this.outputsSchema,
    }
  }

  /**
   * Called to check if the command might run persistently, with the given args/opts
   */
  maybePersistent(_: PrepareParams<A, O>) {
    return false
  }

  /**
   * Called to check if the command can be run in the dev console, with the given args/opts
   */
  allowInDevCommand(_: PrepareParams<A, O>) {
    return true
  }

  /**
   * Called by the CLI before the command's action is run, but is not called again
   * if the command restarts. Useful for commands in watch mode.
   */
  async prepare(_: PrepareParams<A, O>): Promise<void> {}

  /**
   * Called by e.g. the WebSocket server to terminate persistent commands.
   */
  terminate() {
    this.terminated = true
  }

  /**
   * Subscribe to any data emitted by commands via the .emit() method
   */
  subscribe(cb: (data: string) => void) {
    this.subscribers.push(cb)
  }

  /**
   * Emit data to all subscribers
   */
  emit(log: Log, data: string) {
    for (const subscriber of this.subscribers) {
      // Ignore any errors here
      try {
        subscriber(data)
      } catch (err) {
        log.debug(`Error when calling subscriber on ${this.getFullName()} command: ${err.message}`)
      }
    }
  }

  printHeader(_: PrintHeaderParams<A, O>) {}

  /**
   * Allow commands to specify what logger to use when executed by the server.
   *
   * Used e.g. by the logs command to disable logging for server requests since
   * the log entries are emitted as events.
   */
  getServerLogger(_?: LoggerConfigBase): LoggerBase | void {}

  /**
   * Helper function for creating a new instance of the command.
   * Used e.g. by the server to ensure that each request gets a unique command instance
   * so that subscribers are managed properly.
   */
  clone(): Command {
    // See: https://stackoverflow.com/a/64638986
    const clone = new (this.constructor as new (params?: any) => this)(this._params)
    if (this.parent) {
      clone["parent"] = this.parent
    }
    return clone
  }

  // Note: Due to a current TS limitation (apparently covered by https://github.com/Microsoft/TypeScript/issues/7011),
  // subclass implementations need to explicitly set the types in the implemented function signature. So for now we
  // can't enforce the types of `args` and `opts` automatically at the abstract class level and have to specify
  // the types explicitly on the subclassed methods.
  abstract action(params: CommandParams<A, O>): Promise<CommandResult<R>>

  /**
   * Called on all commands and checks if the command is protected.
   * If it's a protected command, the environment is "production" and the user hasn't specified the "--yes/-y" option
   * it asks for confirmation to proceed.
   *
   * @param {Garden} garden
   * @param {Log} log
   * @param {GlobalOptions} opts
   * @returns {Promise<Boolean>}
   * @memberof Command
   */
  async isAllowedToRun(garden: Garden, log: Log, opts: ParameterValues<GlobalOptions>): Promise<Boolean> {
    if (!opts.yes && this.protected && garden.production) {
      const defaultMessage = chalk.yellow(dedent`
        Warning: you are trying to run "garden ${this.getFullName()}" against a production environment ([${
        garden.environmentName
      }])!
          Are you sure you want to continue? (run the command with the "--yes" flag to skip this check).

      `)
      const answer = await userPrompt({
        name: "continue",
        message: defaultMessage,
        type: "confirm",
        default: false,
      })

      log.info("")

      return answer.continue
    }

    return true
  }

  renderHelp() {
    let out = this.description
      ? `\n${cliStyles.heading("DESCRIPTION")}\n\n${chalk.dim(this.description.trim())}\n\n`
      : ""

    out += `${cliStyles.heading("USAGE")}\n  garden ${this.getFullName()} `

    if (this.arguments) {
      out +=
        Object.entries(this.arguments)
          .map(([name, param]) => cliStyles.usagePositional(name, param.required, param.spread))
          .join(" ") + " "
    }

    out += cliStyles.optionsPlaceholder()

    if (this.arguments) {
      const table = renderArguments(this.arguments)
      out += `\n\n${cliStyles.heading("ARGUMENTS")}\n${table}`
    }

    if (this.options) {
      const table = renderOptions(this.options)
      out += `\n\n${cliStyles.heading("OPTIONS")}\n${table}`
    }

    return out + "\n"
  }
}

export abstract class ConsoleCommand<A extends Parameters = {}, O extends Parameters = {}, R = any> extends Command<
  A,
  O,
  R
> {
  isDevCommand = true
}

export abstract class CommandGroup extends Command {
  abstract subCommands: CommandConstructor[]

  getSubCommands(): Command[] {
    return this.subCommands.flatMap((cls) => {
      const cmd = new cls()
      cmd["parent"] = this
      if (cmd instanceof CommandGroup) {
        return cmd.getSubCommands()
      } else {
        return [cmd]
      }
    })
  }

  printHeader() {}

  async action() {
    return {}
  }

  describe() {
    const description = super.describe()
    const subCommands = this.getSubCommands().map((c) => c.describe())

    return {
      ...description,
      subCommands,
    }
  }

  renderHelp() {
    const commands = this.getSubCommands()

    return `
${cliStyles.heading("USAGE")}
  garden ${this.getFullName()} ${cliStyles.commandPlaceholder()} ${cliStyles.optionsPlaceholder()}

${cliStyles.heading("COMMANDS")}
${renderCommands(commands)}
`
  }
}

export function printResult({
  log,
  result,
  success,
  description,
}: {
  log: Log
  result: string
  success: boolean
  description: string
}) {
  const prefix = success ? `${capitalize(description)} output:` : `${capitalize(description)} failed with error:`
  const msg = renderMessageWithDivider({ prefix, msg: result, isError: !success })
  success ? log.info(chalk.white(msg)) : log.error(msg)
}

export interface ProcessCommandResult {
  aborted: boolean
  success: boolean
  error?: string
  graphResults: GraphResultMapWithoutTask
}

export const processCommandResultKeys = () => ({
  aborted: joi
    .boolean()
    .description(
      "Set to true if the action was not attempted, e.g. if a dependency failed or parameters were incorrect."
    ),
  // durationMsec: joi.number().integer().description("The duration of the processing in msec, if applicable."),
  success: joi.boolean().required().description("Whether the action was succeessful."),
  error: joi.string().description("An error message, if the action failed."),
})

export const graphResultsSchema = memoize(() =>
  joi
    .object()
    .description(
      "A map of all raw graph results. Avoid using this programmatically if you can, and use more structured keys instead."
    )
    .meta({ keyPlaceholder: "<key>" })
)

export const processCommandResultSchema = createSchema({
  name: "process-command-result",
  keys: () => ({
    aborted: joi.boolean().description("Set to true if the command execution was aborted."),
    success: joi.boolean().description("Set to false if the command execution was unsuccessful."),
    graphResults: graphResultsSchema(),
  }),
})

/**
 * Handles the command result and logging for commands the return results of type ProcessResults.
 * This applies to commands that can run in watch mode.
 */
export async function handleProcessResults(
  garden: Garden,
  log: Log,
  taskType: string,
  results: SolveResult
): Promise<CommandResult<ProcessCommandResult>> {
  const graphResults = results.results.export()

  const failed = pickBy(graphResults, (r) => r && r.error)
  const failedCount = size(failed)

  const success = failedCount === 0

  const result: ProcessCommandResult = {
    aborted: false,
    success,
    graphResults,
  }

  if (!success) {
    const error = new RuntimeError(`${failedCount} ${taskType} action(s) failed!`, { results: failed })
    return { result, errors: [error] }
  }

  await waitForOutputFlush()

  if (garden.monitors.getAll().length === 0) {
    printFooter(log)
  }

  return {
    result,
  }
}

export function describeParameters(args?: Parameters) {
  if (!args) {
    return
  }
  return Object.entries(args)
    .filter(([_, arg]) => !arg.hidden)
    .map(([argName, arg]) => ({
      name: argName,
      usageName: arg.required ? `<${argName}>` : `[${argName}]`,
      ...arg,
      help: stripAnsi(arg.help),
    }))
}
