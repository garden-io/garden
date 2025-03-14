/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Garden } from "./garden.js"
import type { SourceConfig } from "./config/project.js"
import { projectApiVersionSchema } from "./config/project.js"
import { projectNameSchema, projectSourcesSchema, environmentNameSchema } from "./config/project.js"
import type { Provider, BaseProviderConfig } from "./config/provider.js"
import { providerSchema } from "./config/provider.js"
import { deline } from "./util/string.js"
import { joi, joiVariables, joiStringMap, joiIdentifier, createSchema } from "./config/common.js"
import type { PluginTool } from "./util/ext-tools.js"
import type { ContextWithSchema, ContextResolveOpts } from "./config/template-contexts/base.js"
import { legacyResolveTemplateString } from "./template/templated-strings.js"
import type { Log } from "./logger/log-entry.js"
import { logEntrySchema } from "./plugin/base.js"
import { EventEmitter } from "eventemitter3"
import type { CreateEventLogParams, StringLogLevel } from "./logger/logger.js"
import { EventLogger, LogLevel } from "./logger/logger.js"
import { Memoize } from "typescript-memoize"
import type { ParameterObject, ParameterValues } from "./cli/params.js"
import type { EventNamespaceStatus } from "./types/namespace.js"
import type { ParsedTemplate, ResolvedTemplate } from "./template/types.js"
import { deepEvaluate } from "./template/evaluate.js"

export type WrappedFromGarden = Pick<
  Garden,
  | "projectApiVersion"
  | "projectName"
  | "projectRoot"
  | "gardenDirPath"
  | "workingCopyId"
  | "cloudApi"
  | "cloudApiV2"
  | "projectId"
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

type ResolveTemplateStringsOpts = Omit<ContextResolveOpts, "contextStack" | "keyStack" | "stack">

export interface PluginContext<C extends BaseProviderConfig = BaseProviderConfig> extends WrappedFromGarden {
  command: CommandInfo
  log: Log
  events: PluginEventBroker
  projectSources: SourceConfig[]
  provider: Provider<C>
  legacyResolveTemplateString: (value: string, opts?: ResolveTemplateStringsOpts) => ResolvedTemplate
  deepEvaluate: (value: ParsedTemplate) => ResolvedTemplate
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
    projectApiVersion: projectApiVersionSchema(),
    projectName: projectNameSchema(),
    projectId: joi.string().optional().description("The unique ID of the current project."),
    projectRoot: joi.string().description("The absolute path of the project root."),
    projectSources: projectSourcesSchema(),
    provider: providerSchema().description("The provider being used for this context.").id("ctxProviderSchema"),
    legacyResolveTemplateString: joi
      .function()
      .description(
        "Helper function to resolve a template string in a legacy way, given the same templating context as was used to render the configuration before calling the handler. Accepts any data type, and returns the same data type back with all template strings resolved."
      ),
    deepEvaluate: joi.function().description("Helper function to deeply resolve parsed template strings."),
    sessionId: joi.string().description("The unique ID of the currently active session."),
    tools: joiStringMap(joi.object()),
    workingCopyId: joi.string().description("A unique ID assigned to the current project working copy."),
    cloudApi: joi.any().optional(),
    cloudApiV2: joi.any().optional(),
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
  namespaceStatus: (status: EventNamespaceStatus) => void
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

    // Always pipe `namespaceStatus` events to the main event bus, since we need this to happen both during provider
    // resolution (where `prepareEnvironment` is called, see `ResolveProviderTask`) and inside action handlers.
    //
    // Note: If any other plugin events without action-specific metadata are needed, they should be added here.
    this.on("namespaceStatus", (status: EventNamespaceStatus) => {
      this.garden.events.emit("namespaceStatus", status)
    })

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
  templateContext: ContextWithSchema
  events: PluginEventBroker | undefined
}): Promise<PluginContext> {
  return {
    command,
    events: events || new PluginEventBroker(garden),
    environmentName: garden.environmentName,
    namespace: garden.namespace,
    gardenDirPath: garden.gardenDirPath,
    log: garden.log,
    projectApiVersion: garden.projectApiVersion,
    projectName: garden.projectName,
    projectRoot: garden.projectRoot,
    projectSources: garden.getProjectSources(),
    provider,
    production: garden.production,
    deepEvaluate: (o: ParsedTemplate): ResolvedTemplate => {
      return deepEvaluate(o, {
        context: templateContext,
        opts: {},
      })
    },
    legacyResolveTemplateString: (string: string, opts?: ResolveTemplateStringsOpts) => {
      return legacyResolveTemplateString({
        string,
        context: templateContext,
        contextOpts: opts || {},
        source: undefined,
      })
    },
    sessionId: garden.sessionId,
    tools: await garden.getTools(),
    workingCopyId: garden.workingCopyId,
    cloudApi: garden.cloudApi,
    cloudApiV2: garden.cloudApiV2,
    projectId: garden.projectId,
  }
}
