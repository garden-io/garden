/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { joi } from "../../config/common"
import { createGardenPlugin } from "../../plugin/plugin"
import { dedent } from "../../util/string"
import { runScript } from "../../util/util"
import { RuntimeError } from "../../exceptions"
import { GenericProviderConfig, Provider, providerConfigBaseSchema } from "../../config/provider"
import { ExecaError } from "execa"
import chalk from "chalk"
import { renderMessageWithDivider } from "../../logger/util"
import {
  ExecBuild,
  execBuildActionSchema,
  execDeployActionSchema,
  execRunActionSchema,
  ExecRun,
  ExecTest,
  execTestActionSchema,
  execOutputsSchema,
} from "./config"
import { configureExecModule, execModuleSpecSchema } from "./moduleConfig"
import { BuildActionHandler, RunActionHandler, TestActionHandler } from "../../plugin/action-types"
import { runResultToActionState } from "../../actions/base"
import { BuildStatus } from "../../plugin/handlers/Build/get-status"
import { convertExecModule } from "./convert"
import { copyArtifacts, execRun } from "./common"
import { deployExec, deleteExecDeploy, getExecDeployLogs, getExecDeployStatus } from "./deploy"

export interface ExecProviderConfig extends GenericProviderConfig {}

export type ExecProvider = Provider<ExecProviderConfig>

export const buildExecAction: BuildActionHandler<"build", ExecBuild> = async ({ action, log, ctx }) => {
  const output: BuildStatus = { state: "ready", outputs: {}, detail: {} }
  const command = action.getSpec("command")

  if (command?.length) {
    const result = await execRun({ command, action, ctx, log })

    if (!output.detail) {
      output.detail = {}
    }

    output.detail.fresh = true
    output.detail.buildLog = result.all || result.stdout + result.stderr
  }

  if (output.detail?.buildLog) {
    output.outputs.log = output.detail?.buildLog

    const prefix = `Finished building ${chalk.white(action.name)}. Here is the full output:`
    log.verbose(
      renderMessageWithDivider({
        prefix,
        msg: output.detail?.buildLog,
        isError: false,
        color: chalk.gray,
      })
    )
  }

  return output
}

export const execTestAction: TestActionHandler<"run", ExecTest> = async ({ log, action, artifactsPath, ctx }) => {
  const startedAt = new Date()
  const { command, env } = action.getSpec()

  const result = await execRun({ command, action, ctx, log, env, opts: { reject: false } })

  const artifacts = action.getSpec("artifacts")
  await copyArtifacts(log, artifacts, action.getBuildPath(), artifactsPath)

  const outputLog = result.all?.trim() || ""
  if (outputLog) {
    const prefix = `Finished executing ${chalk.white(action.key())}. Here is the full output:`
    log.verbose(
      renderMessageWithDivider({
        prefix,
        msg: outputLog,
        isError: false,
        color: chalk.gray,
      })
    )
  }

  const detail = {
    moduleName: action.moduleName(),
    command,
    testName: action.name,
    version: action.versionString(),
    success: result.exitCode === 0,
    startedAt,
    completedAt: new Date(),
    log: outputLog,
  }

  return {
    state: runResultToActionState(detail),
    detail,
    outputs: {
      log: outputLog,
    },
  }
}

export const execRunAction: RunActionHandler<"run", ExecRun> = async ({ artifactsPath, log, action, ctx }) => {
  const { command, env, artifacts } = action.getSpec()
  const startedAt = new Date()

  let completedAt: Date
  let outputLog: string
  let success = true

  if (command && command.length) {
    const commandResult = await execRun({ command, action, ctx, log, env, opts: { reject: false } })

    completedAt = new Date()
    outputLog = commandResult.all?.trim() || ""
    success = commandResult.exitCode === 0
  } else {
    completedAt = startedAt
    outputLog = ""
  }

  if (outputLog) {
    const prefix = `Finished running task ${chalk.white(action.name)}. Here is the full output:`
    log.verbose(
      renderMessageWithDivider({
        prefix,
        msg: outputLog,
        isError: false,
        color: chalk.gray,
      })
    )
  }

  await copyArtifacts(log, artifacts, action.getBuildPath(), artifactsPath)

  const detail = {
    moduleName: action.moduleName(),
    taskName: action.name,
    command,
    version: action.versionString(),
    success,
    log: outputLog,
    outputs: {
      log: outputLog,
    },
    startedAt,
    completedAt,
  }

  return {
    state: runResultToActionState(detail),
    detail,
    outputs: {
      log: outputLog,
    },
  }
}

export const execPlugin = () =>
  createGardenPlugin({
    name: "exec",
    docs: dedent`
      A simple provider that allows running arbitrary scripts when initializing providers, and provides the exec
      action type.

      _Note: This provider is always loaded when running Garden. You only need to explicitly declare it in your provider
      configuration if you want to configure a script for it to run._
    `,
    configSchema: providerConfigBaseSchema().keys({
      initScript: joi.string().description(dedent`
        An optional script to run in the project root when initializing providers. This is handy for running an arbitrary
        script when initializing. For example, another provider might declare a dependency on this provider, to ensure
        this script runs before resolving that provider.
      `),
    }),
    outputsSchema: joi.object().keys({
      initScript: execOutputsSchema(),
    }),
    createActionTypes: {
      Build: [
        {
          name: "exec",
          docs: dedent`
            A simple Build action which runs a build locally with a shell command.
          `,
          schema: execBuildActionSchema(),
          runtimeOutputsSchema: execOutputsSchema(),
          handlers: {
            build: buildExecAction,
          },
        },
      ],
      Deploy: [
        {
          name: "exec",
          docs: dedent`
            Run and manage a persistent process or service with shell commands.
          `,
          schema: execDeployActionSchema(),
          runtimeOutputsSchema: execOutputsSchema(),
          handlers: {
            async configure({ config }) {
              return { config, supportedModes: { sync: !!config.spec.persistent } }
            },

            deploy: deployExec,
            delete: deleteExecDeploy,
            getLogs: getExecDeployLogs,
            getStatus: getExecDeployStatus,
          },
        },
      ],
      Run: [
        {
          name: "exec",
          docs: dedent`
            A simple Run action which runs a command locally with a shell command.
          `,
          schema: execRunActionSchema(),
          runtimeOutputsSchema: execOutputsSchema(),
          handlers: {
            run: execRunAction,
          },
        },
      ],
      Test: [
        {
          name: "exec",
          docs: dedent`
            A simple Test action which runs a command locally with a shell command.
          `,
          schema: execTestActionSchema(),
          runtimeOutputsSchema: execOutputsSchema(),
          handlers: {
            run: execTestAction,
          },
        },
      ],
    },
    createModuleTypes: [
      {
        name: "exec",
        docs: dedent`
          A general-purpose module for executing commands in your shell. This can be a useful escape hatch if no other module type fits your needs, and you just need to execute something (as opposed to deploy it, track its status etc.).

          By default, the \`exec\` module type executes the commands in the Garden build directory
          (under .garden/build/<module-name>). By setting \`local: true\`, the commands are executed in the module
          source directory instead.

          Note that Garden does not sync the source code for local exec modules into the Garden build directory.
          This means that include/exclude filters and ignore files are not applied to local exec modules, as the
          filtering is done during the sync.
        `,
        needsBuild: true,
        moduleOutputsSchema: joi.object().keys({}),
        schema: execModuleSpecSchema(),
        handlers: {
          configure: configureExecModule,
          convert: convertExecModule,
        },
      },
    ],
    handlers: {
      async getEnvironmentStatus({ ctx }) {
        // Return ready if there is no initScript to run
        return { ready: !ctx.provider.config.initScript, outputs: {} }
      },
      async prepareEnvironment({ ctx, log }) {
        const execLog = log.createLog({ name: "exec" })
        if (ctx.provider.config.initScript) {
          try {
            execLog.info("Running init script")
            const result = await runScript({
              log: execLog,
              cwd: ctx.projectRoot,
              script: ctx.provider.config.initScript,
            })
            return { status: { ready: true, outputs: { initScript: { log: result.stdout.trim() } } } }
          } catch (_err) {
            const error = _err as ExecaError

            // Unexpected error (failed to execute script, as opposed to script returning an error code)
            if (!error.exitCode) {
              throw error
            }

            throw new RuntimeError(`exec provider init script exited with code ${error.exitCode}`, {
              exitCode: error.exitCode,
              stdout: error.stdout,
              stderr: error.stderr,
            })
          }
        }
        return { status: { ready: true, outputs: {} } }
      },
    },
  })

export const gardenPlugin = execPlugin
