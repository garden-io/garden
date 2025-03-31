/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { ChildProcess } from "child_process"
import { spawn } from "child_process"
import { execa } from "execa"
import { resolve } from "path"
import { sleep } from "@garden-io/core/build/src/util/util.js"
import { searchLog, findTasks, touchFile, parsedArgs, parseLogEntry, stringifyJsonLog } from "./helpers.js"
import type { JsonLogEntry } from "@garden-io/core/build/src/logger/writers/json-terminal-writer.js"
import { ParameterError, TimeoutError } from "@garden-io/core/build/src/exceptions.js"
import { dedent, deline } from "@garden-io/core/build/src/util/string.js"
import { GARDEN_CLI_ROOT } from "@garden-io/core/build/src/constants.js"
import chalk from "chalk"
import split2 from "split2"

export const DEFAULT_CHECK_INTERVAL_MS = 500
export const DEFAULT_RUN_TIMEOUT_SECS = 360

export const gardenBinPath = parsedArgs.binPath || resolve(GARDEN_CLI_ROOT, "bin", "garden.js")
export const showLog = !!parsedArgs.showlog

const DEFAULT_ARGS = ["--logger-type", "json", "--log-level", "silly"]
const logActivityIntervalMsec = 60 * 1000 // How frequently to log a message while waiting for proc to finish

/* eslint-disable no-console */

export function waitingForChangesStep(): WatchTestStep {
  return {
    description: "tasks completed, waiting for code changes",
    condition: async (logEntries: JsonLogEntry[]) => searchLog(logEntries, /Waiting for code changes/),
  }
}

export function taskCompletedStep(key: string, completedCount: number, description?: string): WatchTestStep {
  return {
    description: description || key,
    condition: async (logEntries: JsonLogEntry[]) => {
      const tasks = findTasks(logEntries, key)

      if (tasks.filter((t) => t.completedIndex).length >= completedCount) {
        return "passed"
      }
      if (tasks.filter((t) => t.errorIndex).length > 0) {
        return "failed"
      }
      return "waiting"
    },
  }
}

/**
 * Appends a newline to the file. Useful for triggering watch changes with a dirty timestamp.
 */
export function changeFileStep(path: string, description: string): WatchTestStep {
  return {
    description, // Mandatory, because we don't want to print the absolute path
    action: async () => {
      await execa(`echo "\n" >> ${path}`, { shell: true })
    },
  }
}

export function sleepStep(msec: number): WatchTestStep {
  return {
    description: `Wait for ${msec}ms`,
    action: async () => {
      await sleep(msec)
    },
  }
}

export function touchFileStep(path: string, description: string): WatchTestStep {
  return {
    description, // Mandatory, because we don't want to print the absolute path
    action: async () => {
      await touchFile(path)
    },
  }
}

export function commandReloadedStep(): WatchTestStep {
  return {
    description: "command reloaded",
    condition: async (logEntries: JsonLogEntry[]) => searchLog(logEntries, /Configuration changed, reloading/),
  }
}

/**
 * This helper is for testing a non-watch-mode commands. It returns a parsed representation of its log output,
 * which can then e.g. be queried for matching log entries.
 *
 * The GardenWatch class below, on the other hand, is for running/testing watch-mode commands.
 */
export async function runGarden(cwd: string, command: string[]): Promise<JsonLogEntry[]> {
  const parsedLog: JsonLogEntry[] = []

  try {
    const start = new Date().getTime()

    console.log(chalk.magentaBright(`Running 'garden ${command.join(" ")}' in ${cwd}`))
    const proc = execa(gardenBinPath, [...command, ...DEFAULT_ARGS], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, GARDEN_LOGGER_TYPE: "" },
    })

    const stdoutStream = split2()
    let lastLog = new Date().getTime()

    stdoutStream.on("data", (line) => {
      const now = new Date().getTime()
      const parsed = parseLogEntry(line)
      parsedLog.push(parsed)
      if (showLog) {
        console.log(stringifyJsonLog(parsed))
      } else if (now - lastLog > logActivityIntervalMsec) {
        // Make sure something is logged during execution to avoid CI timing out
        console.log(`Still running (${Math.round((now - start) / 1000)} msec)`)
      }
      lastLog = now
    })

    proc.stdout?.pipe(stdoutStream)

    if (showLog) {
      proc.stderr?.pipe(process.stderr)
    }

    await proc
    return parsedLog
  } catch (err) {
    let msg = String(err).split("\n")[0]
    if (parsedLog.length > 0) {
      msg += "\n" + parsedLog.map((l) => stringifyJsonLog(l, { error: true })).join("\n")
    }
    throw new Error(`Failed running command '${command.join(" ")}': ${msg}`)
  }
}

export interface RunGardenWatchOpts {
  testSteps: WatchTestStep[]
  checkIntervalMs?: number
  timeout?: number
}

export type WatchTestStep = {
  description: string
  condition?: WatchTestCondition
  action?: WatchTestAction
}

export const watchTestStepTypes = ["checkpoint", "action"]

export type WatchTestConditionState = "waiting" | "passed" | "failed"

/**
 * Return values:
 * - "waiting": the condition hasn't passed or failed yet
 * - "passed": condition has passed (proceed to next step)
 * - "failed": condition has failed (terminates the watch command)
 */
export type WatchTestCondition = (logEntries: JsonLogEntry[]) => Promise<WatchTestConditionState>

export type WatchTestAction = (logEntries: JsonLogEntry[]) => Promise<void>

/**
 * This class is intended for testing watch-mode commands.
 *
 * GardenWatch runs a watch-mode command (e.g. garden dev) as a child process, which it manages
 * internally.
 *
 * Each line of the child process' stdout is parsed into a JsonLogEntry as it arrives, and appended to the logEntries
 * array (which is provided to the functions in testSteps).
 *
 * The testSteps passed to the run method specify the conditions (roughly, waiting for things to appear in the log)
 * and actions (e.g. modifying files to trigger watch changes) that define the test case in question.
 *
 * This can be used to set up test cases like "run garden dev inside this project,
 * modify a file, then wait for a build task to appear for its module".
 *
 * GardenWatch starts with the first step in testSteps and proceeds through them one by one.
 *
 * Action steps are run only once, after which execution proceeds to the next step.
 *
 * A condition step is repeated until it returns "pass" or "error". A "pass" results in execution proceeding to the
 * next step. An "error" results in an exception being thrown, and the GardenWatch killing its child process and
 * returning control (and thus not going through any further test steps).
 *
 * If a condition step returns "waiting", the condition step is run again after this.checkIntervalMs have elapsed.
 *
 * The pre-relase tests contain some good examples to illustrate this flow.
 */
export class GardenWatch {
  public logEntries: JsonLogEntry[]
  public checkIntervalMs: number
  public currentTestStepIdx = 0
  public running = false
  public testSteps: WatchTestStep[] = []

  public proc?: ChildProcess

  constructor(
    public dir: string,
    public command: string[]
  ) {
    this.logEntries = []
    this.checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS
  }

  async run({ testSteps, checkIntervalMs = 2000, timeout = DEFAULT_RUN_TIMEOUT_SECS }: RunGardenWatchOpts) {
    this.validateSteps(testSteps)

    this.currentTestStepIdx = 0
    this.testSteps = testSteps

    const stream = split2()

    this.proc = spawn(gardenBinPath, this.command.concat(DEFAULT_ARGS), {
      cwd: this.dir,
      env: { ...process.env, GARDEN_LOGGER_TYPE: "" },
    })
    this.running = true

    stream.on("data", (line: Buffer) => {
      const parsed = parseLogEntry(line.toString())
      this.logEntries.push(parsed)
      if (showLog) {
        console.log(stringifyJsonLog(parsed))
      }
    })

    this.proc.stdout!.pipe(stream)
    this.proc.stderr!.pipe(stream)

    this.proc.on("error", (err) => {
      this.running = false
      error = err
    })

    const closeHandler = (code: number) => {
      if (this.running && code !== 0) {
        error = new Error(`Process exited with code ${code}`)
      } else if (showLog) {
        console.log(chalk.greenBright(`Process exited with code ${code}`))
      }
      this.running = false
    }

    this.proc.on("close", closeHandler)
    this.proc.on("exit", closeHandler)

    this.proc.on("disconnect", () => {
      error = new Error("Disconnected from process")
      this.running = false
    })

    this.checkIntervalMs = checkIntervalMs

    let error: unknown = undefined
    const startTime = new Date().getTime()

    while (this.running) {
      try {
        const step = this.testSteps[this.currentTestStepIdx]

        if (!!step.condition) {
          const done = await this.checkCondition()
          if (done) {
            break
          }
        } else {
          await this.performAction()
        }
      } catch (err) {
        error = err
        break
      }

      const now = new Date().getTime()
      if (now - startTime > timeout * 1000) {
        const log = this.renderLog()
        error = new TimeoutError({
          message: `Timed out waiting for test steps. Logs:\n${log}`,
        })
        break
      }

      await sleep(this.checkIntervalMs)
    }

    await this.stop()

    if (error) {
      throw error
    }
  }

  private renderLog() {
    return this.logEntries
      .filter((l) => l.timestamp) // Invalid lines don't have a timestamp
      .map((l) => stringifyJsonLog(l))
      .join("\n")
  }

  /**
   * Returns true if the final test step has passed, false otherwise.
   */
  private async checkCondition(): Promise<boolean> {
    const { condition, description } = this.testSteps[this.currentTestStepIdx]
    const conditionStatus = await condition!(this.logEntries)

    if (conditionStatus === "waiting") {
      console.log(chalk.yellow.bold(`Waiting for step: ${chalk.white.bold(description)}`))
      return false
    }

    if (conditionStatus === "passed") {
      this.currentTestStepIdx++
      console.log(chalk.green.bold(`Completed step: ${chalk.white.bold(description)}`))
      if (this.currentTestStepIdx === this.testSteps.length) {
        return true
      }
      return false
    }

    console.error(chalk.red.bold(description))

    console.error(dedent`
      Watch test failed. Here is the log for the command run:

      ${this.renderLog()}
      `)

    throw new Error(`Test step ${description} failed.`)
  }

  private async performAction() {
    const { action, description } = this.testSteps[this.currentTestStepIdx]
    await action!(this.logEntries)
    console.log(chalk.magenta.bold(`Performing action: ${chalk.white.bold(description)}`))
    this.currentTestStepIdx++
  }

  private async stop() {
    if (!this.running) {
      return
    }

    this.running = false
    this.proc!.kill()

    const startTime = new Date().getTime()
    while (true) {
      await sleep(DEFAULT_CHECK_INTERVAL_MS)
      if (this.proc!.killed) {
        break
      }
      const now = new Date().getTime()
      if (now - startTime > 10 * DEFAULT_CHECK_INTERVAL_MS) {
        const log = this.renderLog()
        throw new TimeoutError({
          message: `Timed out waiting for garden command to terminate. Log:\n${log}`,
        })
      }
    }
  }

  private validateSteps(testSteps: WatchTestStep[]) {
    for (const { condition, action, description } of testSteps) {
      const hasCondition = !!condition
      const hasAction = !!action
      if (!hasCondition && !hasAction) {
        throw new ParameterError({
          message: deline`
          GardenWatch: step ${description} in testSteps defines neither a condition nor an action.
          Steps must define either a condition or an action.`,
        })
      }
      if (hasCondition && hasAction) {
        throw new ParameterError({
          message: deline`
          GardenWatch: step ${description} in testSteps defines both a condition and an action.
          Steps must define either a condition or an action, but not both.`,
        })
      }
    }

    if (testSteps.length === 0) {
      throw new ParameterError({
        message: deline`
        GardenWatch: run method called with an empty testSteps array. At least one test step must be provided.`,
      })
    }

    if (!testSteps[testSteps.length - 1].condition) {
      throw new ParameterError({
        message: deline`
        GardenWatch: The last element of testSteps must be a condition, not an action.`,
      })
    }
  }
}
