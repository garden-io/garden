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
import { WorkflowConfigContext } from "../../config/config-context"
import { resolveTemplateStrings } from "../../template-string"
import { ConfigurationError, FilesystemError } from "../../exceptions"
import { posix, join } from "path"
import { ensureDir, writeFile } from "fs-extra"
import Bluebird from "bluebird"
import { splitStream } from "../../util/util"
import execa, { ExecaError } from "execa"
import { LogLevel } from "../../logger/log-node"

const runWorkflowArgs = {
  workflow: new StringParameter({
    help: "The name of the workflow to be run.",
    required: true,
  }),
}

type Args = typeof runWorkflowArgs

interface WorkflowRunOutput {
  stepLogs: { [stepName: string]: string }
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
    // Partially resolve the workflow config, and prepare any configured files before continuing
    const rawWorkflow = garden.getRawWorkflowConfig(args.workflow)
    const templateContext = new WorkflowConfigContext(garden, {}, garden.variables, garden.secrets)
    const files = resolveTemplateStrings(rawWorkflow.files || [], templateContext)

    // Write all the configured files for the workflow
    await Bluebird.map(files, (file) => writeWorkflowFile(garden, file))

    // Fully resolve the config
    const workflow = await garden.getWorkflowConfig(args.workflow)
    const steps = workflow.steps

    printHeader(headerLog, `Running workflow ${chalk.white(workflow.name)}`, "runner")

    const stepCommandConfigs = getStepCommandConfigs()
    const startedAt = new Date().valueOf()

    const result = {
      stepLogs: {},
    }

    for (const [index, step] of steps.entries()) {
      printStepHeader(log, index, steps.length, step.description)

      const stepHeaderLog = log.placeholder({ indent: 1 })
      const stepBodyLog = log.placeholder({ indent: 1 })
      const stepFooterLog = log.placeholder({ indent: 1 })
      let commandResult: CommandResult
      const inheritedOpts = cloneDeep(opts)

      try {
        if (step.command) {
          commandResult = await runStepCommand({
            step,
            inheritedOpts,
            garden,
            headerLog: stepHeaderLog,
            log: stepBodyLog,
            footerLog: stepFooterLog,
            stepCommandConfigs,
          })
        } else if (step.script) {
          commandResult = await runStepScript({
            step,
            inheritedOpts,
            garden,
            headerLog: stepHeaderLog,
            log: stepBodyLog,
            footerLog: stepFooterLog,
          })
        } else {
          throw new ConfigurationError(`Workflow steps must specify either a command or a script.`, { step })
        }
      } catch (err) {
        printStepDuration({
          log,
          stepIndex: index,
          stepCount: steps.length,
          durationSecs: stepBodyLog.getDuration(),
          success: false,
        })
        printResult({ startedAt, log, workflow, success: false })

        logErrors(log, [err], index, steps.length, step.description)
        return { result, errors: [err] }
      }

      // Extract the text from the body log entry, info-level and higher
      result.stepLogs[index.toString()] = stepBodyLog.toString((entry) => entry.level <= LogLevel.info)

      if (commandResult.errors) {
        logErrors(log, commandResult.errors, index, steps.length, step.description)
        return { result, errors: commandResult.errors }
      }

      printStepDuration({
        log,
        stepIndex: index,
        stepCount: steps.length,
        durationSecs: stepBodyLog.getDuration(),
        success: true,
      })
    }

    printResult({ startedAt, log, workflow, success: true })

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

export function printStepHeader(log: LogEntry, stepIndex: number, stepCount: number, stepDescription?: string) {
  const maxWidth = Math.min(getTerminalWidth(), 120)
  let text = `Running step ${formattedStepDescription(stepIndex, stepCount, stepDescription)}`
  const bar = repeat("═", maxWidth)
  const header = chalk.cyan(dedent`
    \n${wordWrap(text, maxWidth)}
    ${bar}\n
  `)
  log.info(header)
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
  const bar = repeat("═", maxWidth)
  log.info(
    chalk.cyan(dedent`
      ${bar}
      ${text}
      \n\n
    `)
  )
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

  const resultColor = success ? chalk.magenta : chalk.red

  log.info("")
  log.info(resultColor(`Workflow ${chalk.white(workflow.name)} completed.`))
  log.info(chalk.magenta(`Total time elapsed: ${chalk.white(totalDuration)} Sec.`))
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
  // Run the script, capturing any errors
  const proc = execa("bash", ["-s"], {
    all: true,
    cwd: garden.projectRoot,
    // The script is piped to stdin
    input: step.script,
    // Set a very large max buffer (we only hold one of these at a time, and want to avoid overflow errors)
    buffer: true,
    maxBuffer: 100 * 1024 * 1024,
  })

  // Stream output to `log`, splitting by line
  const stdout = splitStream()
  const stderr = splitStream()

  stdout.on("error", () => {})
  stdout.on("data", (line: Buffer) => {
    log.info(line.toString())
  })
  stderr.on("error", () => {})
  stderr.on("data", (line: Buffer) => {
    log.info(line.toString())
  })

  proc.stdout!.pipe(stdout)
  proc.stderr!.pipe(stderr)

  try {
    await proc
    return {}
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
