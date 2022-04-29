/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ChildProcess, exec, spawn } from "child_process"
import { LogEntry } from "../logger/log-entry"
import { shutdown, sleepSync } from "./util"
import { RuntimeError } from "../exceptions"

export interface OsCommand {
  command: string
  args?: string[]
}

export interface IOStreamListener {
  /**
   * Some stderr output may not contain any actual errors, it can have just warnings or some debug output.
   * We want to have a way to recognize command specific warnings and do not interpret those as errors,
   * i.e. we want to avoid restarting the process.
   *
   * Alternatively, stdout may contain some info which can be interpreted as an error.
   * Thus, there is also a way to recognize some errors coming from stdout
   * (if there are any utilities which print errors to stdout?) and to trigger the process restart.
   *
   * @param chunk the data chuck from the stderr stream
   * @return {@code true} if the stderr data has any actual errors or {@code false} otherwise
   */
  hasErrors: (chunk: any) => boolean

  /**
   * Allows to define some process specific error handling.
   * This function will be called if {@link #hasErrors} returned {@code true}.
   *
   * @param chunk the data chuck from the stderr stream
   */
  onError: (chunk: any) => void
}

export type CommandExecutor = (command: string) => ChildProcess

export namespace CommandExecutors {
  export const spawnExecutor: CommandExecutor = (command: string) => spawn(command, { shell: true })
  export const execExecutor: CommandExecutor = (command: string) => exec(command)
  // no fork executor support yet
}

export interface RetriableProcessConfig {
  osCommand: OsCommand
  executor?: CommandExecutor
  maxRetries: number
  minTimeoutMs: number
  stderrListener?: IOStreamListener
  stdoutListener?: IOStreamListener
  log: LogEntry
}

type RetriableProcessState = "runnable" | "running" | "killed" | "retrying"

export class RetriableProcess {
  public readonly command: string
  private readonly executor: CommandExecutor
  private proc?: ChildProcess
  private state: RetriableProcessState

  //private parent?: RetriableProcess
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
    this.executor = config.executor || CommandExecutors.spawnExecutor
    this.proc = undefined
    //this.parent = undefined
    this.descendants = []
    this.maxRetries = config.maxRetries
    this.minTimeoutMs = config.minTimeoutMs
    this.retriesLeft = config.maxRetries
    this.stderrListener = config.stderrListener
    this.stdoutListener = config.stdoutListener
    this.log = config.log
    this.state = "runnable"
  }

  private getCurrentPid(): number | undefined {
    return this.proc?.pid
  }

  private static recursiveAction(node: RetriableProcess, action: (node: RetriableProcess) => void): void {
    action(node)
    node.descendants.forEach((descendant) => RetriableProcess.recursiveAction(descendant, action))
  }

  private kill(): void {
    const proc = this.proc
    if (!proc) {
      return
    }

    !proc.killed && proc.kill()
    this.proc = undefined
    this.state = "killed"
  }

  private killRecursively(): void {
    RetriableProcess.recursiveAction(this, (node) => node.kill())
  }

  private registerListeners(proc: ChildProcess): void {
    const processSays = (chunk: any) => `[Process PID=${this.getCurrentPid()}] says "${chunk.toString()}"`

    const attemptsLeft = () =>
      !!this.retriesLeft ? `${this.retriesLeft} attempts left, next in ${this.minTimeoutMs}ms` : "no attempts left"

    const logInfo = (chunk: any) => this.log.info(processSays(chunk))

    const logError = (chunk: any) => this.log.error(`${processSays(chunk)}. ${attemptsLeft()}`)

    proc.on("error", async (error) => {
      logError(`Command '${this.command}' failed with error: ${JSON.stringify(error)}`)

      await this.tryRestart()
    })

    proc.on("close", async (code: number, signal: NodeJS.Signals) => {
      const command = this.command
      logError(`Command '${command}' exited with code ${code} and signal ${signal}.`)

      await this.tryRestart()
    })

    proc.stderr!.on("data", async (chunk: any) => {
      const hasErrorsFn = this.stderrListener?.hasErrors
      if (!hasErrorsFn || hasErrorsFn(chunk)) {
        const command = this.command
        logError(`Command '${command}' terminated: ${chunk}.`)
        this.stderrListener?.onError(chunk)

        await this.tryRestart()
      } else {
        logInfo(processSays(chunk))
        this.resetRetriesLeftRecursively()
      }
    })

    proc.stdout!.on("data", async (chunk: any) => {
      const hasErrorsFn = this.stdoutListener?.hasErrors
      if (!hasErrorsFn || !hasErrorsFn(chunk)) {
        logInfo(processSays(chunk))
        this.resetRetriesLeftRecursively()
      } else {
        const command = this.command
        this.log.error(processSays(`Command '${command}' terminated: ${chunk}. ${attemptsLeft()}`))
        this.stdoutListener?.onError(chunk)

        await this.tryRestart()
      }
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
    RetriableProcess.recursiveAction(this, (node) => node.unregisterListeners())
  }

  private resetRetriesLeft(): void {
    this.retriesLeft = this.maxRetries
  }

  private resetRetriesLeftRecursively(): void {
    RetriableProcess.recursiveAction(this, (node) => node.resetRetriesLeft())
  }

  private async tryRestart(): Promise<void> {
    // todo: should we lookup to parent nodes to find the parent-most killed/restarting process?
    this.unregisterListenersRecursively()
    this.killRecursively()
    if (this.retriesLeft > 0) {
      // sleep synchronously to avoid pre-mature retry attempts
      sleepSync(this.minTimeoutMs)
      this.retriesLeft--
      this.state = "retrying"
      this.start()
    } else {
      this.state = "killed"
      this.log.error("Unable to start local mode, see the errors above. Shutting down...")
      await shutdown(1)
    }
  }

  public addDescendantProcess(descendant: RetriableProcess): RetriableProcess {
    if (this.state === "running") {
      throw new RuntimeError("Cannot attach a descendant to already running process", this)
    }

    //descendant.parent = this
    this.descendants.push(descendant)
    return descendant
  }

  private renderProcessTreeRecursively(indent: string, output: string): string {
    output += indent + `-> '${this.command}'\n`
    for (const descendant of this.descendants) {
      output = descendant.renderProcessTreeRecursively(indent + "..", output)
    }
    return output
  }

  public renderProcessTree(): string {
    const output = ""
    return this.renderProcessTreeRecursively("", output)
  }

  public start(): RetriableProcess {
    if (this.state === "running") {
      throw new RuntimeError("Process is already running", this)
    }
    // no need to use pRetry here, the failures will be handled by event the process listeners
    const proc = this.executor(this.command)
    this.proc = proc
    this.state = "running"
    this.registerListeners(proc)
    for (const descendant of this.descendants) {
      descendant.start()
    }
    return this
  }
}
