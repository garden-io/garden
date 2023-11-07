/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
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
import { resolveTemplateStrings, resolveTemplateString } from "../template-string/template-string.js"
import { ConfigurationError, FilesystemError } from "../exceptions.js"
import { posix, join } from "path"
import fsExtra from "fs-extra"
const { ensureDir, writeFile } = fsExtra
import { getDurationMsec, toEnvVars } from "../util/util.js"
import { runScript } from "../util/util.js"
import { LogLevel } from "../logger/logger.js"
import { registerWorkflowRun } from "../cloud/workflow-lifecycle.js"
import { parseCliArgs, pickCommand, processCliArgs } from "../cli/helpers.js"
import type { GlobalOptions, ParameterValues } from "../cli/params.js"
import { StringParameter } from "../cli/params.js"
import type { GardenCli } from "../cli/cli.js"
import { getCustomCommands } from "./custom.js"
import { getBuiltinCommands } from "./commands.js"

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
    printHeader(log, `Running workflow ${chalk.white(args.workflow)}`, "🏃‍♂️")
  }

  async action({ cli, garden, log, args, opts }: CommandParams<Args, {}>): Promise<CommandResult<WorkflowRunOutput>> {
    const outerLog = log.createLog({})
    // Prepare any configured files before continuing
    const workflow = await garden.getWorkflowConfig(args.workflow)

    // Merge any workflow-level environment variables into process.env.
    for (const [key, value] of Object.entries(toEnvVars(workflow.envVars))) {
      process.env[key] = value
    }

    await registerAndSetUid(garden, log, workflow)
    garden.events.emit("workflowRunning", {})
    const templateContext = new WorkflowConfigContext(garden, garden.variables)
    const yamlDoc = workflow.internal.yamlDoc
    const files = resolveTemplateStrings({
      value: workflow.files || [],
      context: templateContext,
      source: { yamlDoc, basePath: ["files"] },
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
        stepBodyLog.info(chalk.yellow(`Skipping step ${chalk.white(index + 1)}/${chalk.white(steps.length)}`))
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

      let stepResult: CommandResult

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
      try {
        if (step.command) {
          step.command = resolveTemplateStrings({
            value: step.command,
            context: stepTemplateContext,
            source: { yamlDoc, basePath: ["steps", index, "command"] },
          }).filter((arg) => !!arg)

          stepResult = await runStepCommand(stepParams)
        } else if (step.script) {
          step.script = resolveTemplateString({ string: step.script, context: stepTemplateContext })
          stepResult = await runStepScript(stepParams)
        } else {
          garden.events.emit("workflowStepError", getStepEndEvent(index, stepStartedAt))
          // This should be caught by the validation layer
          throw new InternalError({
            message: `Workflow steps must specify either a command or a script. Got: ${JSON.stringify(step)}`,
          })
        }
      } catch (rawErr) {
        const err = toGardenError(rawErr)
        garden.events.emit("workflowStepError", getStepEndEvent(index, stepStartedAt))
        stepErrors[index] = [err]
        printStepDuration({ ...stepParams, success: false })
        logErrors(stepBodyLog, [err], index, steps.length, step.description)
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
      stepBodyLog.root.storeEntries = initSaveLogState

      if (stepResult.errors && stepResult.errors.length > 0) {
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
  log: Log
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

export async function runStepScript({ garden, bodyLog, step }: RunStepParams): Promise<CommandResult<any>> {
  try {
    await runScript({ log: bodyLog, cwd: garden.projectRoot, script: step.script!, envVars: step.envVars })
    return { result: {} }
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

    bodyLog.error("")
    bodyLog.error({ msg: `Script failed with the following error:`, error: scriptError })
    bodyLog.error("")
    bodyLog.error(err.details.stderr)

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
  stepDescription?: string
) {
  const description = formattedStepDescription(stepIndex, stepCount, stepDescription)
  const errMsg = `An error occurred while running step ${chalk.white(description)}.\n`
  log.error(chalk.red(errMsg))
  log.debug("")
  for (const error of errors) {
    if (error instanceof WorkflowScriptError) {
      const scriptErrMsg = renderMessageWithDivider({
        prefix: `Script exited with code ${error.details.exitCode} ${renderDuration(log.getDuration())}`,
        msg: error.explain(),
        isError: true,
      })
      log.error(scriptErrMsg)
    } else {
      const taskDetailErrMsg = error.toString(true)
      log.debug(chalk.red(taskDetailErrMsg))
      log.error(error.explain() + "\n")
    }
  }
}

async function registerAndSetUid(garden: Garden, log: Log, config: WorkflowConfig) {
  const { cloudApi } = garden
  if (cloudApi) {
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
