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
import { getStepCommandConfigs } from "../../config/workflow"
import { LogEntry } from "../../logger/log-entry"
import { GardenError } from "../../exceptions"

const runWorkflowArgs = {
  workflow: new StringParameter({
    help: "The name of the workflow to be run.",
    required: true,
  }),
}

type Args = typeof runWorkflowArgs

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

  async action({ garden, log, headerLog, args, opts }: CommandParams<Args, {}>): Promise<CommandResult<null>> {
    const workflow = await garden.getWorkflowConfig(args.workflow)
    const steps = workflow.steps

    printHeader(headerLog, `Running workflow ${chalk.white(workflow.name)}`, "runner")

    const stepCommandConfigs = getStepCommandConfigs()
    const startedAt = new Date().valueOf()
    for (const [index, step] of steps.entries()) {
      printStepHeader(log, index, steps.length, step.description)
      const stepHeaderLog = log.placeholder({ indent: 1 })
      const stepBodyLog = log.placeholder({ indent: 1 })
      const stepFooterLog = log.placeholder({ indent: 1 })
      let result: CommandResult
      try {
        result = await runStepCommand({
          commandSpec: step.command,
          inheritedOpts: cloneDeep(opts),
          garden,
          headerLog: stepHeaderLog,
          log: stepBodyLog,
          footerLog: stepFooterLog,
          stepCommandConfigs,
        })
      } catch (err) {
        throw err
      }
      if (result.errors) {
        logErrors(log, result.errors, index, steps.length, step.description)
        return { errors: result.errors }
      }
      printStepDuration(log, index, steps.length, stepBodyLog.getDuration())
    }
    const completedAt = new Date().valueOf()
    const totalDuration = ((completedAt - startedAt) / 1000).toFixed(2)

    log.info("")
    log.info(chalk.magenta(`Workflow ${chalk.white(workflow.name)} completed.`))
    log.info(chalk.magenta(`Total time elapsed: ${chalk.white(totalDuration)} Sec.`))

    return {}
  }
}

export type RunStepCommandParams = {
  garden: Garden
  log: LogEntry
  headerLog: LogEntry
  footerLog: LogEntry
  inheritedOpts: any
  stepCommandConfigs: any
  commandSpec: string[]
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

export function printStepDuration(log: LogEntry, stepIndex: number, stepCount: number, durationSecs: number) {
  const text = deline`
    Step ${formattedStepNumber(stepIndex, stepCount)} ${chalk.green("completed")} in
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

export async function runStepCommand({
  garden,
  log,
  footerLog,
  headerLog,
  inheritedOpts,
  stepCommandConfigs,
  commandSpec,
}: RunStepCommandParams): Promise<CommandResult<any>> {
  const config = stepCommandConfigs.find((c) => isEqual(c.prefix, take(commandSpec, c.prefix.length)))
  const rest = commandSpec.slice(config.prefix.length) // arguments + options
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
