/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import split2 from "split2"

import type { Log } from "../../logger/log-entry.js"
import type { DeployLogEntry } from "../../types/service.js"
import fsExtra from "fs-extra"
import parseDuration from "parse-duration"
import { validateSchema } from "../../config/validation.js"
import type { FSWatcher, ReadStream } from "fs"
import { createReadStream } from "fs"
import EventEmitter2 from "eventemitter2"
import { sleep } from "../../util/util.js"
import { dedent } from "../../util/string.js"
import type { LogLevel } from "../../logger/logger.js"
import { deployLogEntrySchema } from "../../types/service.js"
import { getGitHubIssueLink } from "../../exceptions.js"
import type { DeployLogEntryHandler } from "../../plugin/handlers/Deploy/get-logs.js"

const { pathExists, stat, watch } = fsExtra

const defaultRetryIntervalMs = 5000
const watcherShelfLifeSec = 15
// This is pretty arbitrary
const maxLinesToScan = 100000
const warnOnFileSize = 2 * 1024 * 1024 // 2mb

interface LogOpts {
  tail?: number
  since?: string
  follow: boolean
}

// We enforce timestamp and level on local service log entries.
export type LocalServiceLogEntry = DeployLogEntry & {
  timestamp: Date
  level: LogLevel
}

function isValidServiceLogEntry(entry: any): entry is LocalServiceLogEntry {
  if (!entry.timestamp || isNaN(entry.level)) {
    return false
  }

  try {
    validateSchema(entry, deployLogEntrySchema())
  } catch (_err) {
    return false
  }

  return entry
}

interface StreamEvents {
  fileEnd: {
    bytesRead: number
    lastStreamedEntry?: LocalServiceLogEntry
  }
  fileReadError: {
    message: string
    lastStreamedEntry?: LocalServiceLogEntry
    bytesRead: number
  }
  error: {
    message: string
  }
  change: {}
  rename: {}
}

type StreamEventName = keyof StreamEvents

class StreamEventBus extends EventEmitter2.EventEmitter2 {
  constructor() {
    super()
  }

  override emit<T extends StreamEventName>(name: T, payload: StreamEvents[T]) {
    return super.emit(name, payload)
  }

  override on<T extends StreamEventName>(name: T, listener: (payload: StreamEvents[T]) => void) {
    return super.on(name, listener)
  }
}

export class ExecLogsFollower {
  private deployName: string
  private onLogEntry: DeployLogEntryHandler
  private log: Log
  private intervalId: NodeJS.Timeout | null
  private resolve: ((val: unknown) => void) | null
  private retryIntervalMs: number
  private logFilePath: string
  private modified: boolean
  private isTailing: boolean
  private lastStreamedEntry: LocalServiceLogEntry | null
  private bytesRead: number
  private watcher: FSWatcher | null
  private events: StreamEventBus

  constructor({
    onLogEntry,
    deployName,
    log,
    logFilePath,
    retryIntervalMs,
  }: {
    onLogEntry: DeployLogEntryHandler
    deployName: string
    log: Log
    logFilePath: string
    retryIntervalMs?: number
  }) {
    this.onLogEntry = onLogEntry
    this.deployName = deployName
    this.log = log
    this.intervalId = null
    this.logFilePath = logFilePath
    this.resolve = null
    this.retryIntervalMs = retryIntervalMs || defaultRetryIntervalMs
    this.modified = false
    this.isTailing = false
    this.lastStreamedEntry = null
    this.bytesRead = 0
    this.watcher = null
    // TODO: Use a typed event bus
    this.events = new StreamEventBus()
  }

  /**
   * Tail the file with the given parameters. Optionally follow logs.
   */
  public async streamLogs(opts: LogOpts) {
    try {
      const fileSize = (await stat(this.logFilePath)).size
      if (fileSize > warnOnFileSize) {
        this.log.warn(dedent`
          Detected unusually large local log file for local service ${this.deployName} at path ${this.logFilePath}.
          Size is ${Math.floor(fileSize / (1024 * 1024))}MB. This can slow down local log streaming.

          We recommend clearing the file by either deleting it or restarting the Garden process that started the ${
            this.deployName
          } service.

          If you see this message frequently, please open a GitHub issue at: ${getGitHubIssueLink(
            "Local log file too large",
            "bug"
          )}.
        `)
      }
    } catch (_err) {} // No-op if file not found

    if (opts.follow) {
      await this.followLogs(opts)
    } else {
      await this.tailFile({ ...opts, cursorStartPos: 0 })
    }
  }

  public stop() {
    this.reset()

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    this.events.removeAllListeners()
    this.resolve && this.resolve({})
  }

  /**
   * Tail the file with the given parameters and then watch it for changes, streaming any new entries.
   *
   * High level flow:
   * 1. Start control loop.
   * 2. Start file watcher.
   * 3. Stream initial batch, counting the bytes as they are streamed.
   * 4. If file was modified while streaming, repeat steps 3 and 4, starting at the proper cursor
   * position (i.e. byte offset).
   * 5. Watch file and stream entries on changes from cursor position.
   * 6. On rename events (i.e. log file rotation) we reset and start from step 1.
   * 7. On errors we reset the watcher but otherwise continue the control loop.
   */
  private async followLogs(opts: LogOpts) {
    // Use an internal event bus to simplify control flow.
    this.events.on("fileEnd", async ({ bytesRead, lastStreamedEntry }) => {
      this.bytesRead = bytesRead
      this.lastStreamedEntry = lastStreamedEntry || this.lastStreamedEntry
      // Log file was modified between streaming starting and ending so we stream again from current cursor position.
      if (this.modified) {
        this.modified = false
        await this.tailFile({ cursorStartPos: this.bytesRead, follow: true })
      }
    })

    this.events.on("fileReadError", async ({ message, bytesRead, lastStreamedEntry }) => {
      this.bytesRead = bytesRead
      this.lastStreamedEntry = lastStreamedEntry || this.lastStreamedEntry
      this.unwatch()
      this.handleError(message)
    })

    this.events.on("change", async () => {
      // If tailing is progress we'll retry on the file end event.
      if (!this.isTailing) {
        await this.tailFile({ cursorStartPos: this.bytesRead, follow: true })
      }
    })

    // This suggests the log file was reset
    this.events.on("rename", async () => {
      this.reset()
      // Wait while file is being rotated
      await sleep(500)
      await this.startWatch(opts)
    })

    this.events.on("error", async ({ message }) => {
      this.handleError(message)
    })

    await this.startWatch(opts)

    this.intervalId = setInterval(async () => {
      const now = new Date()

      // Reset watcher for good measure if we don't see any logs for the given period.
      if (this.lastStreamedEntry) {
        const diffSec = (now.getTime() - this.lastStreamedEntry.timestamp.getTime()) / 1000
        if (diffSec > watcherShelfLifeSec) {
          this.unwatch()
        }
      }

      await this.startWatch(opts)
    }, this.retryIntervalMs)

    return new Promise((resolve, _reject) => {
      this.resolve = resolve
    })
  }

  private reset() {
    this.bytesRead = 0
    this.unwatch()
  }

  private unwatch() {
    this.watcher && this.watcher.close()
    this.watcher = null
  }

  private handleError(message: string) {
    this.log.debug(`<Streaming log from local process for service ${this.deployName} failed with error: ${message}>`)
    this.unwatch()
  }

  private async startWatch(opts: LogOpts) {
    // Nothing to do.
    if (!(await pathExists(this.logFilePath))) {
      this.unwatch()
      return
    }

    if (this.watcher) {
      return
    }

    try {
      this.watcher = watch(this.logFilePath, (event, _filename) => {
        if (event === "change") {
          this.modified = true
          this.events.emit("change", {})
        } else if (event === "rename") {
          this.events.emit("rename", {})
        }
      })
    } catch (err) {
      this.events.emit("error", { message: `Starting file watcher failed with error ${err}` })
      return
    }

    // Stream initial batch.
    await this.tailFile({ ...opts, cursorStartPos: this.bytesRead, follow: true })
  }

  private parseLine({ line }: { line: string }): LocalServiceLogEntry | null {
    let entry: any
    // TODO: Consider handling off by one cursor position errors by "fixing up" the line.
    // E.g. adding braces to form proper JSON.
    try {
      entry = JSON.parse(line)
    } catch (err) {
      this.log.debug(`Failed parsing entry as JSON: ${entry}`)
      return null
    }

    try {
      entry["timestamp"] = new Date(entry.timestamp)
    } catch (err) {
      // No-op, since we validate the shape below
    }

    if (!isValidServiceLogEntry(entry)) {
      return null
    }

    return entry
  }

  private async tailFile({
    since,
    tail,
    cursorStartPos,
    follow,
  }: LogOpts & { cursorStartPos: number; follow: boolean }) {
    if (!(await pathExists(this.logFilePath))) {
      this.unwatch()
      return
    }

    if (this.isTailing) {
      return
    }

    this.isTailing = true

    let startAtLine = 0
    if (tail && tail > 0) {
      const lineCount = await this.getLineCount()
      startAtLine = Math.max(lineCount - tail, 0)
      // Tail takes precedence over since. This is handled at the framework level, just adding suspenders.
      since = undefined
    }

    let readStream: ReadStream
    let bytesRead = cursorStartPos
    let lastStreamedEntry: LocalServiceLogEntry | undefined
    try {
      readStream = createReadStream(this.logFilePath, { start: cursorStartPos })
      const splitStream = split2()
      const sinceSeconds = (since && parseDuration(since, "s")) || undefined
      let currentLine = -1

      splitStream.on("data", (line: string) => {
        // TODO: Verify whether this works cross platform (and if not, handle different platforms).
        bytesRead += Buffer.byteLength(line + "\n")

        currentLine += 1
        if (currentLine < startAtLine) {
          return
        }

        const entry = this.parseLine({ line })

        if (!entry) {
          return
        }

        if (sinceSeconds) {
          const dateSince = new Date()
          dateSince.setSeconds(dateSince.getSeconds() - sinceSeconds)

          if (entry.timestamp < dateSince) {
            return
          }
        }

        lastStreamedEntry = entry
        this.onLogEntry(entry)
      })

      readStream.pipe(splitStream)

      return new Promise((res, rej) => {
        splitStream.on("end", () => {
          this.isTailing = false

          if (follow) {
            this.events.emit("fileEnd", { bytesRead, lastStreamedEntry })
          }
          res({})
        })
        splitStream.on("error", (err) => {
          this.events.emit("fileReadError", {
            bytesRead,
            lastStreamedEntry,
            message: `Reading stream failed with error: ${err.message}`,
          })
          rej({})
          return
        })
      })
    } catch (err) {
      this.events.emit("fileReadError", {
        bytesRead,
        lastStreamedEntry,
        message: `Tailing file failed with error: ${err} }`,
      })
      return
    }
  }

  /**
   * Get line count for entire file to determine where to start tailing when "tail" flag is set.
   * Has a low memory footprint but could be slow for large files. Shouldn't be a concern for this use case though.
   * TODO: Consider skipping for large files.
   */
  private async getLineCount(): Promise<number> {
    try {
      const readStream = createReadStream(this.logFilePath)
      const splitStream = split2()
      readStream.pipe(splitStream)

      let count = 0

      return new Promise((res, _rej) => {
        splitStream.on("data", (_line) => {
          if (count >= maxLinesToScan) {
            this.log.debug(`Log file is too large to properly tail. Tail may start at wrong position.`)
            res(count)
          }
          count++
        })
        splitStream.on("error", (err) => {
          this.events.emit("error", { message: `Streaming line count failed with error: ${err.message}` })
        })
        splitStream.on("end", () => res(count))
      })
    } catch (err) {
      this.events.emit("error", { message: `Counting lines failed with error: ${err}` })
      return 0
    }
  }
}
