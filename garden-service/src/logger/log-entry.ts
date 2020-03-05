/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import logSymbols from "log-symbols"
import nodeEmoji from "node-emoji"

import { LogNode, LogLevel, CreateNodeParams } from "./log-node"
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
}

export interface TaskMetadata {
  type: string
  key: string
  status: TaskLogStatus
  uid: string
  versionString: string
  durationMs?: number
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
  maxSectionWidth?: number
}

export interface MessageState extends MessageBase {
  timestamp: number
}

export interface UpdateLogEntryParams extends MessageBase {
  metadata?: LogEntryMetadata
}

export interface LogEntryParams extends UpdateLogEntryParams {
  error?: GardenError
  data?: any // to be rendered as e.g. YAML or JSON
  dataFormat?: "json" | "yaml" // how to render the data object
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
  private messageStates?: MessageState[]
  private metadata?: LogEntryMetadata
  public readonly root: Logger
  public readonly fromStdStream?: boolean
  public readonly indent?: number
  public readonly errorData?: GardenError
  public readonly childEntriesInheritLevel?: boolean
  public readonly id?: string

  constructor(params: LogEntryConstructor) {
    super(params.level, params.parent, params.id)

    this.root = params.root
    this.fromStdStream = params.fromStdStream
    this.indent = params.indent
    this.errorData = params.error
    this.childEntriesInheritLevel = params.childEntriesInheritLevel
    this.metadata = params.metadata
    this.id = params.id

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
   * 2. append is always set explicitly (the next message state does not inherit the previous value)
   * 3. next metadata is merged with the previous metadata
   */
  protected update(updateParams: UpdateLogEntryParams): void {
    const messageState = this.getMessageState()

    // Explicitly set all the fields so the shape stays consistent
    const nextMessageState: MessageState = {
      // Ensure empty string gets set
      msg: typeof updateParams.msg === "string" ? updateParams.msg : messageState.msg,
      emoji: updateParams.emoji || messageState.emoji,
      section: updateParams.section || messageState.section,
      status: updateParams.status || messageState.status,
      symbol: updateParams.symbol || messageState.symbol,
      data: updateParams.data || messageState.data,
      dataFormat: updateParams.dataFormat || messageState.dataFormat,
      // Next state does not inherit the append field
      append: updateParams.append,
      timestamp: Date.now(),
      maxSectionWidth:
        updateParams.maxSectionWidth !== undefined ? updateParams.maxSectionWidth : messageState.maxSectionWidth,
    }

    // Hack to preserve section alignment if spinner disappears
    const hadSpinner = messageState.status === "active"
    const hasSymbolOrSpinner = nextMessageState.symbol || nextMessageState.status === "active"
    if (nextMessageState.section && hadSpinner && !hasSymbolOrSpinner) {
      nextMessageState.symbol = "empty"
    }

    this.messageStates = [...(this.messageStates || []), nextMessageState]

    if (updateParams.metadata) {
      this.metadata = { ...(this.metadata || {}), ...updateParams.metadata }
    }
  }

  // Update node and child nodes
  private deepUpdate(updateParams: UpdateLogEntryParams): void {
    const wasActive = this.getMessageState().status === "active"

    this.update(updateParams)

    // Stop active child nodes if no longer active
    if (wasActive && updateParams.status !== "active") {
      getChildEntries(this).forEach((entry) => {
        if (entry.getMessageState().status === "active") {
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

  getMessageStates() {
    return this.messageStates
  }

  /**
   * Returns a deep copy of the latest message state, if availble.
   * Otherwise return an empty object of type MessageState for convenience.
   */
  getMessageState() {
    if (!this.messageStates) {
      return <MessageState>{}
    }

    // Use spread operator to clone the array
    const msgState = [...this.messageStates][this.messageStates.length - 1]
    // ...and the object itself
    return { ...msgState }
  }

  placeholder(level: LogLevel = LogLevel.info, childEntriesInheritLevel = false): LogEntry {
    // Ensure placeholder child entries align with parent context
    const indent = Math.max((this.indent || 0) - 1, -1)
    return this.addNode({
      level,
      indent,
      childEntriesInheritLevel,
      isPlaceholder: true,
    })
  }

  // Preserves status
  setState(params?: string | UpdateLogEntryParams): LogEntry {
    this.deepUpdate({ ...resolveParams(params) })
    this.root.onGraphChange(this)
    return this
  }

  setDone(params?: string | Omit<UpdateLogEntryParams, "status">): LogEntry {
    this.deepUpdate({ ...resolveParams(params), status: "done" })
    this.root.onGraphChange(this)
    return this
  }

  setSuccess(params?: string | Omit<UpdateLogEntryParams, "status" & "symbol">): LogEntry {
    this.deepUpdate({
      ...resolveParams(params),
      symbol: "success",
      status: "success",
    })
    this.root.onGraphChange(this)
    return this
  }

  setError(params?: string | Omit<UpdateLogEntryParams, "status" & "symbol">): LogEntry {
    this.deepUpdate({
      ...resolveParams(params),
      symbol: "error",
      status: "error",
    })
    this.root.onGraphChange(this)
    return this
  }

  setWarn(param?: string | Omit<UpdateLogEntryParams, "status" & "symbol">): LogEntry {
    this.deepUpdate({
      ...resolveParams(param),
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
    if (this.getMessageState().status === "active") {
      this.update({ symbol: "empty", status: "done" })
      this.root.onGraphChange(this)
    }
    return this
  }

  getChildEntries() {
    return getChildEntries(this)
  }
}
