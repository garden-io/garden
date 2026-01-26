/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type Joi from "@hapi/joi"
import dedent from "dedent"
import stripAnsi from "strip-ansi"
import { flatMap, fromPairs, mapValues, pickBy, size } from "lodash-es"
import type { PrimitiveMap } from "../config/common.js"
import { createSchema, joi, joiArray, joiIdentifierMap, joiStringMap, joiVariables } from "../config/common.js"
import type { GardenError } from "../exceptions.js"
import { InternalError, RuntimeError, toGardenError } from "../exceptions.js"
import type { Garden } from "../garden.js"
import type { Log } from "../logger/log-entry.js"
import type { LoggerBase, LoggerConfigBase, LogLevel } from "../logger/logger.js"
import { printEmoji, printFooter } from "../logger/util.js"
import { getDurationMsec, getPackageVersion, userPrompt } from "../util/util.js"
import { cliStyles, optionsWithAliasValues, renderArguments, renderCommands, renderOptions } from "../cli/helpers.js"
import type { GlobalOptions, ParameterObject, ParameterValues } from "../cli/params.js"
import { globalOptions } from "../cli/params.js"
import type { GardenCli } from "../cli/cli.js"
import type { CommandLine } from "../cli/command-line.js"
import type { SolveResult } from "../graph/solver.js"
import { waitForOutputFlush } from "../process.js"
import type { CommandInfo } from "../plugin-context.js"
import type { GardenServer } from "../server/server.js"
import type { CloudSessionLegacy } from "../cloud/api-legacy/api.js"
import type { DeployState, ForwardablePort, ServiceIngress } from "../types/service.js"
import { deployStates, forwardablePortSchema, serviceIngressSchema } from "../types/service.js"
import type { GraphResultMapWithoutTask, GraphResults, GraphResultWithoutTask } from "../graph/results.js"
import { splitFirst } from "../util/string.js"
import { type ActionMode, type ActionState, actionStates } from "../actions/types.js"
import type { AnalyticsHandler } from "../analytics/analytics.js"
import { withSessionContext } from "../util/open-telemetry/context.js"
import { wrapActiveSpan } from "../util/open-telemetry/spans.js"
import { styles } from "../logger/styles.js"
import { clearVarfileCache } from "../config/base.js"
import { createCloudEventStream, getCloudLogSectionName } from "../cloud/util.js"

export interface CommandConstructor {
  new (parent?: CommandGroup): Command
}

export interface CommandResult<T = any> {
  result?: T
  errors?: GardenError[]
  exitCode?: number
}

export interface BuiltinArgs {
  // The raw unprocessed arguments
  "$all"?: string[]
  // Everything following -- on the command line
  "--"?: string[]
}

export interface CommandParamsBase<
  T extends ParameterObject = ParameterObject,
  U extends ParameterObject = ParameterObject,
> {
  args: ParameterValues<T> & BuiltinArgs
  opts: ParameterValues<U & GlobalOptions>
}

export interface PrintHeaderParams<
  T extends ParameterObject = ParameterObject,
  U extends ParameterObject = ParameterObject,
> extends CommandParamsBase<T, U> {
  log: Log
}

export interface PrepareParams<T extends ParameterObject = ParameterObject, U extends ParameterObject = ParameterObject>
  extends CommandParamsBase<T, U> {
  log: Log
  commandLine?: CommandLine
  // The ServeCommand or DevCommand when applicable
  parentCommand?: Command
}

export interface CommandParams<T extends ParameterObject = ParameterObject, U extends ParameterObject = ParameterObject>
  extends PrepareParams<T, U> {
  cli?: GardenCli
  garden: Garden
}

export interface RunCommandParams<
  A extends ParameterObject = ParameterObject,
  O extends ParameterObject = ParameterObject,
> extends CommandParams<A, O> {
  sessionId: string
  /**
   * The session ID of the parent serve command (e.g. the 'garden dev' command that started the CLI process and the server)
   * if applicable.
   * Only defined if running in dev command or WS server.
   */
  parentSessionId: string | null
  /**
   * In certain cases we need to override the log level at the "run command" level. This is because
   * we're now re-using Garden instances via the InstanceManager and therefore cannot change the level
   * on the instance proper.
   *
   * Used e.g. by the websocket server to set a high log level for internal commands.
   */
  overrideLogLevel?: LogLevel
}

export interface SuggestedCommand {
  name: string
  description: string
  source?: string
  gardenCommand?: string
  shellCommand?: {
    command: string
    args: string[]
    cwd: string
  }
  openUrl?: string
  icon?: {
    name: string
    src?: string
  }
}

export const suggestedCommandSchema = createSchema({
  name: "suggested-command",
  keys: () => ({
    name: joi.string().required().description("Name of the command"),
    description: joi.string().required().description("Short description of what the command does."),
    source: joi.string().description("The source of the suggestion, e.g. a plugin name."),
    gardenCommand: joi.string().description("A Garden command to run (including arguments)."),
    shellCommand: joi
      .object()
      .keys({
        command: joi.string().required().description("The shell command to run (without arguments)."),
        args: joi.array().items(joi.string()).required().description("Arguments to pass to the command."),
        cwd: joi.string().required().description("Absolute path to run the shell command in."),
      })
      .description("A shell command to run."),
    openUrl: joi.string().description("A URL to open in a browser window."),
    icon: joi
      .object()
      .keys({
        name: joi.string().required().description("A string reference (and alt text) for the icon."),
        src: joi.string().description("A URI for the image. May be a data URI."),
      })
      .description("The icon to display next to the command, where applicable (e.g. in dashboard or Garden Desktop)."),
  }),
  xor: [["gardenCommand", "shellCommand", "openUrl"]],
})

type DataCallback = (data: string) => void

export type CommandArgsType<C extends Command> = C extends Command<infer Args, any> ? Args : never
export type CommandOptionsType<C extends Command> = C extends Command<any, infer Opts> ? Opts : never
export type CommandResultType<C extends Command> = C extends Command<any, any, infer R> ? R : never

export abstract class Command<
  A extends ParameterObject = ParameterObject,
  O extends ParameterObject = ParameterObject,
  R = any,
> {
  abstract name: string
  abstract help: string

  description?: string
  aliases?: string[]

  allowUndefinedArguments = false
  arguments?: A
  options?: O

  outputsSchema?: () => Joi.ObjectSchema

  cliOnly = false
  hidden = false
  noProject = false
  protected = false
  streamEvents = false // Set to true to stream events for the command
  streamLogEntries = false // Set to true to stream log entries for the command to Garden Cloud v1 and v2
  streamLogEntriesV2 = false // Set to true to stream log entries for the command to just Garden Cloud v2
  isCustom = false // Used to identify custom commands
  isDevCommand = false // Set to true for internal commands in interactive command-line commands
  ignoreOptions = false // Completely ignore all option flags and pass all arguments directly to the command
  enableAnalytics = true // Set to false to avoid reporting analytics

  subscribers: DataCallback[]
  terminated: boolean
  heartbeatIntervalId?: NodeJS.Timeout | null = null
  public server?: GardenServer

  // FIXME: The parent command is not set via the constructor but rather needs to be set "manually" after
  // the command class has been initialised.
  // E.g: const cmd = new Command(); cmd["parent"] = parentCommand.
  // This is so that commands that are initialised via arguments can be cloned which is required
  // for the websocket server to work properly.
  parent?: CommandGroup

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
          throw new InternalError({
            message: `Key ${key} is defined in both options and arguments for command ${commandName}`,
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
        throw new InternalError({
          message: `A positional argument cannot have a default value`,
        })
      }

      if (arg.required) {
        // Make sure required arguments don't follow optional ones
        if (foundOptional) {
          throw new InternalError({
            message: `A required argument cannot follow an optional one`,
          })
        }
      } else {
        foundOptional = true
      }

      // Make sure only last argument is spread
      if (arg.spread && i < args.length - 1) {
        throw new InternalError({
          message: `Only the last command argument can set spread to true`,
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
  async run(params: RunCommandParams<A, O>): Promise<CommandResult<R>> {
    const {
      garden: parentGarden,
      args,
      opts,
      cli,
      commandLine,
      sessionId,
      parentCommand,
      parentSessionId,
      overrideLogLevel,
    } = params

    return withSessionContext({ sessionId, parentSessionId }, () =>
      wrapActiveSpan(this.getFullName(), async () => {
        const commandStartTime = new Date()

        let garden = parentGarden

        if (parentSessionId) {
          // Make an instance clone to override anything that needs to be scoped to a specific command run
          // TODO: this could be made more elegant
          garden = parentGarden.cloneForCommand(sessionId)
        }

        const log = overrideLogLevel ? garden.log.createLog({ fixLevel: overrideLogLevel }) : garden.log

        let cloudSessionLegacy: CloudSessionLegacy | undefined
        // Session registration for the `dev` and `serve` commands is handled in the `serve` command's `action` method,
        // so we skip registering here to avoid duplication.
        //
        // Persistent commands other than `dev` and `serve` (i.e. commands that delegate to the `dev` command, like
        // `deploy --sync`) are also not registered here, since the `dev` command will have been registered already,
        // and the `deploy --sync` command which is subsequently run interactively in the `dev` session will register
        // itself (it will have a parent command, so the last condition in this expression will not match).
        const skipRegistration =
          !["dev", "serve"].includes(this.name) && this.maybePersistent(params) && !params.parentCommand

        if (!skipRegistration && garden.isOldBackendAvailable() && garden.projectId && this.streamEvents) {
          cloudSessionLegacy = await garden.cloudApiLegacy.registerSession({
            parentSessionId: parentSessionId || undefined,
            sessionId: garden.sessionId,
            projectId: garden.projectId,
            commandInfo: garden.commandInfo,
            // localServerPort only needs to be set for dev/serve commands
            localServerPort: undefined,
            environment: garden.environmentName,
            namespace: garden.namespace,
            isDevCommand: garden.commandInfo.name === "dev",
          })
        }

        // Print link to cloud at start of run
        const commandRunUrl = cloudSessionLegacy
          ? cloudSessionLegacy.api.getCommandResultUrl({
              sessionId: garden.sessionId,
              projectId: cloudSessionLegacy.projectId,
              shortId: cloudSessionLegacy.shortId,
            })
          : garden.cloudApi
            ? // Here we just link to the main command runs page because the command run detail link isn't available yet
              await garden.cloudApi.getCommandRunsUrl()
            : null

        if (commandRunUrl) {
          const cloudLog = log.createLog({
            name: cloudSessionLegacy
              ? getCloudLogSectionName("Garden Enterprise")
              : getCloudLogSectionName("Garden Cloud"),
          })
          cloudLog.info(`View command results at: ${styles.link(commandRunUrl.href)}`)
        }

        let analytics: AnalyticsHandler | undefined

        if (this.enableAnalytics) {
          analytics = await garden.getAnalyticsHandler()
        }

        analytics?.trackCommand(this.getFullName(), parentSessionId || undefined)

        const allOpts = <ParameterValues<GlobalOptions & O>>{
          ...mapValues(globalOptions, (opt) => opt.defaultValue),
          ...opts,
        }

        const commandInfo: CommandInfo = {
          name: this.getFullName(),
          rawArgs: args["$all"] || [],
          isCustomCommand: this.isCustom,
          args,
          opts: optionsWithAliasValues(this, allOpts),
        }

        let result: CommandResult<R>

        // We're streaming more logs to Garden Cloud v2 so we have a separate flag for that
        const streamLogEntries = this.streamLogEntries || (!!garden.cloudApi && this.streamLogEntriesV2)

        const cloudEventStream = createCloudEventStream({
          sessionId: garden.sessionId,
          log,
          garden,
          opts: { streamEvents: this.streamEvents, streamLogEntries },
        })
        if (cloudEventStream) {
          log.silly(() => `Connecting Garden instance events to Cloud API`)
        }

        try {
          garden.events.emit("commandInfo", {
            ...commandInfo,
            environmentName: garden.environmentName,
            environmentId: cloudSessionLegacy?.environmentId,
            projectName: garden.projectName,
            projectId: cloudSessionLegacy?.projectId,
            namespaceName: garden.namespace,
            namespaceId: cloudSessionLegacy?.namespaceId,
            coreVersion: getPackageVersion(),
            vcsBranch: garden.vcsInfo.branch,
            vcsCommitHash: garden.vcsInfo.commitHash,
            vcsOriginUrl: garden.vcsInfo.originUrl,
            sessionId: garden.sessionId,
            _vcsRepositoryRootDirAbs: garden.vcsInfo.repositoryRootDirAbs,
            _projectApiVersion: garden.getProjectConfig().apiVersion,
            _projectRootDirAbs: garden.projectRoot,
          })

          garden.events.emit("commandHeartbeat", { sentAt: new Date().toISOString() })
          this.heartbeatIntervalId = setInterval(() => {
            garden.events.emit("commandHeartbeat", { sentAt: new Date().toISOString() })
          }, 5_000) // Emit a heartbeat event every 5 seconds

          // Check if the command is protected and ask for confirmation to proceed if production flag is "true".
          if (await this.isAllowedToRun(garden, log, allOpts)) {
            // Clear the VCS handler's tree cache to make sure we pick up any changed sources.
            // FIXME: use file watching to be more surgical here, this is suboptimal
            garden.treeCache.invalidateDown(log, ["path"])
            // also clear the cached varfiles
            clearVarfileCache()

            log.silly(() => `Starting command '${this.getFullName()}' action`)
            result = await this.action({
              garden,
              cli,
              log,
              args,
              opts: allOpts,
              commandLine,
              parentCommand,
            })
            log.silly(() => `Completed command '${this.getFullName()}' action successfully`)
          } else {
            // The command is protected and the user decided to not continue with the execution.
            log.info("\nCommand aborted.")
            return {}
          }

          // Track the result of the command run
          const allErrors = result.errors || []
          analytics?.trackCommandResult(
            this.getFullName(),
            allErrors,
            commandStartTime,
            result.exitCode,
            parentSessionId || undefined
          )

          if (allErrors.length > 0) {
            garden.events.emit("sessionFailed", {})
          } else {
            garden.events.emit("sessionCompleted", {})
          }
        } catch (err) {
          analytics?.trackCommandResult(
            this.getFullName(),
            [toGardenError(err)],
            commandStartTime || new Date(),
            1,
            parentSessionId || undefined
          )
          garden.events.emit("sessionFailed", {})
          throw err
        } finally {
          this.heartbeatIntervalId && clearInterval(this.heartbeatIntervalId)
          if (parentSessionId) {
            garden.close()
            parentGarden.nestedSessions.delete(sessionId)
          }
          await cloudEventStream?.close()
        }

        // This is a little trick to do a round trip in the event loop, which may be necessary for event handlers to
        // fire, which may be needed to e.g. capture monitors added in event handlers
        await waitForOutputFlush()

        // Print link to cloud again at end of run
        const commandResultUrl = cloudSessionLegacy
          ? cloudSessionLegacy.api.getCommandResultUrl({
              sessionId: garden.sessionId,
              projectId: cloudSessionLegacy.projectId,
              shortId: cloudSessionLegacy.shortId,
            })
          : garden.cloudApi
            ? await garden.cloudApi.getCommandRunUrl(garden.sessionId)
            : null

        if (commandResultUrl) {
          const msg = `View command results at: \n\n${printEmoji("👉", log)}${styles.link(
            commandResultUrl
          )} ${printEmoji("👈", log)}\n`
          log.info("\n" + msg)
        }

        return result
      })
    )
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

  useInkTerminalWriter(_: CommandParamsBase<A, O>): boolean {
    return false
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
        log.debug(`Error when calling subscriber on ${this.getFullName()} command: ${err}`)
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
      clone.parent = this.parent
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
  async isAllowedToRun(garden: Garden, log: Log, opts: ParameterValues<GlobalOptions>): Promise<boolean> {
    if (!opts.yes && this.protected && garden.production) {
      const defaultMessage = styles.warning(dedent`
        Warning: you are trying to run "garden ${this.getFullName()}" against a production environment ([${
          garden.environmentName
        }])!
          Are you sure you want to continue? (run the command with the "--yes" flag to skip this check).

      `)
      const answer = await userPrompt({
        message: defaultMessage,
        type: "confirm",
        default: false,
      })

      log.info("")

      return answer
    }

    return true
  }

  renderHelp() {
    if (this.hidden) {
      return ""
    }

    let out = this.description
      ? `\n${cliStyles.heading("DESCRIPTION")}\n\n${styles.secondary(this.description.trim())}\n\n`
      : ""

    out += `${cliStyles.heading("USAGE")}\n  garden ${styles.command(this.getFullName())} `

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

export abstract class ConsoleCommand<
  A extends ParameterObject = {},
  O extends ParameterObject = {},
  R = any,
> extends Command<A, O, R> {
  override isDevCommand = true
}

export abstract class CommandGroup extends Command {
  abstract subCommands: CommandConstructor[]

  getSubCommands(): Command[] {
    return this.subCommands.flatMap((cls) => {
      const cmd = new cls()
      cmd.parent = this
      if (cmd instanceof CommandGroup) {
        return cmd.getSubCommands()
      } else {
        return [cmd]
      }
    })
  }

  override printHeader() {}

  async action() {
    return {}
  }

  override describe() {
    const description = super.describe()
    const subCommands = this.getSubCommands().map((c) => c.describe())

    return {
      ...description,
      subCommands,
    }
  }

  override renderHelp() {
    const commands = this.getSubCommands().filter((cmd) => !cmd.hidden)

    if (commands.length === 0) {
      return ""
    }

    return `
${cliStyles.heading("USAGE")}
  garden ${this.getFullName()} ${cliStyles.commandPlaceholder()} ${cliStyles.optionsPlaceholder()}

${cliStyles.heading("COMMANDS")}
${renderCommands(commands)}
`
  }
}

// fixme: These interfaces and schemas are mostly copied from their original locations. This is to ensure that
// dynamically sized or nested fields don't accidentally get introduced to command results. We should find a neater
// way to manage all this.

interface BuildResultForExport extends ProcessResultMetadata {
  buildLog?: string
  fresh?: boolean
  outputs?: PrimitiveMap
}

const buildResultForExportSchema = createSchema({
  name: "build-result-for-export",
  keys: () => ({
    buildLog: joi.string().allow("").description("The full log from the build."),
    fetched: joi.boolean().description("Set to true if the build was fetched from a remote registry."),
    fresh: joi
      .boolean()
      .description("Set to true if the build was performed, false if it was already built, or fetched from a registry"),
    details: joi.object().description("Additional information, specific to the provider."),
  }),
})

interface DeployResultForExport extends ProcessResultMetadata {
  createdAt?: string
  updatedAt?: string
  mode?: ActionMode
  externalId?: string
  externalVersion?: string
  forwardablePorts?: ForwardablePort[]
  ingresses?: ServiceIngress[]
  lastMessage?: string
  lastError?: string
  outputs?: PrimitiveMap
  // TODO-0.15: Rename to deployState
  state: DeployState
}

const deployResultForExportSchema = createSchema({
  name: "deploy-result-for-export",
  keys: () => ({
    createdAt: joi.string().description("When the service was first deployed by the provider."),
    updatedAt: joi.string().description("When the service was first deployed by the provider."),
    mode: joi.string().default("default").description("The mode the action is deployed in."),
    externalId: joi
      .string()
      .description("The ID used for the service by the provider (if not the same as the service name)."),
    externalVersion: joi
      .string()
      .description("The provider version of the deployed service (if different from the Garden module version."),
    forwardablePorts: joiArray(forwardablePortSchema()).description(
      "A list of ports that can be forwarded to from the Garden agent by the provider."
    ),
    ingresses: joi
      .array()
      .items(serviceIngressSchema())
      .description("List of currently deployed ingress endpoints for the service."),
    lastMessage: joi.string().allow("").description("Latest status message of the service (if any)."),
    lastError: joi.string().description("Latest error status message of the service (if any)."),
    outputs: joiVariables().description("A map of values output from the deployment."),
    runningReplicas: joi.number().description("How many replicas of the service are currently running."),
    // TODO-0.15: Rename to deployState
    state: joi
      .string()
      .valid(...deployStates)
      .default("unknown")
      .description("The current deployment status of the service."),
    version: joi.string().description("The Garden module version of the deployed service."),
  }),
})

type RunResultForExport = TestResultForExport

const runResultForExportSchema = createSchema({
  name: "run-result-for-export",
  keys: () => ({
    success: joi.boolean().required().description("Whether the module was successfully run."),
    exitCode: joi.number().integer().description("The exit code of the run (if applicable)."),
    startedAt: joi.date().required().description("When the module run was started."),
    completedAt: joi.date().required().description("When the module run was completed."),
    log: joi.string().allow("").default("").description("The output log from the run."),
  }),
  allowUnknown: true,
})

interface TestResultForExport extends ProcessResultMetadata {
  success: boolean
  exitCode?: number
  // FIXME: we should avoid native Date objects
  startedAt?: Date
  completedAt?: Date
  log?: string
}

const testResultForExportSchema = createSchema({
  name: "test-result-for-export",
  extend: runResultForExportSchema,
  keys: () => ({}),
})

export type ProcessResultMetadata = {
  aborted: boolean
  durationMsec?: number | null
  success: boolean
  error?: string
  inputVersion: string | null
  actionState: ActionState
}

export interface ProcessCommandResult {
  aborted: boolean
  success: boolean
  graphResults: GraphResultMapWithoutTask // TODO: Remove this in 0.14.
  build: { [name: string]: BuildResultForExport }
  builds: { [name: string]: BuildResultForExport }
  deploy: { [name: string]: DeployResultForExport }
  deployments: { [name: string]: DeployResultForExport } // alias for backwards-compatibility (remove in 0.14)
  test: { [name: string]: TestResultForExport }
  tests: { [name: string]: TestResultForExport }
  run: { [name: string]: RunResultForExport }
  tasks: { [name: string]: RunResultForExport } // alias for backwards-compatibility (remove in 0.14)
}

export const resultMetadataKeys = () => ({
  aborted: joi.boolean().description("Set to true if the action was not attempted, e.g. if a dependency failed."),
  durationMsec: joi.number().integer().description("The duration of the action's execution in msec, if applicable."),
  success: joi.boolean().required().description("Whether the action was successfully executed."),
  error: joi.string().description("An error message, if the action's execution failed."),
  inputVersion: joi
    .string()
    .description(
      "The version of the task's inputs, before any resolution or execution happens. For action tasks, this will generally be the unresolved version."
    ),
  version: joi
    .string()
    .description(
      "Alias for `inputVersion`. The version of the task's inputs, before any resolution or execution happens. For action tasks, this will generally be the unresolved version."
    ),
  actionState: joi.string().valid(...actionStates),
  outputs: joiVariables().description("A map of values output from the action's execution."),
})

export const processCommandResultSchema = createSchema({
  name: "process-command-result-keys",
  keys: () => ({
    aborted: joi.boolean().description("Set to true if the command execution was aborted."),
    success: joi.boolean().description("Set to false if the command execution was unsuccessful."),
    // Hide this field from the docs, since we're planning to remove it.
    graphResults: joi.any().meta({ internal: true }),
    build: joiIdentifierMap(buildResultForExportSchema().keys(resultMetadataKeys()))
      .description("A map of all executed Builds (or Builds scheduled/attempted) and information about them.")
      .meta({ keyPlaceholder: "<Build name>" }),
    builds: joiIdentifierMap(buildResultForExportSchema().keys(resultMetadataKeys()))
      .description(
        "[DEPRECATED] Alias for `build`. A map of all executed Builds (or Builds scheduled/attempted) and information about them. Please do not use this alias, it will be removed in a future release."
      )
      .meta({ keyPlaceholder: "<Build name>" }),
    deploy: joiIdentifierMap(deployResultForExportSchema().keys(resultMetadataKeys()))
      .description("A map of all executed Deploys (or Deployments scheduled/attempted) and the Deploy status.")
      .meta({ keyPlaceholder: "<Deploy name>" }),
    deployments: joiIdentifierMap(deployResultForExportSchema().keys(resultMetadataKeys()))
      .description(
        "[DEPRECATED] Alias for `deploy`. A map of all executed Deploys (or Deployments scheduled/attempted) and the Deploy status. Please do not use this alias, it will be removed in a future release."
      )
      .meta({ keyPlaceholder: "<Deploy name>" }),
    test: joiStringMap(testResultForExportSchema())
      .description("A map of all Tests that were executed (or scheduled/attempted) and the Test results.")
      .meta({ keyPlaceholder: "<Test name>" }),
    tests: joiStringMap(testResultForExportSchema())
      .description(
        "[DEPRECATED] Alias for `test`. A map of all Tests that were executed (or scheduled/attempted) and the Test results. Please do not use this alias, it will be removed in a future release."
      )
      .meta({ keyPlaceholder: "<Test name>" }),
    run: joiStringMap(runResultForExportSchema())
      .description("A map of all Runs that were executed (or scheduled/attempted) and the Run results.")
      .meta({ keyPlaceholder: "<Run name>" }),
    tasks: joiStringMap(runResultForExportSchema())
      .description(
        "[DEPRECATED] Alias for `run`. A map of all Runs that were executed (or scheduled/attempted) and the Run results. Please do not use this alias, it will be removed in a future release."
      )
      .meta({ keyPlaceholder: "<Run name>" }),
  }),
})

/**
 * Extracts structured results for builds, deploys or tests from TaskGraph results, suitable for command output.
 */
function prepareProcessResults(taskType: string, graphResults: GraphResults) {
  const resultsForType = Object.entries(graphResults.filterForGraphResult()).filter(
    ([name, _]) => name.split(".")[0] === taskType
  )

  return fromPairs(
    resultsForType.map(([name, graphResult]) => {
      return [splitFirst(name, ".")[1], prepareProcessResult(taskType, graphResult)]
    })
  )
}

function prepareProcessResult(taskType: string, res: GraphResultWithoutTask | null) {
  if (!res) {
    return {
      aborted: true,
      success: false,
    }
  }
  if (taskType === "build") {
    return prepareBuildResult(res)
  }
  if (taskType === "deploy") {
    return prepareDeployResult(res)
  }
  if (taskType === "test") {
    return prepareTestResult(res)
  }
  if (taskType === "run") {
    return prepareRunResult(res)
  }
  return {
    ...(res?.outputs || {}),
    aborted: !res,
    durationMsec: res?.startedAt && res?.completedAt && getDurationMsec(res?.startedAt, res?.completedAt),
    error: res?.error?.message,
    success: !!res && !res.error,
    inputVersion: res?.inputVersion,
  }
}

function prepareBuildResult(graphResult: GraphResultWithoutTask): BuildResultForExport & ProcessResultMetadata {
  const common = {
    ...commonResultFields(graphResult),
    outputs: graphResult.outputs,
  }
  const buildResult = graphResult.result?.detail
  if (buildResult) {
    return {
      ...common,
      buildLog: buildResult.buildLog,
      fresh: buildResult.fresh,
    }
  } else {
    return common
  }
}

function prepareDeployResult(graphResult: GraphResultWithoutTask): DeployResultForExport & ProcessResultMetadata {
  const common = {
    ...commonResultFields(graphResult),
    outputs: graphResult.outputs,
    state: "unknown" as DeployState,
  }
  const deployResult = graphResult.result
  if (deployResult) {
    const {
      createdAt,
      updatedAt,
      externalVersion,
      mode,
      state,
      externalId,
      forwardablePorts,
      ingresses,
      lastMessage,
      lastError,
    } = deployResult.detail
    return {
      ...common,
      createdAt,
      updatedAt,
      mode,
      state,
      externalId,
      externalVersion,
      forwardablePorts,
      ingresses,
      lastMessage,
      lastError,
    }
  } else {
    return common
  }
}

function prepareTestResult(graphResult: GraphResultWithoutTask): TestResultForExport & ProcessResultMetadata {
  const common = {
    ...commonResultFields(graphResult),
  }
  const detail = graphResult.result?.detail
  if (detail) {
    return {
      ...common,
      exitCode: detail.exitCode,
      startedAt: detail.startedAt,
      completedAt: detail.completedAt,
      log: detail.log,
    }
  } else {
    return common
  }
}

function prepareRunResult(graphResult: GraphResultWithoutTask): RunResultForExport & ProcessResultMetadata {
  const common = {
    ...commonResultFields(graphResult),
  }
  const detail = graphResult.result?.detail
  if (detail) {
    return {
      ...common,
      exitCode: detail.exitCode,
      startedAt: detail.startedAt,
      completedAt: detail.completedAt,
      log: detail.log,
    }
  } else {
    return common
  }
}

function commonResultFields(graphResult: GraphResultWithoutTask) {
  return {
    aborted: false,
    durationMsec: durationMsecForGraphResult(graphResult),
    error: graphResult.error?.message,
    success: !graphResult.error,
    inputVersion: graphResult.inputVersion,
    // Here for backwards-compatibility
    version: graphResult.inputVersion,
    actionState: graphResult.result ? (graphResult.result.state as ActionState) : "unknown",
  }
}

function durationMsecForGraphResult(graphResult: GraphResultWithoutTask) {
  return (
    graphResult.startedAt && graphResult.completedAt && getDurationMsec(graphResult.startedAt, graphResult.completedAt)
  )
}

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
  const graphResults = results.results
  const graphResultsForExport = graphResults.export()

  const failed = pickBy(graphResultsForExport, (r) => r && !r.aborted && !!r.error)
  const failedCount = size(failed)
  const abortedCount = size(pickBy(graphResultsForExport, (r) => r && !!r.aborted && !r.error))

  const success = failedCount === 0 && abortedCount === 0

  const buildResults = prepareProcessResults("build", graphResults) as ProcessCommandResult["build"]
  const deployResults = prepareProcessResults("deploy", graphResults) as ProcessCommandResult["deploy"]
  const runResults = prepareProcessResults("run", graphResults) as ProcessCommandResult["run"]
  const testResults = prepareProcessResults("test", graphResults) as ProcessCommandResult["test"]
  const result: ProcessCommandResult = {
    aborted: false,
    success,
    // TODO-0.14.1: Remove graphResults from this type (will also require refactoring test cases that read from this field)
    graphResults: graphResultsForExport,
    build: buildResults,
    builds: buildResults, // alias for `build`
    deploy: deployResults,
    deployments: deployResults, // alias for `deploy`
    test: testResults,
    tests: testResults, // alias for `test`
    run: runResults,
    tasks: runResults, // alias for `run`
  }

  if (!success) {
    const wrappedErrors: GardenError[] = flatMap(failed, (f) => {
      return f && f.error ? [toGardenError(f.error)] : []
    })

    const errMsg = abortedCount
      ? failedCount
        ? `${failedCount} requested ${taskType} action(s) failed, ${abortedCount} aborted!`
        : `${abortedCount} requested ${taskType} action(s) aborted!`
      : `${failedCount} requested ${taskType} action(s) failed!`

    const error = new RuntimeError({
      message: errMsg,
      wrappedErrors,
    })

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

export const emptyActionResults = {
  build: {},
  builds: {},
  deploy: {},
  deployments: {},
  test: {},
  tests: {},
  run: {},
  tasks: {},
  graphResults: {},
}

export function describeParameters(args?: ParameterObject) {
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
