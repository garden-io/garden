import { ChildProcess } from "child_process"
import * as execa from "execa"
import * as mlog from "mocha-logger"
import parseArgs = require("minimist")
import { resolve } from "path"
import { sleep } from "../src/util/util"
import { TimeoutError } from "bluebird"
import { parseLogEntries, searchLog, findTasks, touchFile } from "./integ-helpers"
import { JsonLogEntry } from "../src/logger/writers/json-terminal-writer"
import { ParameterError } from "../src/exceptions"
import { dedent, deline } from "../src/util/string"

const argv = parseArgs(process.argv.slice(2))

export const gardenBinPath = argv.binPath || resolve(__dirname, "..", "static", "bin", "garden")
export const showLog = !!argv.showLog

export function dashboardUpStep(): WatchTestStep {
  return {
    description: "dashboard up",
    condition: async (logEntries: JsonLogEntry[]) => {
      return searchLog(logEntries, /Garden dashboard and API server running/)
    },
  }
}

export function taskCompletedStep(key: string, completedCount: number, description?: string): WatchTestStep {
  return {
    description: description || key,
    condition: async (logEntries: JsonLogEntry[]) => {
      const tasks = findTasks(logEntries, key)
      if (tasks.filter(t => t.completedIndex).length === completedCount) {
        return "passed"
      }
      if (tasks.filter(t => t.errorIndex).length > 0) {
        return "failed"
      }
      return "waiting"
    },
  }
}

/**
 * Prepends a newline to the file. Useful for triggering watch changes with a dirty timestamp.
 */
export function changeFileStep(path: string, description: string): WatchTestStep {
  return {
    description, // Mandatory, because we don't want to print the absolute path
    action: async () => {
      await execa.shell(`echo "" >> ${path}`)
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
    condition: async (logEntries: JsonLogEntry[]) => {
      return searchLog(logEntries, /Module configuration changed, reloading/)
    },
  }
}

/**
 * This helper is for testing a non-watch-mode commands. It returns a parsed representation of its log output,
 * which can then e.g. be queried for matching log entries.
 *
 * The GardenWatch class below, on the other hand, is for running/testing watch-mode commands.
 */
export async function runGarden(dir: string, command: string[]): Promise<JsonLogEntry[]> {
  const out = (await execa(gardenBinPath, [...command, "--logger-type", "json", "-l", "4"], { cwd: dir })).stdout
  if (showLog) {
    console.log(out)
  }
  return parseLogEntries(out.split("\n").filter(Boolean))
}

export type RunGardenWatchOpts = {
  testSteps: WatchTestStep[],
  checkIntervalMs?: number,
}

export type WatchTestStep = {
  description: string,
  condition?: WatchTestCondition,
  action?: WatchTestAction,
}

export const watchTestStepTypes = ["checkpoint", "action"]

export type WatchTestConditionState = "waiting" | "passed" | "failed"

/**
 * Return values:
 *   "waiting": the condition hasn't passed or failed yet
 *   "passed": condition has passed (proceed to next step)
 *   "failed": condition has failed (terminates the watch command)
 */
export type WatchTestCondition = (logEntries: JsonLogEntry[]) => Promise<WatchTestConditionState>

export type WatchTestAction = (logEntries: JsonLogEntry[]) => Promise<void>

export const DEFAULT_CHECK_INTERVAL_MS = 500

/**
 * This class is intended for testing watch-mode commands.
 *
 * GardenWatch runs a watch-mode command (e.g. garden dev or garden deploy -w) as a child process, which it manages
 * internally.
 *
 * Each line of the child process' stdout is parsed into a JsonLogEntry as it arrives, and appended to the logEntries
 * array (which is provided to the functions in testSteps).
 *
 * The testSteps passed to the run method specify the conditions (roughly, waiting for things to appear in the log)
 * and actions (e.g. modifying files to trigger watch changes) that define the test case in question.
 *
 * This can be used to set up test cases like "run garden dev inside this project, wait for the dashboard to come up,
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
 * If a contdition step returns "waiting", the condition step is run again after this.checkIntervalMs have elapsed.
 *
 * The pre-relase tests contain some good examples to illustrate this flow.
 */
export class GardenWatch {

  public proc: ChildProcess
  public logEntries: JsonLogEntry[]
  public checkIntervalMs: number
  public testSteps: WatchTestStep[]
  public currentTestStepIdx: number

  constructor(public dir: string, public command: string[]) {
    this.logEntries = []
    this.checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS
  }

  async run({ testSteps, checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS }: RunGardenWatchOpts) {

    this.validateSteps(testSteps)

    this.currentTestStepIdx = 0
    this.testSteps = testSteps

    this.proc = execa(gardenBinPath, [...this.command, "--logger-type", "json", "-l", "4"], { cwd: this.dir })
    this.proc.stdout.on("data", (rawLine) => {
      const lines = rawLine.toString().trim().split("\n")
      if (showLog) {
        console.log(lines)
      }
      this.logEntries.push(...lines.map((l: string) => JSON.parse(l)))
    })

    this.checkIntervalMs = checkIntervalMs || DEFAULT_CHECK_INTERVAL_MS

    let error = undefined

    while (true) {
      try {
        if (!!this.testSteps[this.currentTestStepIdx].condition) {
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
      await (sleep(this.checkIntervalMs))
    }

    await this.stop()

    if (error) {
      throw error
    }

    return true

  }

  /**
   * Returns true if the final test step has passed, false otherwise.
   */
  private async checkCondition(): Promise<boolean> {
    const { condition, description } = this.testSteps[this.currentTestStepIdx]
    const conditionStatus = await condition!(this.logEntries)

    if (conditionStatus === "waiting") {
      return false
    }

    if (conditionStatus === "passed") {
      this.currentTestStepIdx++
      mlog.success(`${description}`)
      if (this.currentTestStepIdx === this.testSteps.length) {
        return true
      }
      return false
    }

    mlog.error(`${description}`)
    console.error(dedent`
      Watch test failed. Here is the log for the command run:

      ${this.logEntries.map(e => JSON.stringify(e)).join("\n")}`)

    throw new Error(`Test step ${description} failed.`)

  }

  private async performAction() {
    const { action, description } = this.testSteps[this.currentTestStepIdx]
    await action!(this.logEntries)
    mlog.log(`${description}`)
    this.currentTestStepIdx++
  }

  private async stop() {

    this.proc.kill()

    const startTime = new Date().getTime()
    while (true) {
      await sleep(DEFAULT_CHECK_INTERVAL_MS)
      if (this.proc.killed) {
        break
      }
      const now = new Date().getTime()
      if (now - startTime > 10 * DEFAULT_CHECK_INTERVAL_MS) {
        throw new TimeoutError(`Timed out waiting for garden command to terminate.`)
      }
    }
  }

  private validateSteps(testSteps: WatchTestStep[]) {

    for (const { condition, action, description } of testSteps) {
      const hasCondition = !!condition
      const hasAction = !!action
      if (!hasCondition && !hasAction) {
        throw new ParameterError(deline`
          GardenWatch: step ${description} in testSteps defines neither a condition nor an action.
          Steps must define either a condition or an action.`,
          { testSteps })
      }
      if (hasCondition && hasAction) {
        throw new ParameterError(deline`
          GardenWatch: step ${description} in testSteps defines both a condition and an action.
          Steps must define either a condition or an action, but not both.`,
          { testSteps })
      }
    }

    if (testSteps.length === 0) {
      throw new ParameterError(deline`
        GardenWatch: run method called with an empty testSteps array. At least one test step must be provided.`,
        {})
    }

    if (!testSteps[testSteps.length - 1].condition) {
      throw new ParameterError(deline`
        GardenWatch: The last element of testSteps must be a condition, not an action.`,
        { testSteps })
    }

  }

}
