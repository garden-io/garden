/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as logSymbols from "log-symbols"
import * as nodeEmoji from "node-emoji"
import { flatten } from "lodash"

import { LogNode, LogLevel } from "./log-node"
import { getChildEntries } from "./util"
import { GardenError } from "../exceptions"
import { Omit } from "../util/util"
import { Logger } from "./logger"

export type EmojiName = keyof typeof nodeEmoji.emoji
export type LogSymbol = keyof typeof logSymbols | "empty"
export type EntryStatus = "active" | "done" | "error" | "success" | "warn"

export interface UpdateOpts {
  msg?: string | string[]
  section?: string
  emoji?: EmojiName
  symbol?: LogSymbol
  append?: boolean
  fromStdStream?: boolean
  showDuration?: boolean
  error?: GardenError
  status?: EntryStatus
  indent?: number
}

export interface CreateOpts extends UpdateOpts {
  id?: string
}

export type CreateParam = string | CreateOpts

export interface LogEntryConstructor {
  level: LogLevel
  opts: CreateOpts
  root: Logger
  parent?: LogEntry
}

// TODO Fix any cast
export function resolveParam<T extends UpdateOpts>(param?: string | T): T {
  return typeof param === "string" ? <any>{ msg: param } : param || {}
}

export class LogEntry extends LogNode {
  public opts: UpdateOpts
  public root: Logger

  constructor({ level, opts, root, parent }: LogEntryConstructor) {
    const { id, ...otherOpts } = opts
    super(level, parent, id)
    this.root = root
    this.opts = otherOpts
    if (this.level === LogLevel.error) {
      this.opts.status = "error"
    }
  }

  private setOwnState(nextOpts: UpdateOpts): void {
    let msg: string | string[] | undefined
    const { append, msg: nextMsg } = nextOpts
    const prevMsg = this.opts.msg
    if (prevMsg !== undefined && nextMsg && append) {
      msg = flatten([...[prevMsg], ...[nextMsg]])
    } else if (nextMsg) {
      msg = nextMsg
    } else {
      msg = prevMsg
    }

    // Hack to preserve section alignment if symbols or spinners disappear
    const hadSymbolOrSpinner = this.opts.symbol || this.opts.status === "active"
    const hasSymbolOrSpinner = nextOpts.symbol || nextOpts.status === "active"
    if (this.opts.section && hadSymbolOrSpinner && !hasSymbolOrSpinner) {
      nextOpts.symbol = "empty"
    }

    this.opts = { ...this.opts, ...nextOpts, msg }
  }

  // Update node and child nodes
  private deepSetState(opts: UpdateOpts): void {
    const wasActive = this.opts.status === "active"

    this.setOwnState(opts)

    // Stop active child nodes if parent is no longer active
    if (wasActive && this.opts.status !== "active") {
      getChildEntries(this).forEach(entry => {
        if (entry.opts.status === "active") {
          entry.setOwnState({ status: "done" })
        }
      })
    }
  }

  protected createNode(level: LogLevel, param: CreateParam) {
    // A child entry must not have a higher level than its parent
    const childLevel = this.level > level ? this.level : level
    const opts = {
      indent: (this.opts.indent || 0) + 1,
      ...resolveParam(param),
    }
    return new LogEntry({
      opts,
      level: childLevel,
      root: this.root,
      parent: this,
    })
  }

  protected onGraphChange(node: LogEntry) {
    this.root.onGraphChange(node)
  }

  placeholder(level: LogLevel = LogLevel.info): LogEntry {
    // Ensure placeholder child entries align with parent context
    const indent = Math.max((this.opts.indent || 0) - 1, - 1)
    return this.appendNode(level, { indent })
  }

  // Preserves status
  setState(param?: string | UpdateOpts): LogEntry {
    this.deepSetState({ ...resolveParam(param), status: this.opts.status })
    this.root.onGraphChange(this)
    return this
  }

  setDone(param?: string | Omit<UpdateOpts, "status">): LogEntry {
    this.deepSetState({ ...resolveParam(param), status: "done" })
    this.root.onGraphChange(this)
    return this
  }

  setSuccess(param?: string | Omit<UpdateOpts, "status" & "symbol">): LogEntry {
    this.deepSetState({ ...resolveParam(param), symbol: "success", status: "success" })
    this.root.onGraphChange(this)
    return this
  }

  setError(param?: string | Omit<UpdateOpts, "status" & "symbol">): LogEntry {
    this.deepSetState({ ...resolveParam(param), symbol: "error", status: "error" })
    this.root.onGraphChange(this)
    return this
  }

  setWarn(param?: string | Omit<UpdateOpts, "status" & "symbol">): LogEntry {
    this.deepSetState({ ...resolveParam(param), symbol: "warning", status: "warn" })
    this.root.onGraphChange(this)
    return this
  }

  fromStdStream(): boolean {
    return !!this.opts.fromStdStream
  }

  stopAll() {
    return this.root.stop()
  }

  stop() {
    // Stop gracefully if still in active state
    if (this.opts.status === "active") {
      this.setOwnState({ symbol: "empty", status: "done" })
      this.root.onGraphChange(this)
    }
    return this
  }

  inspect() {
    console.log(JSON.stringify({
      ...this.opts,
      level: this.level,
      children: this.children,
    }))
  }

  filterBySection(section: string): LogEntry[] {
    return getChildEntries(this).filter(entry => entry.opts.section === section)
  }

}
