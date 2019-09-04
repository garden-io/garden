import { ChildProcess, spawn } from "child_process"
import execa from "execa"
import mlog from "mocha-logger"
import { resolve } from "path"
import { sleep } from "../src/util/util"
import { parseLogEntries, searchLog, findTasks, touchFile, parsedArgs, stringifyLogEntries } from "./e2e-helpers"
import { JsonLogEntry } from "../src/logger/writers/json-terminal-writer"
import { ParameterError, TimeoutError } from "../src/exceptions"
import { dedent, deline } from "../src/util/string"
import { GARDEN_SERVICE_ROOT } from "../src/constants"
import { UpdateLogEntryParams } from "../src/logger/log-entry"
import chalk from "chalk"
import split2 = require("split2")

export const DEFAULT_CHECK_INTERVAL_MS = 500
export const DEFAULT_RUN_TIMEOUT_SECS = 240

export const gardenBinPath = parsedArgs.binPath || resolve(GARDEN_SERVICE_ROOT, "bin", "garden")
export const showLog = !!parsedArgs.showlog

const DEFAULT_ARGS = ["--logger-type", "json", "--log-level", "debug"]

function execGarden(command: string[], cwd: string, opts: execa.Options = {}) {
  showLog && console.log(`Running 'garden ${command.join(" ")}' in ${cwd}`)
  return execa(gardenBinPath, [...command, ...DEFAULT_ARGS], { cwd, ...opts })
}

export function dashboardUpStep(): WatchTestStep {
  return {
    description: "dashboard up",
    condition: async (logEntries: JsonLogEntry[]) => {
      return searchLog(logEntries, /Garden dashboard and API server running/)
    },
  }
}

export function waitingForChangesStep(): WatchTestStep {
  return {
    description: "tasks completed, waiting for code changes",
    condition: async (logEntries: JsonLogEntry[]) => {
      return searchLog(logEntries, /Waiting for code changes/)
    },
  }
}

export function taskCompletedStep(key: string, completedCount: number, description?: string): WatchTestStep {
  return {
    description: description || key,
    condition: async (logEntries: JsonLogEntry[]) => {
      const tasks = findTasks(logEntries, key)

      if (tasks.filter((t) => t.completedIndex).length === completedCount) {
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
 * Prepends a newline to the file. Useful for triggering watch changes with a dirty timestamp.
 */
export function changeFileStep(path: string, description: string): WatchTestStep {
  return {
    description, // Mandatory, because we don't want to print the absolute path
    action: async () => {
      await execa(`echo "\n" >> ${path}`, { shell: true })
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

function stringifyJsonLog(entries: UpdateLogEntryParams[]) {
  return entries
    .map((l) => {
      const msg = chalk.white(<string>l.msg || "")
      return l.section ? `${chalk.cyanBright(l.section)}${chalk.gray(":")} ${msg}` : msg
    })
    .join("\n")
}

/**
 * This helper is for testing a non-watch-mode commands. It returns a parsed representation of its log output,
 * which can then e.g. be queried for matching log entries.
 *
 * The GardenWatch class below, on the other hand, is for running/testing watch-mode commands.
 */
export async function runGarden(dir: string, command: string[]): Promise<JsonLogEntry[]> {
  try {
    const { stdout } = await execGarden(command, dir)
    const parsedLog = parseLogEntries(stdout.split("\n").filter(Boolean))
    if (showLog) {
      console.log(stringifyJsonLog(parsedLog))
    }
    return parsedLog
  } catch (err) {
    let msg = err.message.split("\n")[0]
    if (err.stdout) {
      const parsedLog = parseLogEntries(err.stdout.split("\n").filter(Boolean))
      msg += "\n" + stringifyJsonLog(parsedLog)
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
 *   "waiting": the condition hasn't passed or failed yet
 *   "passed": condition has passed (proceed to next step)
 *   "failed": condition has failed (terminates the watch command)
 */
export type WatchTestCondition = (logEntries: JsonLogEntry[]) => Promise<WatchTestConditionState>

export type WatchTestAction = (logEntries: JsonLogEntry[]) => Promise<void>

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
  public running: boolean

  constructor(public dir: string, public command: string[]) {
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
    })
    this.running = true

    stream.on("data", (data: Buffer) => {
      const lines = data
        .toString()
        .trim()
        .split("\n")
      const entries = parseLogEntries(lines)
      this.logEntries.push(...entries)
      if (showLog) {
        console.log(stringifyLogEntries(entries))
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
      }
      this.running = false
    }

    this.proc.on("close", closeHandler)
    this.proc.on("exit", closeHandler)

    this.proc.on("disconnect", () => {
      error = new Error(`Disconnected from process`)
      this.running = false
    })

    this.checkIntervalMs = checkIntervalMs

    let error: Error | undefined = undefined
    const startTime = new Date().getTime()

    while (this.running) {
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

      const now = new Date().getTime()
      if (now - startTime > timeout * 1000) {
        const log = stringifyLogEntries(this.logEntries)
        error = new TimeoutError(`Timed out waiting for test steps. Logs:\n${log}`, {
          logEntries: this.logEntries,
          log,
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

      ${stringifyLogEntries(this.logEntries)}`)

    throw new Error(`Test step ${description} failed.`)
  }

  private async performAction() {
    const { action, description } = this.testSteps[this.currentTestStepIdx]
    await action!(this.logEntries)
    mlog.log(`${description}`)
    this.currentTestStepIdx++
  }

  private async stop() {
    if (!this.running) {
      return
    }

    this.running = false
    this.proc.kill()

    const startTime = new Date().getTime()
    while (true) {
      await sleep(DEFAULT_CHECK_INTERVAL_MS)
      if (this.proc.killed) {
        break
      }
      const now = new Date().getTime()
      if (now - startTime > 10 * DEFAULT_CHECK_INTERVAL_MS) {
        const log = stringifyLogEntries(this.logEntries)
        throw new TimeoutError(`Timed out waiting for garden command to terminate. Log:\n${log}`, {
          logEntries: this.logEntries,
          log,
        })
      }
    }
  }

  private validateSteps(testSteps: WatchTestStep[]) {
    for (const { condition, action, description } of testSteps) {
      const hasCondition = !!condition
      const hasAction = !!action
      if (!hasCondition && !hasAction) {
        throw new ParameterError(
          deline`
          GardenWatch: step ${description} in testSteps defines neither a condition nor an action.
          Steps must define either a condition or an action.`,
          { testSteps }
        )
      }
      if (hasCondition && hasAction) {
        throw new ParameterError(
          deline`
          GardenWatch: step ${description} in testSteps defines both a condition and an action.
          Steps must define either a condition or an action, but not both.`,
          { testSteps }
        )
      }
    }

    if (testSteps.length === 0) {
      throw new ParameterError(
        deline`
        GardenWatch: run method called with an empty testSteps array. At least one test step must be provided.`,
        {}
      )
    }

    if (!testSteps[testSteps.length - 1].condition) {
      throw new ParameterError(
        deline`
        GardenWatch: The last element of testSteps must be a condition, not an action.`,
        { testSteps }
      )
    }
  }
}
