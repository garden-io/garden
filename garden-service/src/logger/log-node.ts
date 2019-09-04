/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import uniqid from "uniqid"
import { round } from "lodash"

import { LogEntry, LogEntryParams } from "./log-entry"

export enum LogLevel {
  error = 0,
  warn = 1,
  info = 2,
  verbose = 3,
  debug = 4,
  silly = 5,
}

export interface CreateNodeParams extends LogEntryParams {
  level: LogLevel
  isPlaceholder?: boolean
}

export function resolveParams(level: LogLevel, params: string | LogEntryParams): CreateNodeParams {
  if (typeof params === "string") {
    return { msg: params, level }
  }
  return { ...params, level }
}

export abstract class LogNode {
  public readonly timestamp: number
  public readonly key: string
  public readonly children: LogEntry[]

  constructor(public readonly level: LogLevel, public readonly parent?: LogEntry, public readonly id?: string) {
    this.key = uniqid()
    this.timestamp = Date.now()
    this.children = []
  }

  protected abstract createNode(params: CreateNodeParams): LogEntry
  protected abstract onGraphChange(node: LogEntry): void

  /**
   * A placeholder entry is an empty entry whose children should be aligned with the parent context.
   * Useful for setting a placeholder in the middle of the log that can later be populated.
   */
  abstract placeholder(level: LogLevel, childEntriesInheritLevel?: boolean): LogEntry

  protected addNode(params: CreateNodeParams): LogEntry {
    const node = this.createNode(params)
    this.children.push(node)
    this.onGraphChange(node)
    return node
  }

  silly(params: string | LogEntryParams): LogEntry {
    return this.addNode(resolveParams(LogLevel.silly, params))
  }

  debug(params: string | LogEntryParams): LogEntry {
    return this.addNode(resolveParams(LogLevel.debug, params))
  }

  verbose(params: string | LogEntryParams): LogEntry {
    return this.addNode(resolveParams(LogLevel.verbose, params))
  }

  info(params: string | LogEntryParams): LogEntry {
    return this.addNode(resolveParams(LogLevel.info, params))
  }

  warn(params: string | LogEntryParams): LogEntry {
    return this.addNode(resolveParams(LogLevel.warn, params))
  }

  error(params: string | LogEntryParams): LogEntry {
    return this.addNode(resolveParams(LogLevel.error, params))
  }

  /**
   * Returns the duration in seconds, defaults to 2 decimal precision
   */
  getDuration(precision: number = 2): number {
    return round((Date.now() - this.timestamp) / 1000, precision)
  }
}
