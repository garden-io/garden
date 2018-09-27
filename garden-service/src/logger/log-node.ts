/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as uniqid from "uniqid"
import { round } from "lodash"

import { findLogNode } from "./util"
import { LogEntry, CreateParam } from "./log-entry"

export enum LogLevel {
  error = 0,
  warn = 1,
  info = 2,
  verbose = 3,
  debug = 4,
  silly = 5,
}

export abstract class LogNode<T = LogEntry, U = CreateParam> {
  public readonly timestamp: number
  public readonly key: string
  public readonly children: T[]
  public readonly root: RootLogNode<T>

  constructor(
    public readonly level: LogLevel,
    public readonly parent?: LogNode<T>,
    public readonly id?: string,
  ) {
    if (this instanceof RootLogNode) {
      this.root = this
    } else {
      // Non-root nodes have a parent
      this.root = parent!.root
    }
    this.key = uniqid()
    this.timestamp = Date.now()
    this.children = []
  }

  abstract createNode(level: LogLevel, parent: LogNode<T, U>, param?: U): T

  protected appendNode(level: LogLevel, param?: U): T {
    const node = this.createNode(level, this, param)
    this.children.push(node)
    this.root.onGraphChange(node)
    return node
  }

  silly(param?: U): T {
    return this.appendNode(LogLevel.silly, param)
  }

  debug(param?: U): T {
    return this.appendNode(LogLevel.debug, param)
  }

  verbose(param?: U): T {
    return this.appendNode(LogLevel.verbose, param)
  }

  info(param?: U): T {
    return this.appendNode(LogLevel.info, param)
  }

  warn(param?: U): T {
    return this.appendNode(LogLevel.warn, param)
  }

  error(param?: U): T {
    return this.appendNode(LogLevel.error, param)
  }

  /**
   * Returns the duration in seconds, defaults to 2 decimal precision
   */
  getDuration(precision: number = 2): number {
    return round((Date.now() - this.timestamp) / 1000, precision)
  }

}

export abstract class RootLogNode<T = LogEntry> extends LogNode<T> {
  abstract onGraphChange(node: T): void

  findById(id: string): T | void {
    return findLogNode(this, node => node.id === id)
  }

}
