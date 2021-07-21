/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import logSymbols from "log-symbols"
import nodeEmoji from "node-emoji"
import { cloneDeep, merge, round } from "lodash"

import { LogLevel, LogNode } from "./logger"
import { Omit } from "../util/util"
import { getChildEntries, findParentEntry } from "./util"
import { GardenError } from "../exceptions"
import { CreateNodeParams, Logger, PlaceholderOpts } from "./logger"
import uniqid from "uniqid"

export type EmojiName = keyof typeof nodeEmoji.emoji
export type LogSymbol = keyof typeof logSymbols | "empty"
export type EntryStatus = "active" | "done" | "error" | "success" | "warn"
export type TaskLogStatus = "active" | "success" | "error"

export interface LogEntryMetadata {
  task?: TaskMetadata
  workflowStep?: WorkflowStepMetadata
}

export interface TaskMetadata {
  type: string
  key: string
  status: TaskLogStatus
  uid: string
  versionString: string
  durationMs?: number
}

export interface WorkflowStepMetadata {
  index: number
}

interface MessageBase {
  msg?: string
  emoji?: EmojiName
  status?: EntryStatus
  section?: string
  symbol?: LogSymbol
  append?: boolean
  data?: any
  dataFormat?: "json" | "yaml"
}

export interface LogEntryMessage extends MessageBase {
  timestamp: Date
}

export interface UpdateLogEntryParams extends MessageBase {
  metadata?: LogEntryMetadata
}

export interface LogEntryParams extends UpdateLogEntryParams {
  error?: GardenError
  indent?: number
  childEntriesInheritLevel?: boolean
  fromStdStream?: boolean
  id?: string
}

export interface LogEntryConstructor extends LogEntryParams {
  level: LogLevel
  root: Logger
  parent?: LogEntry
  isPlaceholder?: boolean
}

function resolveCreateParams(level: LogLevel, params: string | LogEntryParams): CreateNodeParams {
  if (typeof params === "string") {
    return { msg: params, level }
  }
  return { ...params, level }
}

function resolveUpdateParams(params?: string | UpdateLogEntryParams): UpdateLogEntryParams {
  if (typeof params === "string") {
    return { msg: params }
  } else if (!params) {
    return {}
  } else {
    return params
  }
}

export class LogEntry implements LogNode {
  private messages: LogEntryMessage[]
  private metadata?: LogEntryMetadata
  public readonly parent?: LogEntry
  public readonly timestamp: Date
  public readonly key: string
  public readonly level: LogLevel
  public readonly root: Logger
  public readonly fromStdStream?: boolean
  public readonly indent?: number
  public readonly errorData?: GardenError
  public readonly childEntriesInheritLevel?: boolean
  public readonly id?: string
  public children: LogEntry[]
  public isPlaceholder: boolean
  public revision: number

  constructor(params: LogEntryConstructor) {
    this.key = uniqid()
    this.children = []
    this.timestamp = new Date()
    this.level = params.level
    this.parent = params.parent
    this.id = params.id
    this.root = params.root
    this.fromStdStream = params.fromStdStream
    this.indent = params.indent
    this.errorData = params.error
    this.childEntriesInheritLevel = params.childEntriesInheritLevel
    this.metadata = params.metadata
    this.id = params.id
    this.isPlaceholder = params.isPlaceholder || false
    this.revision = -1

    if (!params.isPlaceholder) {
      this.update({
        msg: params.msg,
        emoji: params.emoji,
        section: params.section,
        symbol: params.symbol,
        status: params.level === LogLevel.error ? "error" : params.status,
        data: params.data,
        dataFormat: params.dataFormat,
        append: params.append,
      })
    } else {
      this.messages = [{ timestamp: new Date() }]
    }
  }

  /**
   * Updates the log entry with a few invariants:
   * 1. msg, emoji, section, status, and symbol can only be replaced with a value of same type, not removed
   * 2. append is always set explicitly (the next message does not inherit the previous value)
   * 3. next metadata is merged with the previous metadata
   */
  private update(updateParams: UpdateLogEntryParams): void {
    this.revision = this.revision + 1
    const latestMessage = this.getLatestMessage()

    // Explicitly set all the fields so the shape stays consistent
    const nextMessage: LogEntryMessage = {
      // Ensure empty string gets set
      msg: typeof updateParams.msg === "string" ? updateParams.msg : latestMessage.msg,
      emoji: updateParams.emoji || latestMessage.emoji,
      section: updateParams.section || latestMessage.section,
      status: updateParams.status || latestMessage.status,
      symbol: updateParams.symbol || latestMessage.symbol,
      data: updateParams.data || latestMessage.data,
      dataFormat: updateParams.dataFormat || latestMessage.dataFormat,
      // Next message does not inherit the append field
      append: updateParams.append,
      timestamp: new Date(),
    }

    // Hack to preserve section alignment if spinner disappears
    const hadSpinner = latestMessage.status === "active"
    const hasSymbolOrSpinner = nextMessage.symbol || nextMessage.status === "active"
    if (nextMessage.section && hadSpinner && !hasSymbolOrSpinner) {
      nextMessage.symbol = "empty"
    }

    if (this.isPlaceholder) {
      // If it's a placeholder, this will be the first message...
      this.messages = [nextMessage]
      this.isPlaceholder = false
    } else {
      // ...otherwise we push it
      this.messages = [...(this.messages || []), nextMessage]
    }

    if (updateParams.metadata) {
      this.metadata = { ...(this.metadata || {}), ...updateParams.metadata }
    }
  }

  // Update node and child nodes
  private deepUpdate(updateParams: UpdateLogEntryParams): void {
    const wasActive = this.getLatestMessage().status === "active"

    this.update(updateParams)

    // Stop active child nodes if no longer active
    if (wasActive && updateParams.status !== "active") {
      getChildEntries(this).forEach((entry) => {
        if (entry.getLatestMessage().status === "active") {
          entry.update({ status: "done" })
        }
      })
    }
  }

  private createNode(params: CreateNodeParams) {
    const indent = params.indent !== undefined ? params.indent : (this.indent || 0) + 1

    // If childEntriesInheritLevel is set to true, all children must have a level geq to the level
    // of the parent entry that set the flag.
    const parentWithPreserveFlag = findParentEntry(this, (entry) => !!entry.childEntriesInheritLevel)
    const level = parentWithPreserveFlag ? Math.max(parentWithPreserveFlag.level, params.level) : params.level

    let metadata: LogEntryMetadata | undefined = undefined
    if (this.metadata || params.metadata) {
      metadata = merge(cloneDeep(this.metadata || {}), params.metadata || {})
    }

    return new LogEntry({
      ...params,
      indent,
      level,
      metadata,
      root: this.root,
      parent: this,
    })
  }

  private addNode(params: CreateNodeParams): LogEntry {
    const entry = this.createNode(params)
    if (this.root.storeEntries) {
      this.children.push(entry)
    }
    this.root.onGraphChange(entry)
    return entry
  }

  silly(params: string | LogEntryParams): LogEntry {
    return this.addNode(resolveCreateParams(LogLevel.silly, params))
  }

  debug(params: string | LogEntryParams): LogEntry {
    return this.addNode(resolveCreateParams(LogLevel.debug, params))
  }

  verbose(params: string | LogEntryParams): LogEntry {
    return this.addNode(resolveCreateParams(LogLevel.verbose, params))
  }

  info(params: string | LogEntryParams): LogEntry {
    return this.addNode(resolveCreateParams(LogLevel.info, params))
  }

  warn(params: string | LogEntryParams): LogEntry {
    return this.addNode(resolveCreateParams(LogLevel.warn, params))
  }

  error(params: string | LogEntryParams): LogEntry {
    return this.addNode(resolveCreateParams(LogLevel.error, params))
  }

  getMetadata() {
    return this.metadata
  }

  getMessages() {
    return this.messages
  }

  /**
   * Returns a deep copy of the latest message, if availble.
   * Otherwise returns an empty object of type LogEntryMessage for convenience.
   */
  getLatestMessage() {
    if (!this.messages) {
      return <LogEntryMessage>{}
    }

    // Use spread operator to clone the array
    const message = [...this.messages][this.messages.length - 1]
    // ...and the object itself
    return { ...message }
  }

  placeholder({
    level = LogLevel.info,
    childEntriesInheritLevel = false,
    indent = 0,
    metadata,
  }: PlaceholderOpts = {}): LogEntry {
    // Ensure placeholder child entries align with parent context
    const indentForNode = Math.max((indent || this.indent || 0) - 1, -1)
    return this.addNode({
      level,
      indent: indentForNode,
      childEntriesInheritLevel,
      isPlaceholder: true,
      metadata,
    })
  }

  // Preserves status
  setState(params?: string | UpdateLogEntryParams): LogEntry {
    this.deepUpdate({ ...resolveUpdateParams(params) })
    this.root.onGraphChange(this)
    return this
  }

  setDone(params?: string | Omit<UpdateLogEntryParams, "status">): LogEntry {
    this.deepUpdate({ ...resolveUpdateParams(params), status: "done" })
    this.root.onGraphChange(this)
    return this
  }

  setSuccess(params?: string | Omit<UpdateLogEntryParams, "status" & "symbol">): LogEntry {
    this.deepUpdate({
      ...resolveUpdateParams(params),
      symbol: "success",
      status: "success",
    })
    this.root.onGraphChange(this)
    return this
  }

  setError(params?: string | Omit<UpdateLogEntryParams, "status" & "symbol">): LogEntry {
    this.deepUpdate({
      ...resolveUpdateParams(params),
      symbol: "error",
      status: "error",
    })
    this.root.onGraphChange(this)
    return this
  }

  setWarn(param?: string | Omit<UpdateLogEntryParams, "status" & "symbol">): LogEntry {
    this.deepUpdate({
      ...resolveUpdateParams(param),
      symbol: "warning",
      status: "warn",
    })
    this.root.onGraphChange(this)
    return this
  }

  stopAll() {
    return this.root.stop()
  }

  stop() {
    // Stop gracefully if still in active state
    if (this.getLatestMessage().status === "active") {
      this.update({ symbol: "empty", status: "done" })
      this.root.onGraphChange(this)
    }
    return this
  }

  getChildEntries() {
    return getChildEntries(this)
  }

  /**
   * Dumps the log entry and all child entries as a string, optionally filtering the entries with `filter`.
   * For example, to dump all the logs of level info or higher:
   *
   *   log.toString((entry) => entry.level <= LogLevel.info)
   */
  toString(filter?: (log: LogEntry) => boolean) {
    return this.getChildEntries()
      .filter((entry) => (filter ? filter(entry) : true))
      .flatMap((entry) => entry.getMessages()?.map((message) => message.msg))
      .join("\n")
  }

  /**
   * Returns the duration in seconds, defaults to 2 decimal precision
   */
  getDuration(precision: number = 2): number {
    return round((new Date().getTime() - this.timestamp.getTime()) / 1000, precision)
  }
}
