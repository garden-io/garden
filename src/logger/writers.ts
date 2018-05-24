/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as ansiEscapes from "ansi-escapes"
import * as cliCursor from "cli-cursor"
import * as elegantSpinner from "elegant-spinner"
import * as path from "path"
import * as winston from "winston"
import * as wrapAnsi from "wrap-ansi"
import chalk from "chalk"
const stripAnsi = require("strip-ansi")

import { getChildEntries, getTerminalWidth, interceptStream } from "./util"
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
import { sleep } from "../util"

const { combine: winstonCombine, timestamp, printf } = winston.format

const FANCY_LOGGER_UPDATE_FREQUENCY_MS = 100
const FANCY_LOGGER_THROTTLE_MS = 600
const DEFAULT_LOG_FILENAME = "development.log"
const DEFAULT_FILE_TRANSPORT_OPTIONS = {
  format: winstonCombine(
    timestamp(),
    printf(info => `\n[${info.timestamp}] ${info.message}`),
  ),
  maxsize: 10000000, // 10 MB
  maxFiles: 1,
}

const spinnerStyle = chalk.cyan
const levelToStr = (lvl: LogLevel): string => LogLevel[lvl]
const validate = (level: LogLevel, entry: LogEntry): boolean => {
  return level >= entry.level && entry.opts.msg !== undefined
}

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
  abstract onGraphChange(entry: LogEntry, rootLogNode: RootLogNode): void
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
    if (validate(this.level, entry)) {
      return stripAnsi(renderFn(entry))
    }
    return null
  }

  onGraphChange(entry: LogEntry) {
    const out = this.render(entry)
    if (out) {
      this.winston.log(levelToStr(entry.level), out)
    }
  }

  stop() { }
}

function formatForTerminal(entry: LogEntry): string {
  let renderers
  if (entry.depth > 0) {
    // Skip section on child entries.
    renderers = [
      [leftPad, [entry]],
      [renderSymbol, [entry]],
      [renderEmoji, [entry]],
      [renderMsg, [entry]],
      [renderDuration, [entry]],
      ["\n"],
    ]
  } else {
    renderers = [
      [renderSymbol, [entry]],
      [renderSection, [entry]],
      [renderEmoji, [entry]],
      [renderMsg, [entry]],
      [renderDuration, [entry]],
      ["\n"],
    ]
  }
  return combine(renderers)
}

export class BasicTerminalWriter extends Writer {
  public level: LogLevel

  render(entry: LogEntry, rootLogNode: RootLogNode): string | null {
    const level = this.level || rootLogNode.level
    if (validate(level, entry)) {
      return formatForTerminal(entry)
    }
    return null
  }

  onGraphChange(entry: LogEntry, rootLogNode: RootLogNode) {
    const out = this.render(entry, rootLogNode)
    if (out) {
      console.log(out)
    }
  }

  stop() { }
}

export type Coords = [number, number]

export interface TerminalEntry {
  key: string
  text: string
  lineNumber: number
  spinnerCoords?: Coords
}

export interface TerminalEntryWithSpinner extends TerminalEntry {
  spinnerCoords: Coords
}

export interface CustomStream extends NodeJS.WriteStream {
  cleanUp: Function
}

export class FancyTerminalWriter extends Writer {
  private spinners: { [key: string]: Function }
  private intervalID: NodeJS.Timer | null
  private stream: CustomStream
  private prevOutput: string[]
  private lastInterceptAt: number | null
  private updatePending: boolean

  public level: LogLevel

  constructor(config: WriterConfig = {}) {
    super(config)
    this.intervalID = null
    this.spinners = {} // Each entry has it's own spinner
    this.prevOutput = []
    this.lastInterceptAt = null
    this.updatePending = false
  }

  private initStream(rootLogNode: RootLogNode): CustomStream {
    // Create custom stream that calls write method with the 'noIntercept' option.
    const stream = <CustomStream>{
      ...process.stdout,
      write: (str, enc, cb) => (<any>process.stdout.write)(str, enc, cb, { noIntercept: true }),
    }

    const onIntercept = msg => rootLogNode.info({ msg, fromStdStream: true })

    const restoreStreamFns = [
      interceptStream(process.stdout, onIntercept),
      interceptStream(process.stderr, onIntercept),
    ]

    stream.cleanUp = () => {
      cliCursor.show(this.stream)
      restoreStreamFns.forEach(restoreStream => restoreStream())
    }

    return stream
  }

  private startLoop(entries: TerminalEntryWithSpinner[], totalLines: number): void {
    const updateSpinners = () => {
      entries.forEach(e => {
        let out = ""
        const [x, y] = e.spinnerCoords
        const termX = x === 0 ? x : x + 1
        const termY = -(totalLines - y - 1)
        out += ansiEscapes.cursorSavePosition
        out += ansiEscapes.cursorTo(0) // Ensure cursor is to the left
        out += ansiEscapes.cursorMove(termX, termY)
        out += spinnerStyle(this.tickSpinner(e.key))
        out += ansiEscapes.cursorRestorePosition
        this.stream.write(out)
      })
    }
    if (!this.intervalID) {
      this.intervalID = setInterval(updateSpinners, FANCY_LOGGER_UPDATE_FREQUENCY_MS)
    }
  }

  private stopLoop(): void {
    if (this.intervalID) {
      clearInterval(this.intervalID)
      this.intervalID = null
    }
  }

  private tickSpinner(key: string): string {
    if (!this.spinners[key]) {
      this.spinners[key] = elegantSpinner()
    }
    return this.spinners[key]()
  }

  private write(output: string[], nextEntry: TerminalEntry) {
    cliCursor.hide(this.stream)

    const lineNumber = output.length >= this.prevOutput.length ? nextEntry.lineNumber : 0
    const nLinesToErase = this.prevOutput.length - lineNumber
    this.stream.write(
      ansiEscapes.eraseLines(nLinesToErase) + output.slice(lineNumber).join("\n"),
    )
  }

  private handleGraphChange(logEntry: LogEntry, rootLogNode: RootLogNode, didWrite: boolean = false) {
    this.stopLoop()
    this.updatePending = false

    // Suspend processing and write immediately if a lot of data is being intercepted, e.g. when user is typing in input
    if (logEntry.fromStdStream() && !didWrite) {
      const now = Date.now()
      const throttleProcessing = this.lastInterceptAt && (now - this.lastInterceptAt) < FANCY_LOGGER_THROTTLE_MS
      this.lastInterceptAt = now

      if (throttleProcessing) {
        this.stream.write(renderMsg(logEntry))
        this.updatePending = true

        // Resume processing if idle and original update is still pending
        const maybeResume = async () => {
          await sleep(FANCY_LOGGER_THROTTLE_MS)
          if (this.updatePending) {
            this.handleGraphChange(logEntry, rootLogNode, true)
          }
        }
        maybeResume()
        return
      }
    }

    const terminalEntries = this.toTerminalEntries(rootLogNode)
    const nextEntry = terminalEntries.find(e => e.key === logEntry.key)

    // Nothing to do, e.g. because entry level is higher than writer level
    if (!nextEntry) {
      return
    }

    const output = this.render(terminalEntries)
    if (!didWrite) {
      this.write(output, nextEntry)
    }

    const entriesWithspinner = <TerminalEntryWithSpinner[]>terminalEntries.filter(e => e.spinnerCoords)

    if (entriesWithspinner.length > 0) {
      this.startLoop(entriesWithspinner, output.length)
    }

    this.prevOutput = output
  }

  public toTerminalEntries(rootLogNode: RootLogNode): TerminalEntry[] {
    const level = this.level || rootLogNode.level
    let currentLineNumber = 0

    return getChildEntries(rootLogNode)
      .filter(entry => validate(level, entry))
      .reduce((acc: TerminalEntry[], entry: LogEntry): TerminalEntry[] => {
        let spinnerFrame = ""
        let spinnerX
        let spinnerCoords: Coords | undefined

        if (entry.status === EntryStatus.ACTIVE) {
          spinnerX = leftPad(entry).length
          spinnerFrame = this.tickSpinner(entry.key)
          spinnerCoords = [spinnerX, currentLineNumber]
        } else {
          delete this.spinners[entry.key]
        }

        const text = [entry]
          .map(e => (
            e.fromStdStream()
              ? renderMsg(e)
              : formatForTerminal(e)
          ))
          .map(str => (
            spinnerFrame
              ? `${str.slice(0, spinnerX)}${spinnerStyle(spinnerFrame)} ${str.slice(spinnerX)}`
              : str
          ))
          .map(str => wrapAnsi(str, getTerminalWidth(this.stream), {
            trim: false,
            hard: true,
            wordWrap: false,
          }))
          .pop()!

        acc.push({
          key: entry.key,
          lineNumber: currentLineNumber,
          spinnerCoords,
          text,
        })

        currentLineNumber += text.split("\n").length - 1

        return acc
      }, [])
  }

  public render(terminalEntries: TerminalEntry[]): string[] {
    return terminalEntries.map(e => e.text).join("").split("\n")
  }

  public onGraphChange(logEntry: LogEntry, rootLogNode: RootLogNode): void {
    if (!this.stream) {
      this.stream = this.initStream(rootLogNode)
    }

    this.handleGraphChange(logEntry, rootLogNode, false)
  }

  public stop(): void {
    this.stopLoop()
    this.stream && this.stream.cleanUp()
  }

}
