/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import nodeEmoji from "node-emoji"
import chalk from "chalk"
import CircularJSON from "circular-json"
import { LogNode, LogLevel } from "./log-node"
import { LogEntry, LogEntryParams, EmojiName } from "./log-entry"
import { isBuffer } from "util"
import { deepMap } from "../util/util"

export interface Node {
  children: any[]
}

export type LogOptsResolvers = { [K in keyof LogEntryParams]?: Function }

export type ProcessNode<T extends Node = Node> = (node: T) => boolean

function traverseChildren<T extends Node, U extends Node>(node: T | U, cb: ProcessNode<U>, reverse = false) {
  const children = node.children
  for (let i = 0; i < children.length; i++) {
    const index = reverse ? children.length - 1 - i : i
    const proceed = cb(children[index])
    if (!proceed) {
      return
    }
    traverseChildren(children[index], cb)
  }
}

// Parent (T|U) can have different type then child (U)
export function getChildNodes<T extends Node, U extends Node>(node: T | U): U[] {
  let childNodes: U[] = []
  traverseChildren<T, U>(node, (child) => {
    childNodes.push(child)
    return true
  })
  return childNodes
}

export function getChildEntries(node: LogNode): LogEntry[] {
  return getChildNodes<LogNode, LogEntry>(node)
}

export function findParentEntry(entry: LogEntry, predicate: ProcessNode<LogEntry>): LogEntry | null {
  return predicate(entry) ? entry : entry.parent ? findParentEntry(entry.parent, predicate) : null
}

export function findLogNode(node: LogNode, predicate: ProcessNode<LogNode>): LogEntry | void {
  let found: LogEntry | undefined
  traverseChildren<LogNode, LogEntry>(node, (entry) => {
    if (predicate(entry)) {
      found = entry
      return false
    }
    return true
  })
  return found
}

/**
 * Given a LogNode, get a list of LogEntries that represent the last `lines` number of log lines nested under the node.
 * Note that the returned number of lines may be slightly higher, so you should slice after rendering them (which
 * you anyway need to do if you're wrapping the lines to a certain width).
 *
 * @param node   the log node whose child entries we want to tail
 * @param level  maximum log level to include
 * @param lines  how many lines to aim for
 */
export function tailChildEntries(node: LogNode | LogEntry, level: LogLevel, lines: number): LogEntry[] {
  let output: LogEntry[] = []
  let outputLines = 0

  traverseChildren<LogNode, LogEntry>(node, (entry) => {
    if (entry.level <= level) {
      output.push(entry)
      const msg = entry.getMessageState().msg || ""
      outputLines += msg.length > 0 ? msg.split("\n").length : 0

      if (outputLines >= lines) {
        return false
      }
    }
    return true
  })

  return output
}

/**
 * Get the log entry preceding the given `entry` in its tree, given the minimum log `level`.
 */
export function getPrecedingEntry(entry: LogEntry) {
  if (!entry.parent) {
    // This is the first entry in its tree
    return
  }

  const siblings = entry.parent.children
  const index = siblings.findIndex((e) => e.key === entry.key)

  if (index === 0) {
    // The nearest entry is the parent
    return entry.parent
  } else {
    // The nearest entry is the last entry nested under the next sibling above,
    // or the sibling itself if it has no child nodes
    const sibling = siblings[index - 1]
    const siblingChildren = getChildEntries(sibling)

    if (siblingChildren.length > 0) {
      return siblingChildren[siblingChildren.length - 1]
    } else {
      return sibling
    }
  }
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

  stream.write = ((write) => (
    string: string,
    encoding?: string,
    cb?: Function,
    extraParam?: StreamWriteExtraParam
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

export let overrideTerminalWidth: number | undefined

export function getTerminalWidth(stream: NodeJS.WriteStream = process.stdout) {
  // Used for unit tests
  if (overrideTerminalWidth) {
    return overrideTerminalWidth
  }

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

/**
 * Prints emoji if supported and adds padding to the right (otherwise subsequent text flows over the emoji).
 */
export function printEmoji(emoji: EmojiName, log: LogEntry) {
  if (log.root.useEmoji && nodeEmoji.hasEmoji(emoji)) {
    return `${nodeEmoji.get(emoji)} `
  }
  return ""
}

export function printHeader(log: LogEntry, command: string, emoji: EmojiName): LogEntry {
  log.info(chalk.bold.magenta(command) + " " + printEmoji(emoji, log))
  return log.info("") // Print new line after header
}

export function printFooter(log: LogEntry) {
  log.info("") // Print new line before footer
  return log.info(chalk.bold.magenta("Done!") + " " + printEmoji("heavy_check_mark", log))
}

export function printWarningMessage(log: LogEntry, text: string) {
  return log.info({ emoji: "warning", msg: chalk.bold.yellow(text) })
}

/**
 * Strips undefined values and circular references from an object.
 */
export function sanitizeObject(obj: any) {
  obj = deepMap(obj, (value: any) => {
    return isBuffer(value) ? "<Buffer>" : value
  })
  return JSON.parse(CircularJSON.stringify(obj))
}
