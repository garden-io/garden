/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import cloneDeep from "fast-copy"
import { flatten, size } from "lodash-es"
import { printHeader } from "../logger/util.js"
import type { CommandParams, CommandResult } from "./base.js"
import { Command } from "./base.js"
import { dedent, naturalList } from "../util/string.js"
import type { Garden } from "../garden.js"
import type { WorkflowConfig, WorkflowFileSpec } from "../config/workflow.js"
import type { Log } from "../logger/log-entry.js"
import { RuntimeError, toGardenError } from "../exceptions.js"
import type { WorkflowStepResult } from "../config/template-contexts/workflow.js"
import { WorkflowConfigContext, WorkflowStepConfigContext } from "../config/template-contexts/workflow.js"
import { ConfigurationError, FilesystemError } from "../exceptions.js"
import { posix, join } from "path"
import fsExtra from "fs-extra"
import { toEnvVars } from "../util/util.js"
import { registerWorkflowRun } from "../cloud/api-legacy/workflow-lifecycle.js"
import { StringParameter } from "../cli/params.js"
import { styles } from "../logger/styles.js"
import { deepEvaluate } from "../template/evaluate.js"
import { throwOnMissingSecretKeys } from "../config/secrets.js"
import { RemoteSourceConfigContext } from "../config/template-contexts/project.js"
import {
  executeSteps,
  getStepEndEvent,
  logStepErrors,
  printStepDuration,
  printStepHeader,
  shouldBeDropped,
  type StepSpec,
  type RunStepParams,
  type RunStepLogParams,
  type StepErrors,
  runStepCommand,
  runStepScript,
  formattedStepDescription,
  formattedStepNumber,
} from "./helpers/steps.js"

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
  override streamLogEntriesV2 = true

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

    const steps: StepSpec[] = workflow.steps
    const startedAt = new Date().valueOf()

    const stepsResult = await executeSteps({
      steps,
      garden,
      cli,
      log: outerLog,
      inheritedOpts: cloneDeep(opts),
      createStepContext: ({ stepName, allStepNames, resolvedSteps }) => {
        return new WorkflowStepConfigContext({
          allStepNames,
          garden,
          resolvedSteps: resolvedSteps as { [name: string]: WorkflowStepResult },
          stepName,
          workflow,
        })
      },
      callbacks: {
        getStepMetadata: (index) => {
          const metadata = { workflowStep: { index } }
          garden.log.info({ metadata })
          return metadata
        },
        onStepSkipped: (index) => {
          garden.events.emit("workflowStepSkipped", { index })
        },
        onStepProcessing: (index) => {
          garden.events.emit("workflowStepProcessing", { index })
        },
        onStepComplete: (index, stepStartedAt) => {
          garden.events.emit("workflowStepComplete", getStepEndEvent(index, stepStartedAt))
        },
        onStepError: (index, stepStartedAt) => {
          garden.events.emit("workflowStepError", getStepEndEvent(index, stepStartedAt))
        },
      },
    })

    const result: WorkflowRunOutput = {
      steps: stepsResult.steps as { [stepName: string]: WorkflowStepResult },
    }

    if (size(stepsResult.errors) > 0) {
      printResult({ startedAt, log: outerLog, workflow, success: false })
      garden.events.emit("workflowError", {})
      const errors = flatten(Object.values(stepsResult.errors))
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

// Re-export shared step helpers for backward compatibility
export {
  shouldBeDropped,
  logStepErrors as logErrors,
  printStepHeader,
  printStepDuration,
  formattedStepDescription,
  formattedStepNumber,
  runStepCommand,
  runStepScript,
  type RunStepParams,
  type RunStepLogParams,
  type StepErrors,
}
