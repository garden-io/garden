/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
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
import { execRunCommand } from "./common.js"
import { execCommonSchema, execEnvVarDoc, execRuntimeOutputsSchema, execStaticOutputsSchema } from "./config.js"
import { execProvider } from "./exec.js"
import { ACTION_RUNTIME_LOCAL } from "../../plugin/base.js"
import { getProjectApiVersion } from "../../project-api-version.js"
import { emitNonRepeatableWarning } from "../../warnings.js"
import { deline } from "../../util/string.js"
import { actionReferenceToString } from "../../actions/base.js"
import { reportDefaultConfigValueChange } from "../../util/deprecations.js"
import { GardenApiVersion } from "../../constants.js"
import type { BuildActionConfig } from "../../actions/build.js"
import type { Log } from "../../logger/log-entry.js"

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

function setDefaultBuildAtSource(config: BuildActionConfig, log: Log) {
  const projectApiVersion = getProjectApiVersion()
  const buildAtSource = config.buildAtSource
  if (buildAtSource !== undefined) {
    return
  }

  emitNonRepeatableWarning(
    log,
    deline`Action ${styles.highlight(actionReferenceToString(config))}
        of type ${styles.highlight(config.type)}
        defined in ${styles.highlight(config.internal.configFilePath || config.internal.basePath)}
        relies on the default value of ${styles.highlight("buildAtSource")}.`
  )
  reportDefaultConfigValueChange({ apiVersion: projectApiVersion, log, deprecation: "buildAtSource" })

  // Enable `buildAtSource` by default for exec Build actions when use `apiVersion: garden.io/v2`
  const defaultValue = projectApiVersion === GardenApiVersion.v2
  config.buildAtSource = defaultValue
}

execBuild.addHandler("configure", async ({ config, log }) => {
  setDefaultBuildAtSource(config, log)
  return { config, supportedModes: { sync: false } }
})

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
