/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { cloneDeep, isEqual, merge, repeat, take } from "lodash"
import { printHeader, getTerminalWidth, formatGardenError } from "../../logger/util"
import { StringParameter, Command, CommandParams, CommandResult, parseCliArgs } from "../base"
import { dedent, wordWrap, deline } from "../../util/string"
import { Garden } from "../../garden"
import { getStepCommandConfigs, WorkflowStepSpec, WorkflowConfig, WorkflowFileSpec } from "../../config/workflow"
import { LogEntry } from "../../logger/log-entry"
import { GardenError, GardenBaseError } from "../../exceptions"
import { WorkflowConfigContext, WorkflowStepConfigContext, WorkflowStepResult } from "../../config/config-context"
import { resolveTemplateStrings, resolveTemplateString } from "../../template-string"
import { ConfigurationError, FilesystemError } from "../../exceptions"
import { posix, join } from "path"
import { ensureDir, writeFile } from "fs-extra"
import Bluebird from "bluebird"
import { getDurationMsec } from "../../util/util"
import { runScript } from "../../util/util"
import { ExecaError } from "execa"
import { LogLevel } from "../../logger/log-node"

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
  hidden = true

  description = dedent`
    Runs the commands defined in the workflow's steps, in sequence.

    Examples:

        garden run workflow my-workflow    # run my-workflow
  `

  arguments = runWorkflowArgs

  async action({
    garden,
    log,
    headerLog,
    args,
    opts,
  }: CommandParams<Args, {}>): Promise<CommandResult<WorkflowRunOutput>> {
    const outerLog = log.placeholder()
    // Partially resolve the workflow config, and prepare any configured files before continuing
    const rawWorkflow = garden.getRawWorkflowConfig(args.workflow)
    const templateContext = new WorkflowConfigContext(garden)
    const files = resolveTemplateStrings(rawWorkflow.files || [], templateContext)

    // Write all the configured files for the workflow
    await Bluebird.map(files, (file) => writeWorkflowFile(garden, file))

    // Fully resolve the config
    // (aside from the step script and command fields, since they need to be resolved just-in-time)
    const workflow = await garden.getWorkflowConfig(args.workflow)
    const steps = workflow.steps
    const allStepNames = steps.map((s, i) => getStepName(i, s.name))

    printHeader(headerLog, `Running workflow ${chalk.white(workflow.name)}`, "runner")

    const stepCommandConfigs = getStepCommandConfigs()
    const startedAt = new Date().valueOf()

    const result: WorkflowRunOutput = {
      steps: {},
    }

    for (const [index, step] of steps.entries()) {
      printStepHeader(outerLog, index, steps.length, step.description)

      const stepName = getStepName(index, step.name)

      const metadata = {
        workflowStep: { index },
      }
      const stepHeaderLog = outerLog.placeholder({ indent: 1, metadata })
      const stepBodyLog = outerLog.placeholder({ indent: 1, metadata })
      const stepFooterLog = outerLog.placeholder({ indent: 1, metadata })
      garden.log.setState({ metadata })
      let stepResult: CommandResult
      const inheritedOpts = cloneDeep(opts)

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

          stepResult = await runStepCommand({
            step,
            inheritedOpts,
            garden,
            headerLog: stepHeaderLog,
            log: stepBodyLog,
            footerLog: stepFooterLog,
            stepCommandConfigs,
          })
        } else if (step.script) {
          step.script = resolveTemplateString(step.script, stepTemplateContext)

          stepResult = await runStepScript({
            step,
            inheritedOpts,
            garden,
            headerLog: stepHeaderLog,
            log: stepBodyLog,
            footerLog: stepFooterLog,
          })
        } else {
          garden.events.emit("workflowStepError", getStepEndEvent(index, stepStartedAt))
          throw new ConfigurationError(`Workflow steps must specify either a command or a script.`, { step })
        }
      } catch (err) {
        garden.events.emit("workflowStepError", getStepEndEvent(index, stepStartedAt))
        printStepDuration({
          log: outerLog,
          stepIndex: index,
          stepCount: steps.length,
          durationSecs: stepBodyLog.getDuration(),
          success: false,
        })
        printResult({ startedAt, log: outerLog, workflow, success: false })

        logErrors(outerLog, [err], index, steps.length, step.description)
        return { result, errors: [err] }
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
        return { result, errors: stepResult.errors }
      }

      garden.events.emit("workflowStepComplete", getStepEndEvent(index, stepStartedAt))
      printStepDuration({
        log: outerLog,
        stepIndex: index,
        stepCount: steps.length,
        durationSecs: stepBodyLog.getDuration(),
        success: true,
      })
    }

    printResult({ startedAt, log: outerLog, workflow, success: true })

    return { result }
  }
}

export interface RunStepParams {
  garden: Garden
  log: LogEntry
  headerLog: LogEntry
  footerLog: LogEntry
  inheritedOpts: any
  step: WorkflowStepSpec
}

export interface RunStepCommandParams extends RunStepParams {
  stepCommandConfigs: any
}

function getStepName(index: number, name?: string) {
  return name || `step-${index + 1}`
}

export function printStepHeader(log: LogEntry, stepIndex: number, stepCount: number, stepDescription?: string) {
  const maxWidth = Math.min(getTerminalWidth(), 120)
  let text = `Running step ${formattedStepDescription(stepIndex, stepCount, stepDescription)}`
  const header = dedent`
    ${chalk.cyan.bold(wordWrap(text, maxWidth))}
    ${getSeparatorBar(maxWidth)}
  `
  log.info(header)
}

function getSeparatorBar(width: number) {
  return chalk.white(repeat("═", width))
}

export function printStepDuration({
  log,
  stepIndex,
  stepCount,
  durationSecs,
  success,
}: {
  log: LogEntry
  stepIndex: number
  stepCount: number
  durationSecs: number
  success: boolean
}) {
  const result = success ? chalk.green("completed") : chalk.red("failed")

  const text = deline`
    Step ${formattedStepNumber(stepIndex, stepCount)} ${chalk.bold(result)} in
    ${chalk.white(durationSecs)} Sec
  `
  const maxWidth = Math.min(getTerminalWidth(), 120)

  log.info(`${getSeparatorBar(maxWidth)}\n${chalk.cyan.bold(text)}\n\n`)
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
  log.info("")
}

export async function runStepCommand({
  garden,
  log,
  footerLog,
  headerLog,
  inheritedOpts,
  stepCommandConfigs,
  step,
}: RunStepCommandParams): Promise<CommandResult<any>> {
  const config = stepCommandConfigs.find((c) => isEqual(c.prefix, take(step.command!, c.prefix.length)))
  const rest = step.command!.slice(config.prefix.length) // arguments + options
  const { args, opts } = parseCliArgs(rest, config.args, config.opts)
  const command: Command = new config.cmdClass()
  const result = await command.action({
    garden,
    log,
    footerLog,
    headerLog,
    args,
    opts: merge(inheritedOpts, opts),
  })
  return result
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

    Aborting all subsequent steps.

    See the log output below for additional details.
  `
  log.error("")
  log.error(chalk.red(errMsg))
  for (const error of errors) {
    log.error("")
    log.error(formatGardenError(error))
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

class WorkflowScriptError extends GardenBaseError {
  type = "workflow-script"
}

export async function runStepScript({ garden, log, step }: RunStepParams): Promise<CommandResult<any>> {
  try {
    await runScript(log, garden.projectRoot, step.script!)
    return { result: {} }
  } catch (_err) {
    const error = _err as ExecaError

    // Unexpected error (failed to execute script, as opposed to script returning an error code)
    if (!error.exitCode) {
      throw error
    }

    throw new WorkflowScriptError(`Script exited with code ${error.exitCode}`, {
      exitCode: error.exitCode,
      stdout: error.stdout,
      stderr: error.stderr,
    })
  }
}

function getStepEndEvent(index: number, startedAt: Date) {
  return { index, durationMsec: getDurationMsec(startedAt, new Date()) }
}
