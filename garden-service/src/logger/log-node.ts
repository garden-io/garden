/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as uniqid from "uniqid"
import { round } from "lodash"

import { LogEntry, CreateParam } from "./log-entry"

export enum LogLevel {
  error = 0,
  warn = 1,
  info = 2,
  verbose = 3,
  debug = 4,
  silly = 5,
}

export abstract class LogNode {
  public readonly timestamp: number
  public readonly key: string
  public readonly children: LogEntry[]

  constructor(
    public readonly level: LogLevel,
    public readonly parent?: LogEntry,
    public readonly id?: string,
  ) {
    this.key = uniqid()
    this.timestamp = Date.now()
    this.children = []
  }

  protected abstract createNode(level: LogLevel, param: CreateParam): LogEntry
  protected abstract onGraphChange(node: LogEntry): void

  /**
   * A placeholder entry is an empty entry whose children should be aligned with the parent context.
   * Useful for setting a placeholder in the middle of the log that can later be populated.
   */
  abstract placeholder(level: LogLevel): LogEntry

  protected appendNode(level: LogLevel, param: CreateParam): LogEntry {
    const node = this.createNode(level, param)
    this.children.push(node)
    this.onGraphChange(node)
    return node
  }

  silly(param: CreateParam): LogEntry {
    return this.appendNode(LogLevel.silly, param)
  }

  debug(param: CreateParam): LogEntry {
    return this.appendNode(LogLevel.debug, param)
  }

  verbose(param: CreateParam): LogEntry {
    return this.appendNode(LogLevel.verbose, param)
  }

  info(param: CreateParam): LogEntry {
    return this.appendNode(LogLevel.info, param)
  }

  warn(param: CreateParam): LogEntry {
    return this.appendNode(LogLevel.warn, param)
  }

  error(param: CreateParam): LogEntry {
    return this.appendNode(LogLevel.error, param)
  }

  /**
   * Returns the duration in seconds, defaults to 2 decimal precision
   */
  getDuration(precision: number = 2): number {
    return round((Date.now() - this.timestamp) / 1000, precision)
  }

}
