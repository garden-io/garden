/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Garden } from "./garden.js"
import type { SourceConfig } from "./config/project.js"
import { projectNameSchema, projectSourcesSchema, environmentNameSchema } from "./config/project.js"
import type { Provider, GenericProviderConfig } from "./config/provider.js"
import { providerSchema } from "./config/provider.js"
import { deline } from "./util/string.js"
import { joi, joiVariables, joiStringMap, joiIdentifier, createSchema } from "./config/common.js"
import type { PluginTool } from "./util/ext-tools.js"
import type { ConfigContext, ContextResolveOpts } from "./config/template-contexts/base.js"
import { resolveTemplateStrings } from "./template-string/template-string.js"
import type { Log } from "./logger/log-entry.js"
import { logEntrySchema } from "./plugin/base.js"
import { EventEmitter } from "eventemitter3"
import type { CreateEventLogParams, StringLogLevel } from "./logger/logger.js"
import { EventLogger, LogLevel } from "./logger/logger.js"
import { Memoize } from "typescript-memoize"
import type { ParameterObject, ParameterValues } from "./cli/params.js"
import type { NamespaceStatus } from "./types/namespace.js"

export type WrappedFromGarden = Pick<
  Garden,
  | "projectName"
  | "projectRoot"
  | "gardenDirPath"
  | "workingCopyId"
  | "cloudApi"
  // TODO: remove this from the interface
  | "environmentName"
  | "namespace"
  | "production"
  | "sessionId"
>

export interface CommandInfo {
  name: string
  args: ParameterValues<ParameterObject>
  opts: ParameterValues<ParameterObject>
}

type ResolveTemplateStringsOpts = Omit<ContextResolveOpts, "stack">

export interface PluginContext<C extends GenericProviderConfig = GenericProviderConfig> extends WrappedFromGarden {
  command: CommandInfo
  log: Log
  events: PluginEventBroker
  projectSources: SourceConfig[]
  provider: Provider<C>
  resolveTemplateStrings: <T>(o: T, opts?: ResolveTemplateStringsOpts) => T
  tools: { [key: string]: PluginTool }
}

// NOTE: this is used more for documentation than validation, outside of internal testing
// TODO: validate the output from createPluginContext against this schema (in tests)
export const pluginContextSchema = createSchema({
  name: "plugin-context",
  keys: () => ({
    command: joi
      .object()
      .optional()
      .keys({
        name: joi.string().required().description("The command name currently being executed."),
        args: joiVariables().required().description("The positional arguments passed to the command."),
        opts: joiVariables().required().description("The optional flags passed to the command."),
      })
      .description("Information about the command being executed, if applicable."),
    environmentName: environmentNameSchema(),
    namespace: joiIdentifier().description("The active namespace."),
    events: joi.any().description("An event emitter, used for communication during handler execution."),
    gardenDirPath: joi.string().description(deline`
      The absolute path of the project's Garden dir. This is the directory the contains builds, logs and
      other meta data. A custom path can be set when initialising the Garden class. Defaults to \`.garden\`.
    `),
    log: logEntrySchema(),
    production: joi
      .boolean()
      .default(false)
      .description("Indicate if the current environment is a production environment.")
      .example(true),
    projectName: projectNameSchema(),
    projectRoot: joi.string().description("The absolute path of the project root."),
    projectSources: projectSourcesSchema(),
    provider: providerSchema().description("The provider being used for this context.").id("ctxProviderSchema"),
    resolveTemplateStrings: joi
      .function()
      .description(
        "Helper function to resolve template strings, given the same templating context as was used to render the configuration before calling the handler. Accepts any data type, and returns the same data type back with all template strings resolved."
      ),
    sessionId: joi.string().description("The unique ID of the currently active session."),
    tools: joiStringMap(joi.object()),
    workingCopyId: joi.string().description("A unique ID assigned to the current project working copy."),
    cloudApi: joi.any().optional(),
  }),
  options: { presence: "required" },
})

// TODO: unify with LogEntry type (this is basically a subset)
export type PluginEventLogContext = {
  /** entity that created the log message, e.g. tool that generated it */
  origin?: string

  /** which level to print the log at */
  level: StringLogLevel
}

export type PluginEventLogMessage = PluginEventLogContext & {
  /**
   * ISO format date string
   */
  timestamp: string

  /** log message */
  msg: string
}

// Define your emitter's types as follows:
// Key: Event name; Value: Listener function signature
type PluginEvents = {
  abort: (reason?: string) => void
  done: () => void
  failed: (error?: Error) => void
  log: (msg: PluginEventLogMessage) => void
  namespaceStatus: (status: NamespaceStatus) => void
}

type PluginEventType = keyof PluginEvents

export class PluginEventBroker extends EventEmitter<PluginEvents, PluginEventType> {
  private aborted: boolean
  private done: boolean
  private failed: boolean
  private error: Error | undefined
  private garden: Garden
  private abortHandler: () => void

  constructor(garden: Garden) {
    super()

    this.aborted = false
    this.done = false
    this.failed = false
    this.garden = garden
    this.abortHandler = () => this.emit("abort")

    // Always respond to exit and restart events
    this.garden.events.onKey("_exit", this.abortHandler, garden.sessionId)
    this.garden.events.onKey("_restart", this.abortHandler, garden.sessionId)

    this.on("abort", () => {
      this.aborted = true
    })
    this.on("done", () => {
      this.done = true
    })
    this.on("failed", (error?: Error) => {
      this.done = true
      this.failed = true
      this.error = error
    })
  }

  isAborted() {
    return this.aborted
  }

  isDone() {
    return this.done
  }

  isFailed() {
    return this.failed
  }

  getError() {
    return this.error
  }

  @Memoize()
  private getLogger() {
    return new EventLogger({ events: this, level: LogLevel.info })
  }

  createLog(params: CreateEventLogParams) {
    return this.getLogger().createLog(params)
  }
}

export async function createPluginContext({
  garden,
  provider,
  command,
  templateContext,
  events,
}: {
  garden: Garden
  provider: Provider
  command: CommandInfo
  templateContext: ConfigContext
  events: PluginEventBroker | undefined
}): Promise<PluginContext> {
  return {
    command,
    events: events || new PluginEventBroker(garden),
    environmentName: garden.environmentName,
    namespace: garden.namespace,
    gardenDirPath: garden.gardenDirPath,
    log: garden.log,
    projectName: garden.projectName,
    projectRoot: garden.projectRoot,
    projectSources: garden.getProjectSources(),
    provider,
    production: garden.production,
    resolveTemplateStrings: <T>(o: T, opts?: ResolveTemplateStringsOpts) => {
      return resolveTemplateStrings({ value: o, context: templateContext, contextOpts: opts || {}, source: undefined })
    },
    sessionId: garden.sessionId,
    tools: await garden.getTools(),
    workingCopyId: garden.workingCopyId,
    cloudApi: garden.cloudApi,
  }
}
