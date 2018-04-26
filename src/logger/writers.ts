/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as cliCursor from "cli-cursor"
import * as elegantSpinner from "elegant-spinner"
import * as logUpdate from "log-update"
import * as path from "path"
import * as winston from "winston"
import chalk from "chalk"
const stripAnsi = require("strip-ansi")

import { getChildEntries, interceptStream } from "./util"
import {
  EntryStatus,
  LogLevel,
} from "./types"

import {
  combine,
  leftPad,
  renderDuration,
  renderEmoji,
  renderError,
  renderMsg,
  renderSection,
  renderSymbol,
} from "./renderers"

import { LogEntry, RootLogNode } from "./index"

const { combine: winstonCombine, timestamp, printf } = winston.format

const INTERVAL_DELAY = 100
const spinnerStyle = chalk.cyan
const DEFAULT_LOG_FILENAME = "development.log"
const DEFAULT_FILE_TRANSPORT_OPTIONS = {
  format: winstonCombine(
    timestamp(),
    printf(info => `\n[${info.timestamp}] ${info.message}`),
  ),
  maxsize: 10000000, // 10 MB
  maxFiles: 1,
}

const levelToStr = (lvl: LogLevel): string => LogLevel[lvl]

export interface WriterConfig {
  level?: LogLevel
}

export interface FileWriterConfig {
  level: LogLevel
  root: string
  filename?: string
  fileTransportOptions?: {}
}

export abstract class Writer {
  public level: LogLevel | undefined

  constructor({ level }: WriterConfig = {}) {
    this.level = level
  }

  abstract render(...args): string | string[] | null
  abstract write(entry: LogEntry, rootLogNode: RootLogNode): void
  abstract stop(): void
}

export class FileWriter extends Writer {
  private winston: any // Types are still missing from Winston 3.x.x.

  public level: LogLevel

  constructor(config: FileWriterConfig) {
    const {
      fileTransportOptions = DEFAULT_FILE_TRANSPORT_OPTIONS,
      filename = DEFAULT_LOG_FILENAME,
      level,
      root,
    } = config

    super({ level })

    this.winston = winston.createLogger({
      level: levelToStr(level),
      transports: [
        new winston.transports.File({
          ...fileTransportOptions,
          filename: path.join(root, filename),
        }),
      ],
    })
  }

  render(entry: LogEntry): string | null {
    const renderFn = entry.level === LogLevel.error ? renderError : renderMsg
    if (entry.opts.msg && this.level >= entry.level) {
      return stripAnsi(renderFn(entry))
    }
    return null
  }

  write(entry: LogEntry) {
    const out = this.render(entry)
    if (out) {
      this.winston.log(levelToStr(entry.level), out)
    }
  }

  stop() { }
}

function formatForConsole(entry: LogEntry): string {
  let renderers
  if (entry.depth > 0) {
    // Skip section on child entries.
    renderers = [
      [leftPad, [entry]],
      [renderSymbol, [entry]],
      [renderEmoji, [entry]],
      [renderMsg, [entry]],
      [renderDuration, [entry]],
    ]
  } else {
    renderers = [
      [renderSymbol, [entry]],
      [renderSection, [entry]],
      [renderEmoji, [entry]],
      [renderMsg, [entry]],
      [renderDuration, [entry]],
    ]
  }
  return combine(renderers)
}

export class BasicConsoleWriter extends Writer {
  public level: LogLevel

  render(entry: LogEntry, rootLogNode: RootLogNode): string | null {
    const level = this.level || rootLogNode.level
    if (level >= entry.level) {
      return formatForConsole(entry)
    }
    return null
  }

  write(entry: LogEntry, rootLogNode: RootLogNode) {
    const out = this.render(entry, rootLogNode)
    if (out) {
      console.log(out)
    }
  }

  stop() { }
}

export class FancyConsoleWriter extends Writer {
  private spinners: Function[]
  private formattedEntries: string[]
  private logUpdate: any
  private intervalID: number | null
  public persistedAtIdx: number

  public level: LogLevel

  constructor(config: WriterConfig = {}) {
    super(config)
    this.intervalID = null
    this.formattedEntries = [] // Entries are cached on format
    this.spinners = [] // Each entry has it's own spinner
    this.persistedAtIdx = 0
  }

  private initLogUpdate(rootLogNode: RootLogNode): any {
    // Create custom stream that calls write method with the 'noIntercept' option.
    const stream = {
      ...process.stdout,
      write: (str, enc, cb) => (<any>process.stdout.write)(str, enc, cb, { noIntercept: true }),
    }
    const makeOpts = msg => ({
      msg,
      notOriginatedFromLogger: true,
    })
    /**
     * NOTE: On every write, log-update library calls the cli-cursor library to hide the cursor
     * which the cli-cursor library does via stderr write. This causes an infinite loop as
     * the stderr writes are intercepted and funneled back to the Logger.
     * Therefore we manually toggle the cursor using the custom stream from above.
     *
     * log-update types are missing the `opts?: {showCursor?: boolean}` parameter
     */
    const customLogUpdate = (<any>logUpdate.create)(<any>stream, { showCursor: true })
    cliCursor.hide(stream)

    const restoreStreamFns = [
      interceptStream(process.stdout, msg => rootLogNode.info(makeOpts(msg))),
      interceptStream(process.stderr, msg => rootLogNode.error(makeOpts(msg))),
    ]

    customLogUpdate.cleanUp = () => {
      cliCursor.show(stream)
      restoreStreamFns.forEach(restoreStream => restoreStream())
      logUpdate.done()
    }

    return customLogUpdate
  }

  private startLoop(rootLogNode: RootLogNode): void {
    if (!this.intervalID) {
      this.intervalID = setInterval(this.updateStream.bind(this, rootLogNode), INTERVAL_DELAY)
    }
  }

  private stopLoop(): void {
    if (this.intervalID) {
      clearInterval(this.intervalID)
      this.intervalID = null
    }
  }

  private readOrSetSpinner(idx: number): string {
    if (!this.spinners[idx]) {
      this.spinners[idx] = elegantSpinner()
    }
    return this.spinners[idx]()
  }

  private readerOrSetFormattedEntry(entry: LogEntry, idx: number): string {
    if (!this.formattedEntries[idx]) {
      this.formattedEntries[idx] = formatForConsole(entry)
    }
    return this.formattedEntries[idx]
  }

  private updateStream(rootLogNode: RootLogNode): void {
    const out = this.render(rootLogNode)
    if (out) {
      this.logUpdate(out.join(""))
    }
  }

  /*
    Has a side effect in that it starts/stops the rendering loop depending on
    whether or not active entries were found while building output
  */
  public render(rootLogNode: RootLogNode): string[] | null {
    let hasActiveEntries = false
    const level = this.level || rootLogNode.level
    const entries = getChildEntries(rootLogNode)

    /**
     * This is a bit ugly for performance sake.
     * Rather than just creating a new string with an updated spinner frame in each render cycle
     * we instead cache the formatted string and splice the updated frame into it.
     */
    const out = entries.slice(this.persistedAtIdx).reduce((acc: string[], entry: LogEntry, idx: number): string[] => {
      let spinnerFrame = ""

      if (entry.notOriginatedFromLogger()) {
        acc.push(renderMsg(entry))
        return acc
      }

      if (entry.status === EntryStatus.ACTIVE) {
        hasActiveEntries = true
        spinnerFrame = this.readOrSetSpinner(idx)
      }
      if (level >= entry.level) {
        const formatted = this.readerOrSetFormattedEntry(entry, idx)
        const startPos = leftPad(entry).length
        const withSpinner = spinnerFrame
          ? `${formatted.slice(0, startPos)}${spinnerStyle(spinnerFrame)} ${formatted.slice(startPos)}`
          : formatted
        acc.push(withSpinner + "\n")
      }
      return acc
    }, [])

    if (hasActiveEntries) {
      this.startLoop(rootLogNode)
    } else {
      this.stopLoop()
    }
    if (out.length) {
      return out
    }
    return null
  }

  public write(_, rootLogNode: RootLogNode): void {
    // Init on first write to prevent unneccesary stream hijacking.
    if (!this.logUpdate) {
      this.logUpdate = this.initLogUpdate(rootLogNode)
    }
    // Clear cache
    this.formattedEntries = []
    this.updateStream(rootLogNode)
  }

  public stop(): void {
    this.stopLoop()
    this.logUpdate && this.logUpdate.cleanUp()
    this.logUpdate = null
  }

  /**
   * Escape hatch for reclaiming the stream, e.g. when reading stdin.
   * Logger will then continue afterwards but won't be able to update the previous content
   */
  public stopAndPersist(rootLogNode: RootLogNode): void {
    this.stop()
    this.persistedAtIdx = rootLogNode.children.length
  }

}
