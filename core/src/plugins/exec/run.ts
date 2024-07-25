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

export const execRun = execProvider.createActionType({
  kind: "Run",
  name: "exec",
  docs: sdk.util.dedent`
    A simple Run action which runs a command locally with a shell command.
  `,
  specSchema: execRunSpecSchema,
  staticOutputsSchema: execStaticOutputsSchema,
  runtimeOutputsSchema: execRuntimeOutputsSchema,
})

export type ExecRunConfig = GardenSdkActionDefinitionConfigType<typeof execRun>
export type ExecRun = GardenSdkActionDefinitionActionType<typeof execRun>

execRun.addHandler("run", async ({ artifactsPath, log, action, ctx }) => {
  const startedAt = new Date()
  const { command, env, artifacts } = action.getSpec()

  const commandResult = await execRunCommand({ command, action, ctx, log, env, opts: { reject: false } })

  const detail = {
    moduleName: action.moduleName(),
    taskName: action.name,
    command,
    version: action.versionString(),
    success: commandResult.success,
    log: commandResult.outputLog,
    startedAt,
    completedAt: commandResult.completedAt,
  }

  const result = {
    state: runResultToActionState(detail),
    detail,
    outputs: {
      log: commandResult.outputLog,
    },
  } as const

  if (!commandResult.success) {
    return result
  }

  if (commandResult.outputLog) {
    const prefix = `Finished executing ${styles.highlight(action.key())}. Here is the full output:`
    log.info(
      renderMessageWithDivider({
        prefix,
        msg: commandResult.outputLog,
        isError: !commandResult.success,
        color: styles.primary,
      })
    )
  }

  await copyArtifacts(log, artifacts, action.getBuildPath(), artifactsPath)

  return result
})
