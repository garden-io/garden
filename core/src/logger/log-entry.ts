/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import logSymbols from "log-symbols"
import nodeEmoji from "node-emoji"
import { cloneDeep, merge } from "lodash"

import { LogNode, LogLevel, CreateNodeParams, PlaceholderOpts } from "./log-node"
import { Omit } from "../util/util"
import { getChildEntries, findParentEntry } from "./util"
import { GardenError } from "../exceptions"
import { Logger } from "./logger"

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

export const EVENT_LOG_LEVEL = LogLevel.debug

interface MessageBase {
  msg?: string
  emoji?: EmojiName
  status?: EntryStatus
  section?: string
  symbol?: LogSymbol
  append?: boolean
  data?: any
  dataFormat?: "json" | "yaml"
  maxSectionWidth?: number
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

function resolveParams(params?: string | UpdateLogEntryParams): UpdateLogEntryParams {
  if (typeof params === "string") {
    return { msg: params }
  } else if (!params) {
    return {}
  } else {
    return params
  }
}

export class LogEntry extends LogNode {
  private messages?: LogEntryMessage[]
  private metadata?: LogEntryMetadata
  public readonly root: Logger
  public readonly fromStdStream?: boolean
  public readonly indent?: number
  public readonly errorData?: GardenError
  public readonly childEntriesInheritLevel?: boolean
  public readonly id?: string
  public isPlaceholder?: boolean
  public revision: number

  constructor(params: LogEntryConstructor) {
    super(params.level, params.parent, params.id)

    this.root = params.root
    this.fromStdStream = params.fromStdStream
    this.indent = params.indent
    this.errorData = params.error
    this.childEntriesInheritLevel = params.childEntriesInheritLevel
    this.metadata = params.metadata
    this.id = params.id
    this.isPlaceholder = params.isPlaceholder
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
        maxSectionWidth: params.maxSectionWidth,
      })
    }
  }

  /**
   * Updates the log entry with a few invariants:
   * 1. msg, emoji, section, status, and symbol can only be replaced with a value of same type, not removed
   * 2. append is always set explicitly (the next message does not inherit the previous value)
   * 3. next metadata is merged with the previous metadata
   */
  protected update(updateParams: UpdateLogEntryParams): void {
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
      maxSectionWidth:
        updateParams.maxSectionWidth !== undefined ? updateParams.maxSectionWidth : latestMessage.maxSectionWidth,
    }

    // Hack to preserve section alignment if spinner disappears
    const hadSpinner = latestMessage.status === "active"
    const hasSymbolOrSpinner = nextMessage.symbol || nextMessage.status === "active"
    if (nextMessage.section && hadSpinner && !hasSymbolOrSpinner) {
      nextMessage.symbol = "empty"
    }

    this.messages = [...(this.messages || []), nextMessage]

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

  protected createNode(params: CreateNodeParams) {
    const indent = params.indent !== undefined ? params.indent : (this.indent || 0) + 1

    // If childEntriesInheritLevel is set to true, all children must have a level geq to the level
    // of the parent entry that set the flag.
    const parentWithPreserveFlag = findParentEntry(this, (entry) => !!entry.childEntriesInheritLevel)
    const level = parentWithPreserveFlag ? Math.max(parentWithPreserveFlag.level, params.level) : params.level

    return new LogEntry({
      ...params,
      indent,
      level,
      metadata: merge(cloneDeep(this.metadata || {}), params.metadata || {}),
      root: this.root,
      parent: this,
    })
  }

  protected onGraphChange(node: LogEntry) {
    this.root.onGraphChange(node)
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
    this.isPlaceholder = false
    this.deepUpdate({ ...resolveParams(params) })
    this.onGraphChange(this)
    return this
  }

  setDone(params?: string | Omit<UpdateLogEntryParams, "status">): LogEntry {
    this.deepUpdate({ ...resolveParams(params), status: "done" })
    this.onGraphChange(this)
    return this
  }

  setSuccess(params?: string | Omit<UpdateLogEntryParams, "status" & "symbol">): LogEntry {
    this.deepUpdate({
      ...resolveParams(params),
      symbol: "success",
      status: "success",
    })
    this.onGraphChange(this)
    return this
  }

  setError(params?: string | Omit<UpdateLogEntryParams, "status" & "symbol">): LogEntry {
    this.deepUpdate({
      ...resolveParams(params),
      symbol: "error",
      status: "error",
    })
    this.onGraphChange(this)
    return this
  }

  setWarn(param?: string | Omit<UpdateLogEntryParams, "status" & "symbol">): LogEntry {
    this.deepUpdate({
      ...resolveParams(param),
      symbol: "warning",
      status: "warn",
    })
    this.onGraphChange(this)
    return this
  }

  stopAll() {
    return this.root.stop()
  }

  stop() {
    // Stop gracefully if still in active state
    if (this.getLatestMessage().status === "active") {
      this.update({ symbol: "empty", status: "done" })
      this.onGraphChange(this)
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
}
