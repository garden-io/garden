/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ChildProcess, exec } from "child_process"
import { LogEntry } from "../logger/log-entry"
import { sleepSync } from "./util"
import { GardenBaseError, RuntimeError } from "../exceptions"

export interface OsCommand {
  command: string
  args?: string[]
}

export interface IOStreamListener {
  /**
   * Some stderr events are not errors, those can be just warnings.
   * We want to have a way to recognize command specific warnings and do not interpret those as errors,
   * i.e. we want to avoid restarting the process for such kind of warning-events.
   * @param chunk the data chuck from the stderr stream
   */
  denyRestart?: (chunk: any) => boolean
  onData: (chunk: any) => void
}

export interface RetriableProcessConfig {
  osCommand: OsCommand
  maxRetries: number
  minTimeoutMs: number
  stderrListener?: IOStreamListener
  stdoutListener?: IOStreamListener
  log: LogEntry
}

export class RetriableProcess {
  public readonly command: string
  private proc?: ChildProcess

  private parent?: RetriableProcess
  private descendants: RetriableProcess[]

  private readonly maxRetries: number
  private readonly minTimeoutMs: number
  private retriesLeft: number

  private readonly stderrListener?: IOStreamListener
  private readonly stdoutListener?: IOStreamListener

  private readonly log: LogEntry

  constructor(config: RetriableProcessConfig) {
    this.command = !!config.osCommand.args
      ? `${config.osCommand.command} ${config.osCommand.args.join(" ")}`
      : config.osCommand.command
    this.proc = undefined
    this.parent = undefined
    this.descendants = []
    this.maxRetries = config.maxRetries
    this.minTimeoutMs = config.minTimeoutMs
    this.retriesLeft = config.maxRetries
    this.stderrListener = config.stderrListener
    this.stdoutListener = config.stdoutListener
    this.log = config.log

    // todo: state validation in methods
  }

  private kill(): void {
    const proc = this.proc
    if (!proc) {
      return
    }

    !proc.killed && proc.kill()
    const parent = this.parent
    if (parent) {
      // delete killed process from parent's descendants
      parent.descendants.splice(
        parent.descendants.findIndex((p) => p.proc!.pid === proc.pid),
        1
      )
    }
    // remove reference to parent from a dead child
    this.parent = undefined

    this.proc = undefined
  }

  private killRecursively(): void {
    this.kill()
    this.descendants.forEach((descendant) => descendant.killRecursively())
  }

  private registerListeners(proc: ChildProcess): void {
    // todo: check if we need this?
    // proc.on("exit", (code) => {
    //   // no op
    // })

    const renderAttemptsMessage: () => string = () => {
      return !!this.retriesLeft
        ? `${this.retriesLeft} attempts left, next in ${this.minTimeoutMs}ms`
        : "no attempts left"
    }

    proc.on("error", async (error) => {
      this.log.error(
        `Error starting process '${this.command}' with PID ${this.getPid()}: ${JSON.stringify(
          error
        )}. ${renderAttemptsMessage()}`
      )

      await this.tryRestart(error)
    })

    proc.on("close", async (code: number, signal: NodeJS.Signals) => {
      const command = this.command
      const errorMsg = `Process '${command}' with PID ${this.getPid()} exited with code ${code} and signal ${signal}.`
      this.log.error(`${errorMsg}. ${renderAttemptsMessage()}`)

      await this.tryRestart(new RuntimeError(errorMsg, { command, code }))
    })

    proc.stderr!.on("data", async (line) => {
      const denyRestartFn = this.stderrListener?.denyRestart
      if (!!denyRestartFn && denyRestartFn(line)) {
        this.log.warn(`[Process PID=${this.getPid()}] >> '${line}'`)
        this.stderrListener?.onData(line)
      } else {
        const command = this.command
        const errorMsg = `Failed to start process '${command}' with PID ${this.getPid()}: ${line}.`
        this.log.error(`${errorMsg}. ${renderAttemptsMessage()}`)
        this.stderrListener?.onData(line)
        await this.tryRestart(new RuntimeError(errorMsg, { command, line }))
      }
    })

    proc.stdout!.on("data", (line) => {
      this.log.info(`[Process PID=${this.getPid()}] >> '${line}'`)
      this.stdoutListener?.onData(line)
      this.resetRetriesLeftRecursively()
    })
  }

  private unregisterListeners(): void {
    const proc = this.proc!
    proc.removeAllListeners("error")
    proc.removeAllListeners("close")

    proc.stdout!.removeAllListeners("data")
    proc.stderr!.removeAllListeners("data")
  }

  private unregisterListenersRecursively(): void {
    this.unregisterListeners()
    this.descendants.forEach((descendant) => descendant.unregisterListenersRecursively())
  }

  private resetRetriesLeft(): void {
    this.retriesLeft = this.maxRetries
  }

  private resetRetriesLeftRecursively(): void {
    this.resetRetriesLeft()
    this.descendants.forEach((descendant) => descendant.resetRetriesLeftRecursively())
  }

  private async tryRestart(error: Error | ErrorEvent | GardenBaseError | string): Promise<void> {
    if (this.retriesLeft > 0) {
      this.retriesLeft--
      // sleep synchronously to avoid pre-mature ssh connection attempts
      sleepSync(this.minTimeoutMs)
      // todo: lookup to parent to check if it's restarting
      this.unregisterListenersRecursively()
      this.killRecursively()
      this.start()
    } else {
      throw error
    }
  }

  public addDescendantProcess(descendant: RetriableProcess): RetriableProcess {
    descendant.parent = this
    this.descendants.push(descendant)
    return descendant
  }

  public getPid(): number | undefined {
    return this.proc?.pid
  }

  public start(): RetriableProcess {
    const proc = exec(this.command) // todo: add retry here?
    this.registerListeners(proc)
    for (const descendant of this.descendants) {
      descendant.start()
    }
    this.proc = proc
    return this
  }
}
