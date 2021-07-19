/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { cloneDeep, flatten, last, merge, repeat, size } from "lodash"
import { printHeader, getTerminalWidth, formatGardenError, renderMessageWithDivider } from "../../logger/util"
import { Command, CommandParams, CommandResult } from "../base"
import { dedent, wordWrap, deline } from "../../util/string"
import { Garden } from "../../garden"
import { WorkflowStepSpec, WorkflowConfig, WorkflowFileSpec } from "../../config/workflow"
import { LogEntry } from "../../logger/log-entry"
import { GardenError, WorkflowScriptError } from "../../exceptions"
import {
  WorkflowConfigContext,
  WorkflowStepConfigContext,
  WorkflowStepResult,
} from "../../config/template-contexts/workflow"
import { resolveTemplateStrings, resolveTemplateString } from "../../template-string/template-string"
import { ConfigurationError, FilesystemError } from "../../exceptions"
import { posix, join } from "path"
import { ensureDir, writeFile } from "fs-extra"
import Bluebird from "bluebird"
import { getDurationMsec, toEnvVars } from "../../util/util"
import { runScript } from "../../util/util"
import { ExecaError } from "execa"
import { LogLevel } from "../../logger/logger"
import { registerWorkflowRun } from "../../enterprise/workflow-lifecycle"
import { parseCliArgs, pickCommand, processCliArgs } from "../../cli/helpers"
import { StringParameter } from "../../cli/params"
import { getAllCommands } from "../commands"
import { emitStackGraphEvent } from "../helpers"

const runWorkflowArgs = {
  workflow: new StringParameter({
    help: "The name of the workflow to be run.",
    required: true,
  }),
}

type Args = typeof runWorkflowArgs

interface WorkflowRunOutput {
  steps: { [stepName: string]: WorkflowStepResult }
}

export class RunWorkflowCommand extends Command<Args, {}> {
  name = "workflow"
  help = "Run a workflow."

  streamEvents = true
  streamLogEntries = true

  description = dedent`
    Runs the commands and/or scripts defined in the workflow's steps, in sequence.

    Examples:

        garden run workflow my-workflow    # run my-workflow
  `

  arguments = runWorkflowArgs

  printHeader({ headerLog, args }) {
    printHeader(headerLog, `Running workflow ${chalk.white(args.workflow)}`, "runner")
  }

  async action({ garden, log, args, opts }: CommandParams<Args, {}>): Promise<CommandResult<WorkflowRunOutput>> {
    const outerLog = log.placeholder()
    // Prepare any configured files before continuing
    const workflow = await garden.getWorkflowConfig(args.workflow)

    // Merge any workflow-level environment variables into process.env.
    for (const [key, value] of Object.entries(toEnvVars(workflow.envVars))) {
      process.env[key] = value
    }

    await registerAndSetUid(garden, log, workflow)
    garden.events.emit("workflowRunning", {})
    const templateContext = new WorkflowConfigContext(garden, garden.variables)
    const files = resolveTemplateStrings(workflow.files || [], templateContext)

    // Write all the configured files for the workflow
    await Bluebird.map(files, (file) => writeWorkflowFile(garden, file))

    const steps = workflow.steps
    const allStepNames = steps.map((s, i) => getStepName(i, s.name))
    const startedAt = new Date().valueOf()
    await maybeEmitStackGraphEvent(garden, log, workflow)

    const result: WorkflowRunOutput = {
      steps: {},
    }

    let stepErrors: StepErrors = {}

    for (const [index, step] of steps.entries()) {
      if (shouldBeDropped(index, steps, stepErrors)) {
        continue
      }
      printStepHeader(outerLog, index, steps.length, step.description)

      const stepName = getStepName(index, step.name)

      const metadata = {
        workflowStep: { index },
      }
      const stepHeaderLog = outerLog.placeholder({ indent: 1, metadata })
      const stepBodyLog = outerLog.placeholder({ indent: 1, metadata })
      const stepFooterLog = outerLog.placeholder({ indent: 1, metadata })
      garden.log.setState({ metadata })

      if (step.skip) {
        stepBodyLog.setState(chalk.yellow(`Skipping step ${chalk.white(index + 1)}/${chalk.white(steps.length)}`))
        result.steps[stepName] = {
          number: index + 1,
          outputs: {},
          log: "",
        }
        garden.events.emit("workflowStepSkipped", { index })
        outerLog.info(`\n`)
        continue
      }

      const inheritedOpts = cloneDeep(opts)
      const stepParams: RunStepParams = {
        garden,
        step,
        stepIndex: index,
        stepCount: steps.length,
        inheritedOpts,
        outerLog,
        headerLog: stepHeaderLog,
        bodyLog: stepBodyLog,
        footerLog: stepFooterLog,
      }

      let stepResult: CommandResult

      garden.events.emit("workflowStepProcessing", { index })
      const stepTemplateContext = new WorkflowStepConfigContext({
        allStepNames,
        garden,
        resolvedSteps: result.steps,
        stepName,
      })

      const stepStartedAt = new Date()

      try {
        if (step.command) {
          step.command = resolveTemplateStrings(step.command, stepTemplateContext)
          stepResult = await runStepCommand(stepParams)
        } else if (step.script) {
          step.script = resolveTemplateString(step.script, stepTemplateContext)
          stepResult = await runStepScript(stepParams)
        } else {
          garden.events.emit("workflowStepError", getStepEndEvent(index, stepStartedAt))
          throw new ConfigurationError(`Workflow steps must specify either a command or a script.`, { step })
        }
      } catch (err) {
        garden.events.emit("workflowStepError", getStepEndEvent(index, stepStartedAt))
        stepErrors[index] = [err]
        printStepDuration({ ...stepParams, success: false })
        printResult({ startedAt, log: outerLog, workflow, success: false })
        logErrors(outerLog, [err], index, steps.length, step.description)
        // There may be succeeding steps with `when: onError` or `when: always`, so we continue.
        continue
      }

      // Extract the text from the body log entry, info-level and higher
      const stepLog = stepBodyLog.toString((entry) => entry.level <= LogLevel.info)

      result.steps[stepName] = {
        number: index + 1,
        outputs: stepResult.result || {},
        log: stepLog,
      }

      if (stepResult.errors) {
        garden.events.emit("workflowStepError", getStepEndEvent(index, stepStartedAt))
        logErrors(outerLog, stepResult.errors, index, steps.length, step.description)
        stepErrors[index] = stepResult.errors
        // There may be succeeding steps with `when: onError` or `when: always`, so we continue.
        continue
      }

      garden.events.emit("workflowStepComplete", getStepEndEvent(index, stepStartedAt))
      printStepDuration({ ...stepParams, success: true })
    }

    if (size(stepErrors) > 0) {
      printResult({ startedAt, log: outerLog, workflow, success: false })
      garden.events.emit("workflowError", {})
      return { result, errors: flatten(Object.values(stepErrors)) }
    }

    printResult({ startedAt, log: outerLog, workflow, success: true })
    garden.events.emit("workflowComplete", {})

    return { result }
  }
}

export interface RunStepParams {
  garden: Garden
  outerLog: LogEntry
  headerLog: LogEntry
  bodyLog: LogEntry
  footerLog: LogEntry
  inheritedOpts: any
  step: WorkflowStepSpec
  stepIndex: number
  stepCount: number
}

export interface RunStepLogParams extends RunStepParams {
  success: boolean
}

export interface RunStepCommandParams extends RunStepParams {}

interface StepErrors {
  [index: number]: any[]
}

function getStepName(index: number, name?: string) {
  return name || `step-${index + 1}`
}

const minWidth = 120

export function printStepHeader(log: LogEntry, stepIndex: number, stepCount: number, stepDescription?: string) {
  const maxWidth = Math.min(getTerminalWidth(), minWidth)
  let text = `Running step ${formattedStepDescription(stepIndex, stepCount, stepDescription)}`
  const header = dedent`
    ${chalk.cyan.bold(wordWrap(text, maxWidth))}
    ${getStepSeparatorBar()}
  `
  log.info(header)
}

function getSeparatorBar(width: number) {
  return chalk.white(repeat("═", width))
}

export function printStepDuration({ outerLog, stepIndex, bodyLog, stepCount, success }: RunStepLogParams) {
  const durationSecs = bodyLog.getDuration()
  const result = success ? chalk.green("completed") : chalk.red("failed")

  const text = deline`
    Step ${formattedStepNumber(stepIndex, stepCount)} ${chalk.bold(result)} in
    ${chalk.white(durationSecs)} Sec
  `
  outerLog.info(`${getStepSeparatorBar()}\n${chalk.cyan.bold(text)}\n`)
}

function getStepSeparatorBar() {
  const maxWidth = Math.min(getTerminalWidth(), minWidth)
  return getSeparatorBar(maxWidth)
}

export function formattedStepDescription(stepIndex: number, stepCount: number, stepDescription?: string) {
  let formatted = formattedStepNumber(stepIndex, stepCount)
  if (stepDescription) {
    formatted += ` — ${chalk.white(stepDescription)}`
  }
  return formatted
}

export function formattedStepNumber(stepIndex: number, stepCount: number) {
  return `${chalk.white(stepIndex + 1)}/${chalk.white(stepCount)}`
}

function printResult({
  startedAt,
  log,
  workflow,
  success,
}: {
  startedAt: number
  log: LogEntry
  workflow: WorkflowConfig
  success: boolean
}) {
  const completedAt = new Date().valueOf()
  const totalDuration = ((completedAt - startedAt) / 1000).toFixed(2)

  const resultColor = success ? chalk.magenta.bold : chalk.red.bold
  const resultMessage = success ? "completed successfully" : "failed"

  log.info(
    resultColor(`Workflow ${chalk.white.bold(workflow.name)} ${resultMessage}. `) +
      chalk.magenta(`Total time elapsed: ${chalk.white.bold(totalDuration)} Sec.`)
  )
}

export async function runStepCommand({
  garden,
  bodyLog,
  footerLog,
  headerLog,
  inheritedOpts,
  step,
}: RunStepCommandParams): Promise<CommandResult<any>> {
  const { command, rest } = pickCommand(getAllCommands(), step.command!)

  if (!command) {
    throw new ConfigurationError(`Could not find Garden command '${step.command!}`, {
      step,
    })
  }

  if (!command?.workflows) {
    throw new ConfigurationError(`Command '${command?.getFullName()}' is currently not supported in workflows`, {
      step,
      command: command?.getFullName(),
    })
  }

  const parsedArgs = parseCliArgs({ stringArgs: rest, command, cli: false })
  const { args, opts } = processCliArgs({ parsedArgs, command, cli: false })

  const result = await command.action({
    garden,
    footerLog,
    log: bodyLog,
    headerLog,
    args,
    opts: merge(inheritedOpts, opts),
    isWorkflowStepCommand: true, // <-----
  })
  return result
}

export async function runStepScript({ garden, bodyLog, step }: RunStepParams): Promise<CommandResult<any>> {
  try {
    await runScript({ log: bodyLog, cwd: garden.projectRoot, script: step.script!, envVars: step.envVars })
    return { result: {} }
  } catch (_err) {
    const error = _err as ExecaError

    // Unexpected error (failed to execute script, as opposed to script returning an error code)
    if (!error.exitCode) {
      throw error
    }

    const scriptError = new WorkflowScriptError(`Script exited with code ${error.exitCode}`, {
      message: error.stderr,
      exitCode: error.exitCode,
      stdout: error.stdout,
      stderr: error.stderr,
    })

    bodyLog.error("")
    bodyLog.error({ msg: `Script failed with the following error:`, error: scriptError })
    bodyLog.error("")
    bodyLog.error(error.stderr)

    throw scriptError
  }
}

export function shouldBeDropped(stepIndex: number, steps: WorkflowStepSpec[], stepErrors: StepErrors): boolean {
  const step = steps[stepIndex]
  if (step.when === "always") {
    return false
  }
  if (step.when === "never") {
    return true
  }
  const lastErrorIndex = last(
    steps.filter((s, index) => s.when !== "onError" && !!stepErrors[index]).map((_, index) => index)
  )
  if (step.when === "onError") {
    if (lastErrorIndex === undefined) {
      // No error has been thrown yet, so there's no need to run this `onError` step.
      return true
    }

    let previousOnErrorStepIndexes: number[] = []
    for (const [index, s] of steps.entries()) {
      if (s.when === "onError" && lastErrorIndex < index && index < stepIndex) {
        previousOnErrorStepIndexes.push(index)
      }
    }
    /**
     * If true, then there is one or more `onError` step between this step and the step that threw the error,  and
     * there's also a non-`onError`/`never` step in between. That means that it's not up to this sequence of `onError`
     * steps to "handle" that error.
     *
     * Example: Here, steps a, b and c don't have a `when` modifier, and e1, e2 and e3 have `when: onError`.
     *   [a, b, e1, e2, c, e3]
     * If a throws an error, we run e1 and e2, but drop c and e3.
     */
    const errorBelongsToPreviousSequence =
      previousOnErrorStepIndexes.find((prevOnErrorIdx) => {
        return steps.find(
          (s, idx) => !["never", "onError"].includes(s.when || "") && prevOnErrorIdx < idx && idx < stepIndex
        )
      }) !== undefined
    return errorBelongsToPreviousSequence
  }

  // This step has no `when` modifier, so we drop it if an error has been thrown by a previous step.
  return lastErrorIndex !== undefined
}

export function logErrors(
  log: LogEntry,
  errors: GardenError[],
  stepIndex: number,
  stepCount: number,
  stepDescription?: string
) {
  const description = formattedStepDescription(stepIndex, stepCount, stepDescription)
  const errMsg = dedent`
    An error occurred while running step ${chalk.white(description)}.

    See the log output below for additional details.\n
  `
  log.error(chalk.red(errMsg))
  log.debug("")
  for (const error of errors) {
    if (error.type === "workflow-script") {
      const scriptErrMsg = renderMessageWithDivider(
        `Script exited with code ${error.detail.exitCode}`,
        error.detail.stderr,
        true
      )
      log.error(scriptErrMsg)
    } else {
      // Error comes from a command step. We only log the detail here (and only for log.debug or higher), since
      // the task graph's error logging takes care of the rest.
      const taskDetailErrMsg = formatGardenError(error)
      log.debug(chalk.red(taskDetailErrMsg))
    }
  }
}

async function registerAndSetUid(garden: Garden, log: LogEntry, config: WorkflowConfig) {
  const { enterpriseApi } = garden
  if (enterpriseApi) {
    const workflowRunUid = await registerWorkflowRun({
      garden,
      workflowConfig: config,
      environment: garden.environmentName,
      namespace: garden.namespace,
      log,
    })
    garden.events.emit("_workflowRunRegistered", { workflowRunUid })
  }
}

/**
 * If one or more steps of the workflow is a command with `streamEvents = true`, we prepare a `ConfigGraph` instance
 * and stream a stack graph event.
 *
 * This is only done once at the beginning of the workflow to avoid streaming the graph for every subcommand having
 * `streamEvents = true` (since we're also passing `isStepCommand = true` to the step command action in
 * `runStepCommand`).
 */
async function maybeEmitStackGraphEvent(garden: Garden, log: LogEntry, config: WorkflowConfig) {
  const shouldEmitStackGraphEvent = config.steps.find((s) => {
    if (!s.command) {
      return false
    }
    const { command } = pickCommand(getAllCommands(), s.command)
    return command && command.streamEvents
  })
  if (shouldEmitStackGraphEvent) {
    const graph = await garden.getConfigGraph(log)
    emitStackGraphEvent(garden, graph)
  }
}

async function writeWorkflowFile(garden: Garden, file: WorkflowFileSpec) {
  let data: string

  if (file.data !== undefined) {
    data = file.data
  } else if (file.secretName) {
    data = garden.secrets[file.secretName]

    if (data === undefined) {
      throw new ConfigurationError(
        `File '${file.path}' requires secret '${file.secretName}' which could not be found.`,
        {
          file,
          availableSecrets: Object.keys(garden.secrets),
        }
      )
    }
  } else {
    throw new ConfigurationError(`File '${file.path}' specifies neither string data nor a secret name.`, { file })
  }

  const fullPath = join(garden.projectRoot, ...file.path.split(posix.sep))
  const parsedPath = posix.parse(fullPath)

  try {
    await ensureDir(parsedPath.dir)
    await writeFile(fullPath, data)
  } catch (error) {
    throw new FilesystemError(`Unable to write file '${file.path}': ${error.message}`, { error, file })
  }
}

function getStepEndEvent(index: number, startedAt: Date) {
  return { index, durationMsec: getDurationMsec(startedAt, new Date()) }
}
