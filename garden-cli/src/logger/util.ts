/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { LogEntryOpts, LogLevel } from "./types"
import { LogEntry, LogNode } from "./logger"

export interface Node {
  children: any[]
}

export type LogOptsResolvers = { [K in keyof LogEntryOpts]?: Function }

export type ProcessNode<T extends Node = Node> = (node: T) => boolean

// Assumes root node can be of different type than child nodes
function traverseChildren<T extends Node, U extends Node>(node: T | U, cb: ProcessNode<U>) {
  const children = node.children
  for (let idx = 0; idx < children.length; idx++) {
    const proceed = cb(children[idx])
    if (!proceed) {
      return
    }
    traverseChildren(children[idx], cb)
  }
}

export function getChildNodes<T extends Node, U extends Node = T>(node: T | U): U[] {
  let array: U[] = []
  traverseChildren<T, U>(node, child => {
    array.push(child)
    return true
  })
  return array
}

export function getChildEntries(node: LogNode): LogEntry[] {
  return getChildNodes<LogNode, LogEntry>(node)
}

export function findLogEntry(node: LogNode, predicate: ProcessNode<LogEntry>): LogEntry | void {
  let found
  traverseChildren<LogNode, LogEntry>(node, entry => {
    if (predicate(entry)) {
      found = entry
      return false
    }
    return true
  })
  return found
}

function mergeWithResolvers(objA: any, objB: any, resolvers: any = {}) {
  const returnObj = { ...objA, ...objB }
  return Object.keys(resolvers).reduce((acc, key) => {
    acc[key] = resolvers[key](objA, objB)
    return acc
  }, returnObj)
}

export function mergeLogOpts(prevOpts: LogEntryOpts, nextOpts: LogEntryOpts, resolvers: LogOptsResolvers) {
  return mergeWithResolvers(prevOpts, nextOpts, resolvers)
}

export function duration(startTime: number): string {
  return ((Date.now() - startTime) / 1000).toFixed(2)
}

interface StreamWriteExtraParam {
  noIntercept?: boolean
}

/**
 * Intercepts the write method of a WriteableStream and calls the provided callback on the
 * string to write (or optionally applies the string to the write method)
 * Returns a function which sets the write back to default.
 *
 * Used e.g. by FancyLogger so that writes from other sources can be intercepted
 * and pushed to the log stack.
 */
export function interceptStream(stream: NodeJS.WriteStream, callback: Function) {
  const prevWrite = stream.write

  stream.write = (write =>
    (
      string: string,
      encoding?: string,
      cb?: Function,
      extraParam?: StreamWriteExtraParam,
    ): boolean => {
      if (extraParam && extraParam.noIntercept) {
        const args = [string, encoding, cb]
        return write.apply(stream, args)
      }
      callback(string)
      return true
    })(stream.write) as any

  const restore = () => {
    stream.write = prevWrite
  }

  return restore
}

export function getTerminalWidth(stream: NodeJS.WriteStream = process.stdout) {
  const columns = (stream || {}).columns

  if (!columns) {
    return 80
  }

  // Windows appears to wrap a character early
  if (process.platform === "win32") {
    return columns - 1
  }

  return columns
}

export function validate(level: LogLevel, entry: LogEntry): boolean {
  return level >= entry.level && entry.opts.msg !== undefined
}
