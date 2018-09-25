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
import * as wrapAnsi from "wrap-ansi"
import chalk from "chalk"

import {
  formatForTerminal,
  leftPad,
  renderMsg,
} from "../renderers"
import { LogEntry } from "../log-entry"
import { Logger } from "../logger"
import { LogLevel } from "../log-node"
import {
  getChildEntries,
  getTerminalWidth,
  interceptStream,
  validate,
} from "../util"
import { Writer, WriterConfig } from "./base"

const INTERVAL_MS = 60
const THROTTLE_MS = 600

const spinnerStyle = chalk.cyan

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

  private initStream(logger: Logger): CustomStream {
    // Create custom stream that calls write method with the 'noIntercept' option.
    const stream = <CustomStream>{
      ...process.stdout,
      write: (str, enc, cb) => (<any>process.stdout.write)(str, enc, cb, { noIntercept: true }),
    }

    const onIntercept = msg => logger.info({ msg, fromStdStream: true })

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

  private spin(entries: TerminalEntryWithSpinner[], totalLines: number): void {
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

  private startLoop(entries: TerminalEntryWithSpinner[], totalLines: number): void {
    this.stopLoop()
    this.intervalID = setInterval(
      () => this.spin(entries, totalLines),
      INTERVAL_MS,
    )
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

  private handleGraphChange(logEntry: LogEntry, logger: Logger, didWrite: boolean = false) {
    this.updatePending = false

    // Suspend processing and write immediately if a lot of data is being intercepted, e.g. when user is typing in input
    if (logEntry.fromStdStream() && !didWrite) {
      const now = Date.now()
      const throttleProcessing = this.lastInterceptAt && (now - this.lastInterceptAt) < THROTTLE_MS
      this.lastInterceptAt = now

      if (throttleProcessing) {
        this.stopLoop()
        this.stream.write(renderMsg(logEntry))
        this.updatePending = true

        // Resume processing if idle and original update is still pending
        setTimeout(() => {
          if (this.updatePending) {
            this.handleGraphChange(logEntry, logger, true)
          }
        }, THROTTLE_MS)
        return
      }
    }

    const terminalEntries = this.toTerminalEntries(logger)
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
    } else {
      this.stopLoop()
    }

    this.prevOutput = output
  }

  public toTerminalEntries(logger: Logger): TerminalEntry[] {
    const level = this.level || logger.level
    let currentLineNumber = 0

    return getChildEntries(logger)
      .filter(entry => validate(level, entry))
      .reduce((acc: TerminalEntry[], entry: LogEntry): TerminalEntry[] => {
        let spinnerFrame = ""
        let spinnerX
        let spinnerCoords: Coords | undefined

        if (entry.opts.status === "active") {
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

  public onGraphChange(logEntry: LogEntry, logger: Logger): void {
    if (!this.stream) {
      this.stream = this.initStream(logger)
    }

    this.handleGraphChange(logEntry, logger, false)
  }

  public stop(): void {
    this.stopLoop()
    this.stream && this.stream.cleanUp()
  }

}
