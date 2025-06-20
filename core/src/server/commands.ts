/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { getLogLevelChoices, LogLevel } from "../logger/logger.js"
import stringArgv from "string-argv"
import type { BuiltinArgs, Command, CommandParams, CommandResult } from "../commands/base.js"
import { ConsoleCommand } from "../commands/base.js"
import { createSchema, joi } from "../config/common.js"
import { type Log } from "../logger/log-entry.js"
import type { ParameterValues, GlobalOptions, ParameterObject } from "../cli/params.js"
import { ChoicesParameter, StringParameter, StringsParameter } from "../cli/params.js"
import { parseCliArgs, pickCommand, processCliArgs } from "../cli/helpers.js"
import type { AutocompleteSuggestion } from "../cli/autocomplete.js"
import { naturalList } from "../util/string.js"
import micromatch from "micromatch"
import type { GardenInstanceManager } from "./instance-manager.js"
import { isDirectory } from "../util/fs.js"
import fsExtra from "fs-extra"
import type { ProjectConfig } from "../config/project.js"
import { findProjectConfig } from "../config/base.js"
import type { GlobalConfigStore } from "../config-store/global.js"
import type { ParsedArgs } from "minimist"
import type { ServeCommand } from "../commands/serve.js"
import { uuidv4 } from "../util/random.js"
import type { GetSyncStatusResult } from "../plugin/handlers/Deploy/get-sync-status.js"
import { getSyncStatuses } from "../commands/sync/sync-status.js"
import type { ActionStatusPayload } from "../events/action-status-events.js"
import type { BuildStatusForEventPayload } from "../plugin/handlers/Build/get-status.js"
import type { DeployStatusForEventPayload } from "../types/service.js"
import type { RunStatusForEventPayload } from "../plugin/plugin.js"
import {
  getBuildStatusPayloads,
  getDeployStatusPayloads,
  getRunStatusPayloads,
  getTestStatusPayloads,
} from "../actions/helpers.js"
import pProps from "p-props"

const { pathExists } = fsExtra

const autocompleteArguments = {
  input: new StringParameter({
    help: "The input string to provide suggestions for.",
    required: true,
  }),
}

type AutocompleteArguments = typeof autocompleteArguments

interface AutocompleteResult {
  input: string
  suggestions: AutocompleteSuggestion[]
}

export class AutocompleteCommand extends ConsoleCommand<AutocompleteArguments> {
  name = "autocomplete"
  help = "Given an input string, provide a list of suggestions for available Garden commands."
  override hidden = true

  override noProject = true

  override arguments = autocompleteArguments

  override enableAnalytics = false

  constructor(private manager: GardenInstanceManager) {
    super(manager)
  }

  async action({
    log,
    garden,
    args,
  }: CommandParams<AutocompleteArguments>): Promise<CommandResult<AutocompleteResult>> {
    const { input } = args

    return {
      result: {
        input,
        suggestions: this.manager.getAutocompleteSuggestions({ log, projectRoot: garden.projectRoot, input }),
      },
    }
  }
}

export class ReloadCommand extends ConsoleCommand {
  name = "reload"
  help = "Reload the project and action/module configuration."

  override noProject = true

  constructor(private serveCommand?: ServeCommand) {
    super(serveCommand)
  }

  async action({ log }: CommandParams) {
    // No-op except when running serve or dev command
    await this.serveCommand?.reload(log)
    return {}
  }
}

const logLevelArguments = {
  level: new ChoicesParameter({
    choices: getLogLevelChoices(),
    help: "The log level to set",
    required: true,
  }),
}

type LogLevelArguments = typeof logLevelArguments

// These are the only writers for which we want to dynamically update the log level
const displayWriterTypes = ["basic", "ink"]

export class LogLevelCommand extends ConsoleCommand<LogLevelArguments> {
  name = "log-level"
  help = "Change the max log level of (future) printed logs in the console."

  override noProject = true

  override arguments = logLevelArguments

  async action({ log, commandLine, args }: CommandParams<LogLevelArguments>) {
    const level = args.level

    const logger = log.root

    const writers = logger.getWriters()
    for (const writer of [writers.display, ...writers.file]) {
      if (displayWriterTypes.includes(writer.type)) {
        writer.level = level as unknown as LogLevel
      }
    }

    commandLine?.flashMessage(`Log level set to ${level}`)

    return {}
  }
}

const hideArgs = {
  type: new ChoicesParameter({
    help: "The type of monitor to stop. Skip to stop all monitoring.",
    choices: ["log", "logs", "sync", "syncs", "local", ""],
    defaultValue: "",
  }),
  names: new StringsParameter({
    help: "The name(s) of the deploy(s) to stop monitoring for (skip to stop monitoring all of them). You may specify multiple names, separated by spaces.",
    spread: true,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.actionConfigs.Deploy)
    },
  }),
}

type HideArgs = typeof hideArgs

export class HideCommand extends ConsoleCommand<HideArgs> {
  name = "hide"
  override aliases = ["stop"]
  help = "Stop monitoring for logs for all or specified Deploy actions"

  override arguments = hideArgs

  async action({ garden, log, args }: CommandParams<HideArgs>) {
    let type = args.type
    const names = !args.names || args.names.length === 0 ? ["*"] : args.names

    // Support plurals as aliases
    if (type === "logs" || type === "syncs") {
      type = type.slice(0, -1)
    }

    log.info("")

    if (!type) {
      log.info("Stopping all monitors...")
    } else if (names.includes("*")) {
      log.info(`Stopping all ${type} monitors...`)
    } else {
      log.info(`Stopping ${type} monitors for Deploy(s) matching ` + naturalList(names, { quote: true }))
    }

    const monitors = garden.monitors.getActive()

    for (const monitor of monitors) {
      if (monitor && (!type || monitor.type === type) && micromatch.isMatch(monitor.key(), names)) {
        log.info(`Stopping ${monitor.description()}...`)
        garden.monitors.stop(monitor, log)
      }
    }

    log.info("Done!\n")

    return {}
  }
}

interface GetDeployStatusCommandResult {
  actions: {
    [actionName: string]: {
      deployStatus: ActionStatusPayload<DeployStatusForEventPayload>
      syncStatus: GetSyncStatusResult
    }
  }
}

export class _GetDeployStatusCommand extends ConsoleCommand {
  name = "_get-deploy-status"
  help = "[Internal] Outputs a map of actions with their corresponding deploy and sync statuses."
  override hidden = true

  override enableAnalytics = false
  override streamEvents = false

  override outputsSchema = () => joi.object()

  async action({ garden, log }: CommandParams): Promise<CommandResult<GetDeployStatusCommandResult>> {
    const router = await garden.getActionRouter()
    const graph = await garden.getResolvedConfigGraph({ log, emit: true })
    const deployActions = graph.getDeploys({ includeDisabled: false }).sort((a, b) => (a.name > b.name ? 1 : -1))
    const deployStatuses = await getDeployStatusPayloads({ router, graph, log, sessionId: garden.sessionId })

    const commandLog = log.createLog({ fixLevel: LogLevel.silly })
    const syncStatuses = await getSyncStatuses({ garden, graph, deployActions, log: commandLog, skipDetail: true })

    const actions = deployActions.reduce(
      (acc, val) => {
        acc[val.name] = {
          deployStatus: deployStatuses[val.name],
          syncStatus: syncStatuses[val.name],
        }
        return acc
      },
      {} as {
        [key: string]: {
          deployStatus: ActionStatusPayload<DeployStatusForEventPayload>
          syncStatus: GetSyncStatusResult
        }
      }
    )

    return { result: { actions } }
  }
}

interface GetActionStatusesCommandResult {
  actions: {
    build: Record<string, ActionStatusPayload<BuildStatusForEventPayload>>
    deploy: Record<string, ActionStatusPayload<DeployStatusForEventPayload>>
    run: Record<string, ActionStatusPayload<RunStatusForEventPayload>>
    test: Record<string, ActionStatusPayload<RunStatusForEventPayload>>
  }
}

export class _GetActionStatusesCommand extends ConsoleCommand {
  name = "_get-action-statuses"
  help = "[Internal/Experimental] Returns a map of all actions statuses."
  override hidden = true

  override streamEvents = false

  override outputsSchema = () => joi.object()

  async action({ garden, log }: CommandParams): Promise<CommandResult<GetActionStatusesCommandResult>> {
    const router = await garden.getActionRouter()
    const graph = await garden.getResolvedConfigGraph({ log, emit: true })
    const sessionId = garden.sessionId

    const actions = await pProps({
      build: getBuildStatusPayloads({ router, graph, log, sessionId }),
      deploy: getDeployStatusPayloads({ router, graph, log, sessionId }),
      test: getTestStatusPayloads({ router, graph, log, sessionId }),
      run: getRunStatusPayloads({ router, graph, log, sessionId }),
    })

    return { result: { actions } }
  }
}

export interface BaseServerRequest {
  id?: string
  command?: string
  environment?: string
  projectRoot?: string
  /**
   * @deprecated TODO(deprecation): get rid of its usages in 0.14 and remove in 0.15
   */
  stringArguments?: string[]
  internal?: boolean
}

export const serverRequestSchema = createSchema({
  name: "server-request",
  keys: () => ({
    id: joi.string().uuid().description("A UUID to assign to the request."),
    command: joi
      .string()
      .description("The command to run, along with any arguments, as if passed to the CLI normally.")
      .example("deploy api --force"),
    environment: joi
      .environment()
      .description(
        "Run the command against the specified environment. Otherwise a default is derived from configuration or from the command line of the dev/server process if applicable. If an --env flag is present in the command, that takes precedence."
      ),
    projectRoot: joi
      .string()
      .description(
        "Specify a project root. By default the cwd of the server process is used. Note that if this is set, it must point to a directory that exists, and only that specific directory will be searched (as opposed to scanning parent directories)."
      ),
    // TODO(deprecation): get rid of its usages in 0.14 and remove in 0.15
    stringArguments: joi
      .array()
      .items(joi.string())
      .description(
        "[DEPRECATED] Array of args to append to the given command. Kept for backwards compatibility (it's now enough to just use the command string."
      ),
    internal: joi
      .boolean()
      .description(
        "Internal command that's not triggered by the user. Internal commands have a higher log level and results are not persisted in Cloud."
      ),
  }),
})

// TODO: refactor and deduplicate from the GardenCli class
/**
 * Validate and map a request body to a Command
 */
export async function resolveRequest({
  log,
  manager,
  defaultProjectRoot,
  globalConfigStore,
  request,
  inheritedOpts,
}: {
  log: Log
  manager: GardenInstanceManager
  defaultProjectRoot: string
  globalConfigStore: GlobalConfigStore
  request: BaseServerRequest
  inheritedOpts?: Partial<ParameterValues<GlobalOptions>>
}) {
  function fail(code: number, message: string, detail?: string) {
    return { error: { code, message, detail } }
  }

  let projectConfig: ProjectConfig | undefined

  // TODO: support --root option flag

  if (request.projectRoot) {
    if (!(await pathExists(request.projectRoot))) {
      return fail(400, `Specified projectRoot path (${request.projectRoot}) does not exist.`)
    } else if (!(await isDirectory(request.projectRoot))) {
      return fail(400, `Specified projectRoot path (${request.projectRoot}) is not a directory.`)
    }

    projectConfig = await findProjectConfig({ log, path: request.projectRoot, allowInvalid: true, scan: false })

    if (!projectConfig) {
      return fail(
        400,
        `Specified projectRoot path (${request.projectRoot}) does not contain a Garden project config (the exact directory of the project root must be specified).`
      )
    }
  } else {
    projectConfig = await findProjectConfig({ log, path: defaultProjectRoot, allowInvalid: true, scan: true })

    if (!projectConfig) {
      return fail(400, `Could not find a Garden project in '${request.projectRoot}' or any parent directory.`)
    }
  }

  const projectRoot = projectConfig.path

  const internal = request.internal

  // Prepare arguments for command action.
  let command: Command | undefined
  let rest: string[] = []
  let argv: ParsedArgs | undefined
  let cmdArgs: BuiltinArgs & ParameterValues<ParameterObject> = {}
  let cmdOpts: ParameterValues<ParameterObject> = {}

  if (request.command) {
    const { commands } = await manager.ensureProjectRootContext(log, projectRoot)

    const args = [...stringArgv(request.command.trim()), ...(request.stringArguments || [])]
    const picked = pickCommand(commands, args)
    command = picked.command
    rest = picked.rest

    if (!command) {
      return fail(404, `Could not find command ${request.command}.`)
    }

    // Note that we clone the command here to ensure that each request gets its own
    // command instance and thereby that subscribers are properly isolated at the request level.
    command = command.clone()

    const { matchedPath } = picked

    // Prepare arguments for command action.
    try {
      argv = parseCliArgs({ stringArgs: rest, command, cli: false, skipGlobalDefault: true })

      const parseResults = processCliArgs({
        rawArgs: args,
        parsedArgs: argv,
        matchedPath,
        command,
        cli: false,
        inheritedOpts,
        warnOnGlobalOpts: true,
      })
      cmdArgs = parseResults.args
      cmdOpts = parseResults.opts
    } catch (error) {
      return fail(400, `Invalid arguments for command ${command.getFullName()}`, `${error}`)
    }
  }

  const serverLogger = command?.getServerLogger() || log.root

  const cmdLog = serverLogger.createLog({})

  const sessionId = request.id || uuidv4()

  const garden = await manager.getGardenForRequest({
    command,
    log: cmdLog,
    projectConfig,
    globalConfigStore,
    args: cmdArgs,
    opts: cmdOpts,
    environmentString: request.environment,
    sessionId,
  })

  cmdLog.context.gardenKey = garden.getInstanceKey()
  cmdLog.context.sessionId = sessionId

  return {
    garden,
    command,
    log: cmdLog,
    argv,
    args: cmdArgs,
    opts: cmdOpts,
    internal,
    rest,
    error: null,
  }
}
