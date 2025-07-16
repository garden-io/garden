/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import cloneDeep from "fast-copy"
import { flatten, last, repeat, size } from "lodash-es"
import { printHeader, getTerminalWidth, renderMessageWithDivider, renderDuration } from "../logger/util.js"
import type { CommandParams, CommandResult } from "./base.js"
import { Command } from "./base.js"
import { dedent, wordWrap, deline, naturalList } from "../util/string.js"
import type { Garden } from "../garden.js"
import type { WorkflowStepSpec, WorkflowConfig, WorkflowFileSpec } from "../config/workflow.js"
import type { Log } from "../logger/log-entry.js"
import type { GardenError } from "../exceptions.js"
import { ChildProcessError, InternalError, RuntimeError, WorkflowScriptError, toGardenError } from "../exceptions.js"
import type { WorkflowStepResult } from "../config/template-contexts/workflow.js"
import { WorkflowConfigContext, WorkflowStepConfigContext } from "../config/template-contexts/workflow.js"
import { ConfigurationError, FilesystemError } from "../exceptions.js"
import { posix, join } from "path"
import fsExtra from "fs-extra"
import { getDurationMsec, toEnvVars } from "../util/util.js"
import { runScript } from "../util/util.js"
import { LogLevel } from "../logger/logger.js"
import { registerWorkflowRun } from "../cloud/legacy/workflow-lifecycle.js"
import { parseCliArgs, pickCommand, processCliArgs } from "../cli/helpers.js"
import type { GlobalOptions, ParameterValues } from "../cli/params.js"
import { StringParameter } from "../cli/params.js"
import type { GardenCli } from "../cli/cli.js"
import { getCustomCommands } from "./custom.js"
import { getBuiltinCommands } from "./commands.js"
import { styles } from "../logger/styles.js"
import { deepEvaluate } from "../template/evaluate.js"
import { throwOnMissingSecretKeys } from "../config/secrets.js"
import { RemoteSourceConfigContext } from "../config/template-contexts/project.js"

const { ensureDir, writeFile } = fsExtra

const runWorkflowArgs = {
  workflow: new StringParameter({
    help: "The name of the workflow to be run.",
    required: true,
    getSuggestions: ({ configDump }) => {
      return Object.keys(configDump.workflowConfigs)
    },
  }),
}

type Args = typeof runWorkflowArgs

export interface WorkflowRunOutput {
  steps: { [stepName: string]: WorkflowStepResult }
}

export class WorkflowCommand extends Command<Args, {}> {
  name = "workflow"
  help = "Run a Workflow."

  override streamEvents = true
  override streamLogEntries = true

  override description = dedent`
    Runs the commands and/or scripts defined in the workflow's steps, in sequence.

    Examples:

        garden workflow my-workflow
  `

  override arguments = runWorkflowArgs

  override printHeader({ log, args }) {
    printHeader(log, `Running workflow ${styles.accent(args.workflow)}`, "🏃‍♂️")
  }

  async action({ cli, garden, log, args, opts }: CommandParams<Args, {}>): Promise<CommandResult<WorkflowRunOutput>> {
    const outerLog = log.createLog({})
    // Prepare any configured files before continuing
    const workflow = await garden.getWorkflowConfig(args.workflow)

    throwOnMissingSecretKeys({
      configs: [workflow],
      context: new RemoteSourceConfigContext(garden, garden.variables),
      secrets: garden.secrets,
      prefix: workflow.kind,
      isLoggedIn: garden.isLoggedIn(),
      cloudBackendDomain: garden.cloudDomain,
      log,
    })

    // Merge any workflow-level environment variables into process.env.
    for (const [key, value] of Object.entries(toEnvVars(workflow.envVars))) {
      process.env[key] = value
    }

    await registerAndSetUid(garden, log, workflow)
    garden.events.emit("workflowRunning", {})
    const templateContext = new WorkflowConfigContext(garden, garden.variables)

    // @ts-expect-error todo: correct types for unresolved configs
    const files: WorkflowFileSpec[] = deepEvaluate(workflow.files || [], {
      context: templateContext,
      opts: {},
    })

    // Write all the configured files for the workflow
    await Promise.all(files.map((file) => writeWorkflowFile(garden, file)))

    const steps = workflow.steps
    const allStepNames = steps.map((s, i) => getStepName(i, s.name))
    const startedAt = new Date().valueOf()

    const result: WorkflowRunOutput = {
      steps: {},
    }

    const stepErrors: StepErrors = {}

    for (const [index, step] of steps.entries()) {
      if (shouldBeDropped(index, steps, stepErrors)) {
        continue
      }
      printStepHeader(outerLog, index, steps.length, step.description)

      const stepName = getStepName(index, step.name)

      const metadata = {
        workflowStep: { index },
      }
      const stepBodyLog = outerLog.createLog({ metadata })
      garden.log.info({ metadata })

      if (step.skip) {
        stepBodyLog.info(
          styles.warning(`Skipping step ${styles.accent(String(index + 1))}/${styles.accent(String(steps.length))}`)
        )
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
        cli,
        garden,
        step,
        stepIndex: index,
        stepCount: steps.length,
        inheritedOpts,
        outerLog,
        bodyLog: stepBodyLog,
      }

      garden.events.emit("workflowStepProcessing", { index })
      const stepTemplateContext = new WorkflowStepConfigContext({
        allStepNames,
        garden,
        resolvedSteps: result.steps,
        stepName,
        workflow,
      })

      const stepStartedAt = new Date()

      const initSaveLogState = stepBodyLog.root.storeEntries
      stepBodyLog.root.storeEntries = true

      if ((!step.command && !step.script) || (step.command && step.script)) {
        garden.events.emit("workflowStepError", getStepEndEvent(index, stepStartedAt))
        // This should be caught by the validation layer
        throw new InternalError({
          message: `Workflow steps must specify either a command or a script. Got: ${JSON.stringify(step)}`,
        })
      }

      let stepResult: CommandResult | undefined

      try {
        if (step.command) {
          step.command = deepEvaluate(step.command, {
            context: stepTemplateContext,
            opts: {},
          }).filter((arg) => !!arg)

          stepResult = await runStepCommand(stepParams)
        } else if (step.script) {
          step.script = deepEvaluate(step.script, { context: stepTemplateContext, opts: {} }) as string
          stepResult = await runStepScript(stepParams)
        } else {
          stepResult = undefined
        }
      } catch (rawErr) {
        const err = toGardenError(rawErr)

        garden.events.emit("workflowStepError", getStepEndEvent(index, stepStartedAt))
        stepErrors[index] = [err]
        printStepDuration({ ...stepParams, success: false })
        // runStepCommand and runStepScript should not throw. If that happens it's either a bug (e.g. InternalError) or a user-error (e.g. TemplateError)
        // In these cases we do not continue workflow execution, even when continueOnError is true and even when the following steps declared to run `when: onError` or `when: always`.
        const continueOnError = false
        logErrors(stepBodyLog, [err], index, steps.length, continueOnError, step.description)
        break
      }

      if (stepResult === undefined) {
        throw new InternalError({
          message: `Workflow step did not return stepResult. Step: ${JSON.stringify(step)}`,
        })
      }

      // Extract the text from the body log entry, info-level and higher
      const stepLog = stepBodyLog.toString((entry) => entry.level <= LogLevel.info)

      // TODO: add step conclusion, so following steps can be aware of the error if step.continueOnError is true.
      result.steps[stepName] = {
        number: index + 1,
        outputs: stepResult.result || {},
        log: stepLog,
      }
      stepBodyLog.root.storeEntries = initSaveLogState

      if (stepResult.errors && stepResult.errors.length > 0) {
        logErrors(outerLog, stepResult.errors, index, steps.length, step.continueOnError || false, step.description)

        // If we ignore errors
        garden.events.emit("workflowStepError", getStepEndEvent(index, stepStartedAt))

        if (!step.continueOnError) {
          stepErrors[index] = stepResult.errors
        }

        // There may be succeeding steps with `when: onError` or `when: always`, so we continue.
        continue
      }

      garden.events.emit("workflowStepComplete", getStepEndEvent(index, stepStartedAt))
      printStepDuration({ ...stepParams, success: true })
    }

    if (size(stepErrors) > 0) {
      printResult({ startedAt, log: outerLog, workflow, success: false })
      garden.events.emit("workflowError", {})
      // TODO: If any of the errors are not instanceof GardenError, we need to log the explanation (with bug report information, etc.)
      const errors = flatten(Object.values(stepErrors))
      const finalError = opts.output
        ? errors
        : [
            new RuntimeError({
              message: `workflow failed with ${errors.length} ${
                errors.length > 1 ? "errors" : "error"
              }, see logs above for more info`,
              wrappedErrors: errors.map(toGardenError),
            }),
          ]
      return { result, errors: finalError }
    }

    printResult({ startedAt, log: outerLog, workflow, success: true })
    garden.events.emit("workflowComplete", {})

    return { result }
  }
}

export interface RunStepParams {
  cli?: GardenCli
  garden: Garden
  outerLog: Log
  bodyLog: Log
  inheritedOpts: ParameterValues<GlobalOptions>
  step: WorkflowStepSpec
  stepIndex: number
  stepCount: number
}

export interface RunStepLogParams extends RunStepParams {
  success: boolean
}

export type RunStepCommandParams = RunStepParams

interface StepErrors {
  [index: number]: any[]
}

function getStepName(index: number, name?: string) {
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

function getStepSeparatorBar() {
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

function printResult({
  startedAt,
  log,
  workflow,
  success,
}: {
  startedAt: number
  log: Log
  workflow: WorkflowConfig
  success: boolean
}) {
  const completedAt = new Date().valueOf()
  const totalDuration = ((completedAt - startedAt) / 1000).toFixed(2)

  const resultColor = success ? styles.success.bold : styles.error.bold
  const resultMessage = success ? "completed successfully" : "failed"

  log.info(
    resultColor(`Workflow ${styles.accent.bold(workflow.name)} ${resultMessage}. `) +
      styles.highlightSecondary(`Total time elapsed: ${styles.accent.bold(totalDuration)} Sec.`)
  )
}

export async function runStepCommand(params: RunStepCommandParams): Promise<CommandResult<any>> {
  const { cli, garden, bodyLog, inheritedOpts, step } = params
  const rawArgs = step.command!

  let { command, rest, matchedPath } = pickCommand(getBuiltinCommands(), rawArgs)

  if (!command) {
    // Check for custom command
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

  const persistent = command.maybePersistent(commandParams)

  if (persistent) {
    throw new ConfigurationError({
      message: `Cannot run Garden command '${rawArgs.join(" ")}'${
        step.name ? ` (Step ${step.name}) ` : ""
      }: Workflow steps cannot run Garden commands that are persistent (e.g. the dev command, interactive commands, commands with monitor flags set etc.)`,
    })
  }

  return await command.action(commandParams)
}

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
    // Unexpected error (failed to execute script, as opposed to script returning an error code)
    if (!(err instanceof ChildProcessError)) {
      throw err
    }

    const scriptError = new WorkflowScriptError({
      output: err.details.output,
      exitCode: err.details.code,
      stdout: err.details.stdout,
      stderr: err.details.stderr,
    })

    // We return the error here because we want to separately handle unexpected internal errors (like syntax errors) and user error (like script failure).
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

    const previousOnErrorStepIndexes: number[] = []
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

async function registerAndSetUid(garden: Garden, log: Log, config: WorkflowConfig) {
  if (!garden.isOldBackendAvailable()) {
    return
  }

  const workflowRunUid = await registerWorkflowRun({
    garden,
    workflowConfig: config,
    environment: garden.environmentName,
    namespace: garden.namespace,
    log,
  })
  garden.events.emit("_workflowRunRegistered", { workflowRunUid })
}

async function writeWorkflowFile(garden: Garden, file: WorkflowFileSpec) {
  let data: string

  if (file.data !== undefined) {
    data = file.data
  } else if (file.secretName) {
    data = garden.secrets[file.secretName]

    if (data === undefined) {
      throw new ConfigurationError({
        message: dedent`
          File '${file.path}' requires secret '${file.secretName}' which could not be found.

          Available secrets: ${naturalList(Object.keys(garden.secrets))}
          `,
      })
    }
  } else {
    throw new ConfigurationError({
      message: `File '${file.path}' specifies neither string data nor a secret name.`,
    })
  }

  const fullPath = join(garden.projectRoot, ...file.path.split(posix.sep))
  const parsedPath = posix.parse(fullPath)

  try {
    await ensureDir(parsedPath.dir)
    await writeFile(fullPath, data)
  } catch (error) {
    throw new FilesystemError({
      message: `Unable to write file '${file.path}': ${error}`,
    })
  }
}

function getStepEndEvent(index: number, startedAt: Date) {
  return { index, durationMsec: getDurationMsec(startedAt, new Date()) }
}
