/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { execa } from "execa"
import { last, repeat } from "lodash-es"
import type { DeepPrimitiveMap, PrimitiveMap, StringMap } from "../../config/common.js"
import type { Garden } from "../../garden.js"
import type { Log } from "../../logger/log-entry.js"
import { LogLevel } from "../../logger/logger.js"
import type { GardenError } from "../../exceptions.js"
import {
  ChildProcessError,
  ConfigurationError,
  InternalError,
  RuntimeError,
  WorkflowScriptError,
} from "../../exceptions.js"
import type { GardenCli } from "../../cli/cli.js"
import type { GlobalOptions, ParameterValues } from "../../cli/params.js"
import type { CommandResult } from "../base.js"
import type { ConfigContext } from "../../config/template-contexts/base.js"
import { parseCliArgs, pickCommand, processCliArgs } from "../../cli/helpers.js"
import { getBuiltinCommands } from "../commands.js"
import { getCustomCommands } from "../custom.js"
import { styles } from "../../logger/styles.js"
import { dedent, wordWrap, deline } from "../../util/string.js"
import { getDurationMsec, runScript } from "../../util/util.js"
import { getTerminalWidth, renderMessageWithDivider, renderDuration } from "../../logger/util.js"
import { deepEvaluate } from "../../template/evaluate.js"
import { getTracePropagationEnvVars } from "../../util/open-telemetry/propagation.js"

// ---- Types ----

export type StepModifier = "onSuccess" | "onError" | "always" | "never"

export interface StepSpec {
  name?: string
  description?: string
  envVars?: PrimitiveMap
  when?: StepModifier
  skip?: boolean
  continueOnError?: boolean
  command?: string[]
  gardenCommand?: string[]
  exec?: { command: string[]; env?: StringMap }
  script?: string
}

export interface StepResult {
  number: number
  outputs: DeepPrimitiveMap
  log: string
}

export interface RunStepParams {
  cli?: GardenCli
  garden: Garden
  outerLog: Log
  bodyLog: Log
  inheritedOpts: ParameterValues<GlobalOptions>
  step: StepSpec
  stepIndex: number
  stepCount: number
}

export interface RunStepLogParams extends RunStepParams {
  success: boolean
}

export interface StepErrors {
  [index: number]: any[]
}

export interface ExecuteStepsCallbacks {
  onStepSkipped?: (index: number) => void
  onStepProcessing?: (index: number) => void
  onStepComplete?: (index: number, startedAt: Date) => void
  onStepError?: (index: number, startedAt: Date) => void
  getStepMetadata?: (index: number) => Record<string, any> | undefined
}

export interface ExecuteStepsParams {
  steps: StepSpec[]
  garden: Garden
  cli?: GardenCli
  log: Log
  inheritedOpts: ParameterValues<GlobalOptions>
  createStepContext: (params: {
    stepName: string
    allStepNames: string[]
    resolvedSteps: Record<string, StepResult>
  }) => ConfigContext
  callbacks?: ExecuteStepsCallbacks
}

export interface ExecuteStepsResult {
  steps: Record<string, StepResult>
  errors: StepErrors
}

// ---- Helper functions ----

export function getStepName(index: number, name?: string) {
  return name || `step-${index + 1}`
}

const minWidth = 120

export function printStepHeader(log: Log, stepIndex: number, stepCount: number, stepDescription?: string) {
  const maxWidth = Math.min(getTerminalWidth(), minWidth)
  const text = `Running step ${formattedStepDescription(stepIndex, stepCount, stepDescription)}`
  const header = dedent`
    ${styles.highlight.bold(wordWrap(text, maxWidth))}
    ${getStepSeparatorBar()}
  `
  log.info(header)
}

function getSeparatorBar(width: number) {
  return styles.accent(repeat("═", width))
}

export function printStepDuration({ outerLog, stepIndex, bodyLog, stepCount, success }: RunStepLogParams) {
  const durationSecs = bodyLog.getDuration()
  const result = success ? styles.success("completed") : styles.error("failed")

  const text = deline`
    Step ${formattedStepNumber(stepIndex, stepCount)} ${styles.bold(result)} in
    ${styles.accent(String(durationSecs))} Sec
  `
  outerLog.info(`${getStepSeparatorBar()}\n${styles.highlight.bold(text)}\n`)
}

export function getStepSeparatorBar() {
  const maxWidth = Math.min(getTerminalWidth(), minWidth)
  return getSeparatorBar(maxWidth)
}

export function formattedStepDescription(stepIndex: number, stepCount: number, stepDescription?: string) {
  let formatted = formattedStepNumber(stepIndex, stepCount)
  if (stepDescription) {
    formatted += ` — ${styles.accent(stepDescription)}`
  }
  return formatted
}

export function formattedStepNumber(stepIndex: number, stepCount: number) {
  return `${styles.accent(String(stepIndex + 1))}/${styles.accent(String(stepCount))}`
}

export function getStepEndEvent(index: number, startedAt: Date) {
  return { index, durationMsec: getDurationMsec(startedAt, new Date()) }
}

// ---- Step execution functions ----

/**
 * Runs a Garden command as a step. Supports both `step.command` (workflow style) and `step.gardenCommand`
 * (custom command style).
 */
export async function runStepCommand(params: RunStepParams): Promise<CommandResult<unknown>> {
  const { cli, garden, bodyLog, inheritedOpts, step } = params
  const rawArgs = step.command || step.gardenCommand

  if (!rawArgs) {
    throw new InternalError({
      message: `runStepCommand called but neither command nor gardenCommand is set on the step`,
    })
  }

  let { command, rest, matchedPath } = pickCommand(getBuiltinCommands(), rawArgs)

  if (!command) {
    const customCommands = await getCustomCommands(garden.log, garden.projectRoot)
    const picked = pickCommand(customCommands, rawArgs)
    command = picked.command
    rest = picked.rest
    matchedPath = picked.matchedPath
  }

  if (!command) {
    throw new ConfigurationError({
      message: `Could not find Garden command '${rawArgs.join(" ")}`,
    })
  }

  const parsedArgs = parseCliArgs({ stringArgs: rest, command, cli: false, skipGlobalDefault: true })
  const { args, opts } = processCliArgs({
    log: bodyLog,
    rawArgs,
    parsedArgs,
    command,
    matchedPath,
    cli: false,
    inheritedOpts,
    warnOnGlobalOpts: true,
  })

  const commandParams = {
    cli,
    garden,
    log: bodyLog,
    args,
    opts,
  }

  return await command.action(commandParams)
}

/**
 * Runs a bash script as a step.
 */
export async function runStepScript({
  garden,
  bodyLog,
  step,
}: RunStepParams): Promise<
  CommandResult<{ exitCode: number | undefined; stdout: string | undefined; stderr: string | undefined }>
> {
  try {
    const res = await runScript({ log: bodyLog, cwd: garden.projectRoot, script: step.script!, envVars: step.envVars })
    return {
      result: {
        exitCode: res.exitCode,
        stdout: res.stdout,
        stderr: res.stderr,
      },
    }
  } catch (err) {
    if (!(err instanceof ChildProcessError)) {
      throw err
    }

    const scriptError = new WorkflowScriptError({
      output: err.details.output,
      exitCode: err.details.code,
      stdout: err.details.stdout,
      stderr: err.details.stderr,
    })

    return {
      result: {
        exitCode: err.details.code,
        stdout: err.details.stdout,
        stderr: err.details.stderr,
      },
      errors: [scriptError],
    }
  }
}

/**
 * Runs an external command (exec) as a step.
 */
export async function runStepExec({
  garden,
  bodyLog,
  step,
}: RunStepParams): Promise<CommandResult<{ command: string[]; exitCode: number }>> {
  const exec = step.exec!
  const command = exec.command
  bodyLog.debug(`Running exec command: ${command.join(" ")}`)

  const res = await execa(command[0], command.slice(1), {
    stdio: "inherit",
    buffer: true,
    env: {
      ...process.env,
      ...(exec.env || {}),
      ...getTracePropagationEnvVars(),
    },
    cwd: garden.projectRoot,
    reject: false,
  })

  if (res.exitCode !== 0) {
    return {
      result: { command, exitCode: res.exitCode },
      errors: [
        new RuntimeError({
          message: `Command "${command.join(" ")}" exited with code ${res.exitCode}`,
        }),
      ],
    }
  }

  return {
    result: { command, exitCode: res.exitCode },
  }
}

// ---- Step flow control ----

export function shouldBeDropped(stepIndex: number, steps: StepSpec[], stepErrors: StepErrors): boolean {
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
      return true
    }

    const previousOnErrorStepIndexes: number[] = []
    for (const [index, s] of steps.entries()) {
      if (s.when === "onError" && lastErrorIndex < index && index < stepIndex) {
        previousOnErrorStepIndexes.push(index)
      }
    }

    const errorBelongsToPreviousSequence =
      previousOnErrorStepIndexes.find((prevOnErrorIdx) => {
        return steps.find(
          (s, idx) => !["never", "onError"].includes(s.when || "") && prevOnErrorIdx < idx && idx < stepIndex
        )
      }) !== undefined
    return errorBelongsToPreviousSequence
  }

  return lastErrorIndex !== undefined
}

export function logStepErrors(
  log: Log,
  errors: GardenError[],
  stepIndex: number,
  stepCount: number,
  continueOnError: boolean,
  stepDescription?: string
) {
  const description = formattedStepDescription(stepIndex, stepCount, stepDescription)
  const allowedToFailMessage = `Because ${styles.bold("continueOnError")} is ${styles.bold(true)}, the workflow will continue as if the step succeeded.`
  const errMsg = `\nAn error occurred while running step ${styles.accent(description)}.${continueOnError ? ` ${allowedToFailMessage}` : ``}\n`

  const logFn: typeof log.warn | typeof log.error = (...args) =>
    continueOnError ? log.warn(...args) : log.error(...args)

  logFn(errMsg)
  for (const error of errors) {
    if (error instanceof WorkflowScriptError) {
      logFn(
        renderMessageWithDivider({
          prefix: `Script exited with code ${error.details.exitCode} ${renderDuration(log.getDuration())}. This is the stderr output:`,
          msg: error.details.stderr || error.details.output,
          isError: !continueOnError,
        })
      )
      logFn("")
    } else {
      const taskDetailErrMsg = error.toString(false)
      log.debug(taskDetailErrMsg)
      logFn(error.message + "\n\n")
    }
  }
}

// ---- Main step execution loop ----

function resolveStepTemplates(step: StepSpec, context: ConfigContext): void {
  if (step.command) {
    step.command = deepEvaluate(step.command, { context, opts: {} }).filter((arg: any) => !!arg)
  }
  if (step.gardenCommand) {
    step.gardenCommand = deepEvaluate(step.gardenCommand, { context, opts: {} }).filter((arg: any) => !!arg)
  }
  if (step.exec) {
    step.exec = deepEvaluate(step.exec, { context, opts: {} })
  }
  if (step.script) {
    step.script = deepEvaluate(step.script, { context, opts: {} }) as string
  }
}

async function runStep(params: RunStepParams): Promise<CommandResult | undefined> {
  const { step } = params

  if (step.command || step.gardenCommand) {
    return await runStepCommand(params)
  } else if (step.exec) {
    return await runStepExec(params)
  } else if (step.script) {
    return await runStepScript(params)
  }

  return undefined
}

function hasStepAction(step: StepSpec): boolean {
  return !!(step.command || step.gardenCommand || step.exec || step.script)
}

/**
 * Executes a sequence of steps. Used by both Workflows and custom Commands.
 */
export async function executeSteps(params: ExecuteStepsParams): Promise<ExecuteStepsResult> {
  const { steps, garden, cli, log, inheritedOpts, createStepContext, callbacks } = params

  const allStepNames = steps.map((s, i) => getStepName(i, s.name))
  const result: ExecuteStepsResult = { steps: {}, errors: {} }
  const stepErrors: StepErrors = result.errors

  log.info("\n" + getStepSeparatorBar())

  for (const [index, step] of steps.entries()) {
    if (shouldBeDropped(index, steps, stepErrors)) {
      continue
    }

    printStepHeader(log, index, steps.length, step.description)

    const stepName = getStepName(index, step.name)
    const metadata = callbacks?.getStepMetadata?.(index)
    const stepBodyLog = log.createLog({ metadata })

    if (step.skip) {
      stepBodyLog.info(
        styles.warning(`Skipping step ${styles.accent(String(index + 1))}/${styles.accent(String(steps.length))}`)
      )
      result.steps[stepName] = {
        number: index + 1,
        outputs: {},
        log: "",
      }
      callbacks?.onStepSkipped?.(index)
      log.info(`\n`)
      continue
    }

    const stepParams: RunStepParams = {
      cli,
      garden,
      step,
      stepIndex: index,
      stepCount: steps.length,
      inheritedOpts,
      outerLog: log,
      bodyLog: stepBodyLog,
    }

    callbacks?.onStepProcessing?.(index)

    const stepContext = createStepContext({
      stepName,
      allStepNames,
      resolvedSteps: result.steps,
    })

    const stepStartedAt = new Date()
    const initSaveLogState = stepBodyLog.root.storeEntries
    stepBodyLog.root.storeEntries = true

    if (!hasStepAction(step)) {
      callbacks?.onStepError?.(index, stepStartedAt)
      throw new InternalError({
        message: `Step must specify a command, gardenCommand, exec, or script. Got: ${JSON.stringify(step)}`,
      })
    }

    let stepResult: CommandResult | undefined

    try {
      resolveStepTemplates(step, stepContext)
      stepResult = await runStep(stepParams)
    } catch (rawErr) {
      const err =
        rawErr instanceof Error && "type" in rawErr
          ? (rawErr as GardenError)
          : new RuntimeError({ message: String(rawErr) })

      callbacks?.onStepError?.(index, stepStartedAt)
      stepErrors[index] = [err]
      printStepDuration({ ...stepParams, success: false })
      const continueOnError = false
      logStepErrors(stepBodyLog, [err], index, steps.length, continueOnError, step.description)
      break
    }

    if (stepResult === undefined) {
      throw new InternalError({
        message: `Step did not return a result. Step: ${JSON.stringify(step)}`,
      })
    }

    const stepLog = stepBodyLog.toString((entry) => entry.level <= LogLevel.info)

    result.steps[stepName] = {
      number: index + 1,
      outputs: stepResult.result || {},
      log: stepLog,
    }
    stepBodyLog.root.storeEntries = initSaveLogState

    if (stepResult.errors && stepResult.errors.length > 0) {
      logStepErrors(
        log,
        stepResult.errors as GardenError[],
        index,
        steps.length,
        step.continueOnError || false,
        step.description
      )

      callbacks?.onStepError?.(index, stepStartedAt)

      if (!step.continueOnError) {
        stepErrors[index] = stepResult.errors
      }

      continue
    }

    callbacks?.onStepComplete?.(index, stepStartedAt)
    printStepDuration({ ...stepParams, success: true })
  }

  return result
}
