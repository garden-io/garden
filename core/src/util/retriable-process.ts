/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ChildProcess, exec, spawn } from "child_process"
import { LogEntry } from "../logger/log-entry"
import { sleepSync } from "./util"
import { RuntimeError } from "../exceptions"

export interface OsCommand {
  command: string
  args?: string[]
}

export interface ProcessMessage {
  pid: number
  message: string
}

export interface ProcessErrorMessage extends ProcessMessage {
  maxRetries: number
  minTimeoutMs: number
  retriesLeft: number
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
   * @param msg the details of the error output from the stdio stream
   */
  onError: (msg: ProcessErrorMessage) => void

  /**
   * Allows to define some process specific normal output handling.
   * This function will be called if {@link #hasErrors} returned {@code false}.
   *
   * @param msg the details of the normal output from the stdio stream
   */
  onMessage: (msg: ProcessMessage) => void
}

export type CommandExecutor = (command: string) => ChildProcess

export namespace CommandExecutors {
  export const spawnExecutor: CommandExecutor = (command: string) => spawn(command, { shell: true })
  export const execExecutor: CommandExecutor = (command: string) => exec(command)
  // no fork executor support yet
}

export type FailureHandler = () => Promise<void>

export interface RetriableProcessConfig {
  osCommand: OsCommand
  executor?: CommandExecutor
  maxRetries: number
  minTimeoutMs: number
  failureHandler?: FailureHandler
  stderrListener?: IOStreamListener
  stdoutListener?: IOStreamListener
  log: LogEntry
}

export type InitialProcessState = "runnable"
export type ActiveProcessState = "running" | "retrying"
/**
 * Process in the state "stopped" can be retried.
 * If all retry attempts have failed, then the process reaches the "failed" state which is a final one.
 */
export type InactiveProcessState = "stopped" | "failed"
export type RetriableProcessState = InitialProcessState | ActiveProcessState | InactiveProcessState

export class RetriableProcess {
  public readonly command: string
  private readonly executor: CommandExecutor
  private proc?: ChildProcess
  private state: RetriableProcessState

  private parent?: RetriableProcess
  private descendants: RetriableProcess[]

  private readonly maxRetries: number
  private readonly minTimeoutMs: number
  private retriesLeft: number
  private failureHandler: FailureHandler

  private readonly stderrListener?: IOStreamListener
  private readonly stdoutListener?: IOStreamListener

  private readonly log: LogEntry

  constructor(config: RetriableProcessConfig) {
    this.command = !!config.osCommand.args
      ? `${config.osCommand.command} ${config.osCommand.args.join(" ")}`
      : config.osCommand.command
    this.executor = config.executor || CommandExecutors.spawnExecutor
    this.proc = undefined
    this.parent = undefined
    this.descendants = []
    this.maxRetries = config.maxRetries
    this.minTimeoutMs = config.minTimeoutMs
    this.retriesLeft = config.maxRetries
    this.failureHandler = config.failureHandler || (async () => {})
    this.stderrListener = config.stderrListener
    this.stdoutListener = config.stdoutListener
    this.log = config.log
    this.state = "runnable"
  }

  private getCurrentPid(): number | undefined {
    return this.proc?.pid
  }

  public getCurrentState(): RetriableProcessState {
    return this.state
  }

  private static recursiveAction(node: RetriableProcess, action: (node: RetriableProcess) => void): void {
    action(node)
    node.descendants.forEach((descendant) => RetriableProcess.recursiveAction(descendant, action))
  }

  private stopNode(): void {
    const proc = this.proc
    if (!proc) {
      return
    }

    !proc.killed && proc.kill()
    this.proc = undefined
    this.state = "stopped"
  }

  private stopSubTree(): void {
    RetriableProcess.recursiveAction(this, (node) => node.stopNode())
  }

  private registerNodeListeners(proc: ChildProcess): void {
    const processSays = (chunk: any) => `[Process PID=${this.getCurrentPid()}] says "${chunk.toString()}"`

    const attemptsLeft = () =>
      !!this.retriesLeft ? `${this.retriesLeft} attempts left, next in ${this.minTimeoutMs}ms` : "no attempts left"

    const logDebugInfo = (chunk: any) => this.log.debug(processSays(chunk))
    const logDebugError = (chunk: any) => this.log.debug(`${processSays(chunk)}. ${attemptsLeft()}`)

    const processMessage: (string) => ProcessMessage = (message: string) => {
      const pid = this.getCurrentPid()!
      return { pid, message }
    }

    const processErrorMessage: (string) => ProcessErrorMessage = (message: string) => {
      const pid = this.getCurrentPid()!
      const maxRetries = this.maxRetries
      const minTimeoutMs = this.minTimeoutMs
      const retriesLeft = this.retriesLeft
      return { pid, message, maxRetries, minTimeoutMs, retriesLeft }
    }

    proc.on("error", async (error) => {
      const message = `Command '${this.command}' failed with error: ${JSON.stringify(error)}`
      logDebugError(message)
      this.stderrListener?.onError(processErrorMessage(message))

      await this.tryRestartSubTree()
    })

    proc.on("close", async (code: number, signal: NodeJS.Signals) => {
      const message = `Command '${this.command}' exited with code ${code} and signal ${signal}.`
      logDebugError(message)
      this.stderrListener?.onError(processErrorMessage(message))

      await this.tryRestartSubTree()
    })

    proc.stderr!.on("data", async (chunk: any) => {
      const hasErrorsFn = this.stderrListener?.hasErrors
      if (!hasErrorsFn || hasErrorsFn(chunk)) {
        const message = `Command '${this.command}' terminated: ${chunk}.`
        logDebugError(message)
        this.stderrListener?.onError(processErrorMessage(message))

        await this.tryRestartSubTree()
      } else {
        const message = chunk.toString()
        logDebugInfo(message)
        this.stderrListener?.onMessage(processMessage(message))

        this.resetSubTreeRetriesLeft()
      }
    })

    proc.stdout!.on("data", async (chunk: any) => {
      const hasErrorsFn = this.stdoutListener?.hasErrors
      if (!hasErrorsFn || !hasErrorsFn(chunk)) {
        const message = chunk.toString()
        logDebugInfo(message)
        this.stdoutListener?.onMessage(processMessage(message))

        this.resetSubTreeRetriesLeft()
      } else {
        const message = `Command '${this.command}' terminated: ${chunk}. ${attemptsLeft()}`
        logDebugError(message)
        this.stdoutListener?.onError(processErrorMessage(message))

        await this.tryRestartSubTree()
      }
    })
  }

  private unregisterNodeListeners(): void {
    const proc = this.proc!
    proc.removeAllListeners("error")
    proc.removeAllListeners("close")

    proc.stdout!.removeAllListeners("data")
    proc.stderr!.removeAllListeners("data")
  }

  private unregisterSubTreeListeners(): void {
    RetriableProcess.recursiveAction(this, (node) => node.unregisterNodeListeners())
  }

  private resetNodeRetriesLeft(): void {
    this.retriesLeft = this.maxRetries
  }

  private resetSubTreeRetriesLeft(): void {
    RetriableProcess.recursiveAction(this, (node) => node.resetNodeRetriesLeft())
  }

  private async tryRestartSubTree(): Promise<void> {
    // todo: should we lookup to parent nodes to find the parent-most killed/restarting process?
    this.unregisterSubTreeListeners()
    this.stopSubTree()
    if (this.retriesLeft > 0) {
      // sleep synchronously to avoid pre-mature retry attempts
      sleepSync(this.minTimeoutMs)
      this.retriesLeft--
      this.state = "retrying"
      this.startSubTree()
    } else {
      this.state = "failed"
      this.log.error("Unable to start local mode, see the error details in the logs.")
      await this.failureHandler()
    }
  }

  public addDescendantProcess(descendant: RetriableProcess): RetriableProcess {
    if (this.state === "running") {
      throw new RuntimeError("Cannot attach a descendant to already running process", this)
    }

    descendant.parent = this
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

  private findParentMostProcess() {
    let cur: RetriableProcess = this
    while (!!cur.parent) {
      cur = cur.parent
    }
    return cur
  }

  private startNode(): RetriableProcess {
    if (this.state === "running") {
      throw new RuntimeError("Process is already running", this)
    }
    // no need to use pRetry here, the failures will be handled by event the process listeners
    const proc = this.executor(this.command)
    this.proc = proc
    this.state = "running"
    this.registerNodeListeners(proc)
    return this
  }

  private static startFromNode(startNode: RetriableProcess): RetriableProcess {
    RetriableProcess.recursiveAction(startNode, (node) => node.startNode())
    return startNode
  }

  private startSubTree(): RetriableProcess {
    RetriableProcess.startFromNode(this)
    return this
  }

  /**
   * Starts all processes in the tree starting from the parent-most one.
   *
   * @return the reference to the tree root, i.e. to the parent-most retriable process
   */
  public startAll(): RetriableProcess {
    const root = this.findParentMostProcess()
    RetriableProcess.startFromNode(root)
    return root
  }

  /**
   * Stops all processes in the tree starting from the parent-most one.
   *
   * @return the reference to the tree root, i.e. to the parent-most retriable process
   */
  public stopAll(): RetriableProcess {
    const root = this.findParentMostProcess()
    root.unregisterSubTreeListeners()
    root.stopSubTree()
    return root
  }

  private setFailureHandler(failureHandler: FailureHandler): void {
    this.failureHandler = failureHandler
  }

  public setFailureHandlerForAll(failureHandler: FailureHandler): void {
    const root = this.findParentMostProcess()
    RetriableProcess.recursiveAction(root, (node) => node.setFailureHandler(failureHandler))
  }
}
