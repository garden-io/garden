/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { renderMessageWithDivider } from "../../logger/util.js"
import type {
  GardenSdkActionDefinitionActionType,
  GardenSdkActionDefinitionConfigType,
  BuildStatus,
} from "../../plugin/sdk.js"
import { sdk } from "../../plugin/sdk.js"
import { styles } from "../../logger/styles.js"
import { execRunCommand, isExpectedStatusCommandError } from "./common.js"
import {
  execCommonSchema,
  execEnvVarDoc,
  execRuntimeOutputsSchema,
  execStaticOutputsSchema,
  execStatusCommandSchema,
} from "./config.js"
import { execProvider } from "./exec.js"
import { ACTION_RUNTIME_LOCAL } from "../../plugin/base.js"

const s = sdk.schema

export const execBuildSpecSchema = execCommonSchema.extend({
  command: s
    .array(s.string())
    .default([])
    .describe(
      sdk.util.dedent`
        The command to run to perform the build.

        _Note: You may omit this if all you need is for other implicit actions to happen, like copying files from build dependencies etc._

        By default, the command is run inside the Garden build directory (under .garden/build/<build-name>). If the top level \`buildAtSource\` directive is set to \`true\`, the command runs in the action source directory instead. Please see the docs for that field for more information and potential implications. Also note that other \`exec\` actions that reference this build via the \`build\` field will then also run from this action's source directory.
      `
    )
    .example(["npm", "run", "build"]),
  statusCommand: execStatusCommandSchema.optional(),
  env: s.envVars().default({}).describe(execEnvVarDoc),
})

export const execBuild = execProvider.createActionType({
  kind: "Build",
  name: "exec",
  docs: sdk.util.dedent`
    A simple Build action which runs a build locally with a shell command.
  `,
  specSchema: execBuildSpecSchema,
  staticOutputsSchema: execStaticOutputsSchema,
  runtimeOutputsSchema: execRuntimeOutputsSchema,
})

export type ExecBuildConfig = GardenSdkActionDefinitionConfigType<typeof execBuild>
export type ExecBuild = GardenSdkActionDefinitionActionType<typeof execBuild>

export const execBuildHandler = execBuild.addHandler("build", async ({ action, log, ctx }) => {
  const output: BuildStatus = {
    state: "ready",
    outputs: {},
    detail: {
      runtime: ACTION_RUNTIME_LOCAL,
    },
  }
  const command = action.getSpec("command")

  let success = true

  if (command?.length) {
    const result = await execRunCommand({ command, action, ctx, log })

    if (!output.detail) {
      output.detail = {
        runtime: ACTION_RUNTIME_LOCAL,
      }
    }

    output.detail.fresh = true
    output.detail.buildLog = result.outputLog
    success = result.success
    output.outputs = result.outputs
  }

  if (output.detail?.buildLog) {
    output.outputs.log = output.detail?.buildLog

    const prefix = `Finished building ${styles.highlight(action.name)}. Here is the full output:`
    log.info(
      renderMessageWithDivider({
        prefix,
        msg: output.detail?.buildLog,
        isError: !success,
        color: styles.primary,
      })
    )
  }

  return { ...output, state: success ? "ready" : "failed" }
})

execBuild.addHandler("getStatus", async ({ action, log, ctx }) => {
  const statusCommand = action.getSpec().statusCommand
  if (!statusCommand || statusCommand.length === 0) {
    return { state: "unknown", detail: { runtime: ACTION_RUNTIME_LOCAL }, outputs: {} }
  }

  try {
    const result = await execRunCommand({ command: statusCommand, action, ctx, log })

    return {
      state: "ready" as const,
      detail: { runtime: ACTION_RUNTIME_LOCAL, buildLog: result.outputLog },
      outputs: result.outputs,
    }
  } catch (err) {
    if (!isExpectedStatusCommandError(err)) {
      throw err
    }

    return {
      state: "not-ready" as const,
      detail: { runtime: ACTION_RUNTIME_LOCAL, buildLog: err.message },
      outputs: {},
    }
  }
})
