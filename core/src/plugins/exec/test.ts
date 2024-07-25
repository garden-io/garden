/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { runResultToActionState } from "../../actions/base.js"
import { renderMessageWithDivider } from "../../logger/util.js"
import type { GardenSdkActionDefinitionActionType, GardenSdkActionDefinitionConfigType } from "../../plugin/sdk.js"
import { sdk } from "../../plugin/sdk.js"
import { styles } from "../../logger/styles.js"
import { copyArtifacts, execRunCommand } from "./common.js"
import { execRunSpecSchema, execRuntimeOutputsSchema, execStaticOutputsSchema } from "./config.js"
import { execProvider } from "./exec.js"

export const execTestSpecSchema = execRunSpecSchema

export const execTest = execProvider.createActionType({
  kind: "Test",
  name: "exec",
  docs: sdk.util.dedent`
    A simple Test action which runs a command locally with a shell command.
  `,
  specSchema: execRunSpecSchema,
  staticOutputsSchema: execStaticOutputsSchema,
  runtimeOutputsSchema: execRuntimeOutputsSchema,
})

export type ExecTestConfig = GardenSdkActionDefinitionConfigType<typeof execTest>
export type ExecTest = GardenSdkActionDefinitionActionType<typeof execTest>

execTest.addHandler("run", async ({ log, action, artifactsPath, ctx }) => {
  const startedAt = new Date()
  const { command, env } = action.getSpec()

  const execCommandOutputs = await execRunCommand({ command, action, ctx, log, env, opts: { reject: false } })

  const detail = {
    moduleName: action.moduleName(),
    command,
    testName: action.name,
    version: action.versionString(),
    success: execCommandOutputs.success,
    startedAt,
    completedAt: execCommandOutputs.completedAt,
    log: execCommandOutputs.outputLog,
  }

  if (!execCommandOutputs.success) {
    return {
      state: runResultToActionState(detail),
      detail,
      outputs: {
        log: execCommandOutputs.outputLog,
      },
    }
  }

  if (execCommandOutputs.outputLog) {
    const prefix = `Finished executing ${styles.highlight(action.key())}. Here is the full output:`
    log.info(
      renderMessageWithDivider({
        prefix,
        msg: execCommandOutputs.outputLog,
        isError: !execCommandOutputs.success,
        color: styles.primary,
      })
    )
  }

  const artifacts = action.getSpec("artifacts")
  await copyArtifacts(log, artifacts, action.getBuildPath(), artifactsPath)

  return {
    state: runResultToActionState(detail),
    detail,
    outputs: {
      log: execCommandOutputs.outputLog,
    },
  }
})
