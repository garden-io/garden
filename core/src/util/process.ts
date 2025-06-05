/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ChildProcess } from "child_process"
import split2 from "split2"
import type { PluginContext } from "../plugin-context.js"
import type { StringLogLevel } from "../logger/logger.js"

export function streamLogs({
  proc,
  name,
  ctx,
  level,
}: {
  proc: ChildProcess
  name: string
  ctx: PluginContext
  level?: StringLogLevel
}): void {
  const logStream = split2()

  if (proc.stderr) {
    proc.stderr.pipe(logStream)
  }

  if (proc.stdout) {
    proc.stdout.pipe(logStream)
  }

  const logEventContext = {
    origin: name,
    level: level ?? ("verbose" as const),
  }

  logStream.on("data", (line: Buffer) => {
    const logLine = line.toString()
    ctx.events.emit("log", { timestamp: new Date().toISOString(), msg: logLine, ...logEventContext })
  })
}

export function waitForProcessExit({ proc }: { proc: ChildProcess }): Promise<void> {
  // If the process already exited, resolve right away
  if (proc.exitCode !== null) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    proc.on("error", reject)
    proc.on("exit", () => {
      resolve()
    })
  })
}

export class LogLineTimeoutError extends Error {
  private stdout: string
  private stderr: string

  private successLog: string
  private errorLog?: string

  constructor({
    stdout,
    stderr,
    successLog,
    errorLog,
  }: {
    stdout: string
    stderr: string
    successLog: string
    errorLog?: string
  }) {
    super(`Timed out after waiting for success log line "${successLog}" or error log line "${errorLog}"`)
    this.stdout = stdout
    this.stderr = stderr
    this.successLog = successLog
    this.errorLog = errorLog
  }
}

export class ErrorLogLineSeenError extends Error {
  private stdout: string
  private stderr: string

  private successLog: string
  private errorLog: string

  constructor({
    stdout,
    stderr,
    successLog,
    errorLog,
  }: {
    stdout: string
    stderr: string
    successLog: string
    errorLog: string
  }) {
    super(`Error log line "${errorLog}" detected in output`)
    this.stdout = stdout
    this.stderr = stderr
    this.successLog = successLog
    this.errorLog = errorLog
  }
}

export function waitForLogLine({
  successLog,
  errorLog,
  process,
  timeout,
}: {
  successLog: string
  errorLog?: string
  process: ChildProcess
  timeout?: number
}): Promise<void> {
  let stdOutString = ""
  let stdErrString = ""

  const stringWasSeen = new Promise<void>((resolve, reject) => {
    function hasError(): boolean {
      return errorLog !== undefined && (stdOutString.includes(errorLog) || stdErrString.includes(errorLog))
    }

    function hasSuccess(): boolean {
      return stdOutString.includes(successLog) || stdErrString.includes(successLog)
    }

    process.stdout?.on("data", (chunk) => {
      stdOutString = stdOutString + chunk
      if (hasSuccess()) {
        resolve()
      } else if (hasError()) {
        reject(
          new ErrorLogLineSeenError({
            stdout: stdOutString,
            stderr: stdErrString,
            successLog,
            errorLog: errorLog!,
          })
        )
      }
    })

    process.stderr?.on("data", (chunk) => {
      stdErrString = stdErrString + chunk
      if (hasSuccess()) {
        resolve()
      } else if (hasError()) {
        reject(
          new ErrorLogLineSeenError({
            stdout: stdOutString,
            stderr: stdErrString,
            successLog,
            errorLog: errorLog!,
          })
        )
      }
    })
  })

  if (timeout !== undefined) {
    const rejectWhenTimedOut = new Promise<void>((_resolve, reject) => {
      const error = new LogLineTimeoutError({
        stdout: stdOutString,
        stderr: stdErrString,
        successLog,
        errorLog,
      })

      setTimeout(() => {
        reject(error)
      }, timeout)
    })

    return Promise.race([stringWasSeen, rejectWhenTimedOut])
  }

  return stringWasSeen
}
