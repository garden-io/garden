/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import cliCursor from "cli-cursor"
import elegantSpinner from "elegant-spinner"
import wrapAnsi from "wrap-ansi"
import chalk from "chalk"
import blessed from "neo-blessed"

import { formatForTerminal, leftPad, renderMsg } from "../renderers"
import { LogEntry } from "../log-entry"
import { Logger } from "../logger"
import { LogLevel } from "../log-node"
import { getChildEntries, getPrecedingEntry } from "../util"
import { Writer } from "./base"
import { shutdown } from "../../util/util"
import { dedent } from "../../util/string"
import { max, sum, min } from "lodash"

const INTERVAL_MS = 60

const spinnerStyle = chalk.cyan
const spinnerBytes = spinnerStyle(elegantSpinner()()).length

export type Coords = [number, number]

export interface TerminalEntry {
  key: string
  lines: string[]
  lineNumber: number
  spinnerX?: number
}

export interface KeyHandler {
  keys: string[]
  listener: (key: string) => void
}

export class FullscreenTerminalWriter extends Writer {
  type = "fullscreen"

  private spinners: { [key: string]: Function }
  private intervalID: NodeJS.Timer | null
  private initialized: boolean
  private errorMessages: string[]
  private scrolling: boolean
  private logger: Logger
  private terminalEntries: { [key: string]: TerminalEntry } = {}
  private spinningEntries: { [key: string]: TerminalEntry } = {}
  private contentHeight: number

  public screen: any
  public main: any
  public bottom: any
  public keyHandlers: KeyHandler[]

  constructor(level: LogLevel = LogLevel.info, private spinInterval = INTERVAL_MS) {
    super(level)
    this.intervalID = null
    this.spinners = {} // Each entry has it's own spinner
    this.initialized = false
    this.errorMessages = []
    this.scrolling = false
    this.keyHandlers = []
    this.terminalEntries = {}
    this.spinningEntries = {}
    this.contentHeight = 0
  }

  private init(logger: Logger) {
    this.logger = logger

    this.screen = this.createScreen()

    this.main = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: "100%",
      height: "100%-2",
      content: "",
      scrollable: true,
      alwaysScroll: true,
      border: false,
      padding: {
        left: 1,
        top: 1,
        bottom: 1,
        right: 1,
      },
      style: {
        fg: "white",
      },
      scrollbar: {
        bg: "white",
      },
    })

    this.bottom = blessed.box({
      parent: this.screen,
      top: "100%-2",
      left: 0,
      content: this.renderCommandLine(),
      scrollable: false,
      border: false,
      padding: {
        left: 1,
        right: 1,
        bottom: 1,
        top: 0,
      },
      style: {
        fg: "white",
        border: {},
      },
    })

    // TODO: may need to revisit how we terminate
    this.addKeyHandler({
      keys: ["C-c"],
      listener: () => {
        this.cleanup()
        shutdown(0)
      },
    })

    this.addKeyHandler({
      keys: ["0", "1", "2", "3", "4"],
      listener: (key) => {
        this.changeLevel(parseInt(key, 10))
        this.bottom.setContent(this.renderCommandLine())
        this.flashMessage(`Set log level to ${chalk.white.bold(LogLevel[this.level])} [${this.level}]`)
        this.screen.render()
      },
    })

    // Debug helper
    this.addKeyHandler({
      keys: ["C-d"],
      listener: () => {
        this.flashMessage(dedent`
          Scroll: ${this.main.getScroll()} / ${this.main.getScrollPerc()}%
          Height: ${this.main.height}
          Total entries: ${sum(Object.values(this.terminalEntries).map((e) => e.lines.length))}
          Total lines: ${this.contentHeight}
        `)
        this.screen.render()
      },
    })

    // Add scroll handlers
    this.addKeyHandler({
      keys: ["pageup"],
      listener: () => {
        this.scrolling = true
        this.main.scrollTo(this.main.getScroll() - this.main.height - 2)
        this.screen.render()
      },
    })

    this.addKeyHandler({
      keys: ["pagedown"],
      listener: () => {
        this.main.scrollTo(this.main.getScroll() + this.main.height - 2)
        if (this.main.getScrollPerc() === 100) {
          this.scrolling = false
        }
        this.screen.render()
      },
    })

    this.screen.append(this.main)
    this.screen.append(this.bottom)
    this.main.focus()
    this.screen.render()

    // TODO: do full re-render on resize to fix line wraps

    this.initialized = true
  }

  protected createScreen() {
    return blessed.screen({
      title: "garden",
      smartCSR: true,
      autoPadding: false,
      warnings: true,
      fullUnicode: true,
      ignoreLocked: ["C-c", "C-z"],
    })
  }

  protected getWidth() {
    return this.main.width
  }

  getContent() {
    return this.main?.getContent() || ""
  }

  /**
   * Flash a log message in a box
   */
  flashMessage(message: string, duration = 2000) {
    if (!this.initialized) {
      return
    }

    const box = blessed.box({
      parent: this.screen,
      top: "center",
      left: "center",
      align: "center",
      shrink: true,
      content: message,
      scrollable: false,
      border: {
        type: "line",
      },
      style: {
        fg: "white",
      },
      shadow: true,
      padding: {
        left: 1,
        right: 1,
        bottom: 0,
        top: 0,
      },
    })
    this.screen.append(box)
    this.screen.render()

    setTimeout(() => {
      this.screen.remove(box)
      this.screen.render()
    }, duration)
  }

  /**
   * Return the currently visible range of lines (inclusive on both ends).
   */
  getVisibleRange() {
    const scrollOffset = this.main?.getScroll() || 0
    const top = max([scrollOffset - this.main?.height || 0, 0])
    const bottom = min([scrollOffset, this.contentHeight])
    return [top, bottom]
  }

  addKeyHandler(handler: KeyHandler) {
    this.keyHandlers.push(handler)
    this.screen.key(handler.keys, handler.listener)
  }

  removeKeyHandler(handler: KeyHandler) {
    this.screen.unkey(handler.keys, handler.listener)
  }

  changeLevel(level: LogLevel) {
    this.level = level

    // Do a full re-render (if anything has been rendered)
    if (this.logger && this.main) {
      this.reRender()
    }
  }

  cleanup() {
    this.screen.destroy()
    cliCursor.show(process.stdout)
    for (const line of this.errorMessages) {
      process.stdout.write(line)
    }
    this.errorMessages = []
  }

  private renderCommandLine() {
    const level = `${this.level}=${LogLevel[this.level]}`
    return chalk.gray(`[page-up/down]: scroll   [0-4]: set log level (${level})   [ctrl-c]: quit`)
  }

  private spin(): void {
    const [from, to] = this.getVisibleRange()

    for (const e of Object.values(this.spinningEntries)) {
      // This should always be set if the entry is in spinningEntries
      const x = e.spinnerX || 0

      // ignore spinners outside of visible range
      if (e.lineNumber < from || e.lineNumber > to) {
        continue
      }

      const line = this.main.getLine(e.lineNumber)
      this.main.setLine(
        e.lineNumber,
        line.substring(0, x) + spinnerStyle(this.tickSpinner(e.key)) + line.substring(x + spinnerBytes)
      )
    }

    this.screen.render()
  }

  private startLoop(): void {
    if (!this.intervalID) {
      this.intervalID = setInterval(() => this.spin(), this.spinInterval)
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

  public onGraphChange(entry: LogEntry, logger: Logger): void {
    if (entry.level === LogLevel.error) {
      this.errorMessages.push(formatForTerminal(entry, "basic"))
    }

    if (!this.initialized) {
      this.init(logger)
    }

    this.renderLogEntry(entry)
  }

  public stop(): void {
    this.stopLoop()
  }

  private reRender() {
    if (!this.initialized) {
      return
    }

    this.main.setContent("")
    this.contentHeight = 0
    this.terminalEntries = {}
    this.spinningEntries = {}

    for (const entry of getChildEntries(this.logger)) {
      this.renderLogEntry(entry)
    }
  }

  private renderLogEntry(logEntry: LogEntry) {
    if (logEntry.level > this.level) {
      return
    }

    const currentTerminalEntry = this.terminalEntries[logEntry.key]
    let newEntry: TerminalEntry

    if (currentTerminalEntry) {
      // If entry has already been rendered, update it directly, inserting/deleting lines if its height changed
      newEntry = this.toTerminalEntry(logEntry, currentTerminalEntry.lineNumber)

      const currentHeight = currentTerminalEntry.lines.length
      const newLines = newEntry.lines
      const newHeight = newLines.length
      const lineDiff = newHeight - currentHeight

      if (lineDiff === 0) {
        // Overwrite the lines
        for (let y = 0; y < newHeight; y++) {
          this.main.setLine(currentTerminalEntry.lineNumber + y, newLines[y])
        }
      } else if (lineDiff < 0) {
        // Overwrite the first current lines
        for (let y = 0; y < newHeight; y++) {
          this.main.setLine(currentTerminalEntry.lineNumber + y, newLines[y])
        }
        // Delete the remaining lines
        for (let y = 0; y < -lineDiff; y++) {
          this.main.deleteLine(currentTerminalEntry.lineNumber + newHeight + y)
        }
      } else if (lineDiff > 0) {
        // Overwrite the current lines
        for (let y = 0; y < currentHeight; y++) {
          this.main.setLine(currentTerminalEntry.lineNumber + y, newLines[y])
        }
        // Insert the remaining lines
        for (let y = 0; y < lineDiff; y++) {
          this.main.insertLine(currentTerminalEntry.lineNumber + currentHeight + y, newLines[currentHeight + y])
        }
      }

      this.contentHeight += lineDiff
      this.updateLineNumbers(currentTerminalEntry.lineNumber + currentHeight, lineDiff)
    } else {
      // If entry has not been previously rendered, figure out the preceding visible entries' position and insert below
      let precedingLogEntry = getPrecedingEntry(logEntry)

      while (precedingLogEntry && this.level < precedingLogEntry.level) {
        precedingLogEntry = getPrecedingEntry(precedingLogEntry)
      }

      if (precedingLogEntry) {
        // We insert the new entry below the preceding one
        const precedingTerminalEntry = this.terminalEntries[precedingLogEntry.key]
        const precedingEntryHeight = precedingTerminalEntry.lines.length
        newEntry = this.toTerminalEntry(logEntry, precedingTerminalEntry.lineNumber + precedingEntryHeight)

        for (let y = 0; y < newEntry.lines.length; y++) {
          this.main.insertLine(precedingTerminalEntry.lineNumber + precedingEntryHeight + y, newEntry.lines[y])
        }

        this.contentHeight += newEntry.lines.length
        this.updateLineNumbers(newEntry.lineNumber, newEntry.lines.length)
      } else {
        // No preceding entry, we insert at the bottom
        newEntry = this.toTerminalEntry(logEntry, this.contentHeight)
        for (const line of newEntry.lines) {
          this.main.pushLine(line)
        }
        this.contentHeight += newEntry.lines.length
      }
    }

    this.setTerminalEntry(newEntry)

    if (!this.scrolling) {
      this.main.scrollTo(this.contentHeight)
    }

    this.screen.render()
    this.startLoop()
  }

  private setTerminalEntry(entry: TerminalEntry) {
    this.terminalEntries[entry.key] = entry

    if (entry.spinnerX !== undefined) {
      this.spinningEntries[entry.key] = entry
    } else if (this.spinningEntries[entry.key]) {
      delete this.spinningEntries[entry.key]
    }
  }

  private updateLineNumbers(from: number, offset: number) {
    for (const e of Object.values(this.terminalEntries)) {
      if (e.lineNumber >= from) {
        e.lineNumber += offset
      }
    }
  }

  private toTerminalEntry(entry: LogEntry, lineNumber: number): TerminalEntry {
    let spinnerFrame = ""
    let spinnerX: number | undefined

    if (entry.getMessageState().status === "active") {
      spinnerX = leftPad(entry).length
      spinnerFrame = this.tickSpinner(entry.key)
    } else {
      delete this.spinners[entry.key]
    }

    const text = [entry]
      .map((e) => (e.fromStdStream ? renderMsg(e) : formatForTerminal(e, "fancy")))
      .map((str) =>
        spinnerFrame ? `${str.slice(0, spinnerX)}${spinnerStyle(spinnerFrame)} ${str.slice(spinnerX)}` : str
      )
      .map((str) => {
        const leadingSpace = str.match(/ */)![0]
        const wrapped = wrapAnsi(str, this.getWidth() - 4 - leadingSpace.length, {
          trim: true,
          hard: true,
        })
        return wrapped
          .split("\n")
          .map((l) => (leadingSpace + l).trimEnd())
          .join("\n")
      })
      .pop()!

    let lines: string[]

    if (entry.isPlaceholder) {
      lines = []
    } else if (text === "") {
      lines = [""]
    } else {
      lines = text.split("\n").slice(0, -1)
    }

    // Need to make blank lines a single space to work around a blessed bug
    lines = lines.map((l) => l || " ")

    return {
      key: entry.key,
      lineNumber,
      spinnerX,
      lines,
    }
  }
}
