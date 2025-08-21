/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Resolved } from "../../actions/types.js"
import { artifactsTargetDescription } from "../../config/common.js"
import { dedent } from "../../util/string.js"
import { sdk } from "../../plugin/sdk.js"
import type { ExecBuild, ExecBuildConfig } from "./build.js"
import type { ExecTest, ExecTestConfig } from "./test.js"
import type { ExecRun, ExecRunConfig } from "./run.js"
import type { ExecDeploy, ExecDeployConfig } from "./deploy.js"

const s = sdk.schema

export const execCommonCommandDoc = dedent`
  **Action outputs**

  Exec actions can write outputs to a JSON file or a directory. The action command is provided with the path to the outputs directory or JSON file via the \`GARDEN_ACTION_OUTPUTS_PATH\` or \`GARDEN_ACTION_OUTPUTS_JSON_PATH\` environment variables.

  If you write a JSON file to \`<GARDEN_ACTION_OUTPUTS_JSON_PATH>\` this file will be read and its contents will be used as the action outputs. Nested JSON objects are not supported. Only the top-level key-value pairs, where values are primitive types (string, number, boolean, null), will be used.

  You can also write outputs to files in the directory. In this scenario, each file with a valid identifier as a filename (this excludes paths starting with \`.\` for example) in the directory will be read and its filename will be added as the key in the action outputs, with the contents of the file as the value. Sub-directories are not supported and will be ignored. For example, if you write some string to \`<GARDEN_ACTION_OUTPUTS_PATH>/my-output\`, the action outputs will contain a \`my-output\` key with the value \`<contents of my-output.txt>\`.

  It is allowed to mix and match between the two approaches. In that scenario the JSON file will be read first, and any additional valid filenames in the directory will be added as additional action outputs, overriding keys in the JSON file if they overlap.

  Note that if you provide a \`statusCommand\`, the outputs will also be read from the directory after the status command is run. You'll need to ensure that the outputs are consistent between the status command and the command that is run, to avoid unexpected results.

  **Build field**

  Note that if a Build is referenced in the \`build\` field, the command will be run from the build directory for that Build action. If that Build has \`buildAtSource: true\` set, the command will be run from the source directory of the Build action. If no \`build\` reference is set, the command is run from the source directory of this action.
`
export const execEnvVarDoc = "Environment variables to set when running the command."
export const defaultStatusTimeout = 10

export const execStaticOutputsSchema = s.object({})
export const execRuntimeOutputsSchema = s.object({
  log: s
    .string()
    .default("")
    .describe(
      "The full log output from the executed command. (Pro-tip: Make it machine readable so it can be parsed by dependants)"
    ),
  stdout: s
    .string()
    .default("")
    .describe(
      "The stdout log output from the executed command. (Pro-tip: Make it machine readable so it can be parsed by dependants)"
    ),
  stderr: s
    .string()
    .default("")
    .describe(
      "The stderr log output from the executed command. (Pro-tip: Make it machine readable so it can be parsed by dependants)"
    ),
})

export const execCommonSchema = s.object({
  shell: s.boolean().optional().describe(dedent`
    If \`true\`, runs file inside of a shell. Uses \`/bin/sh\` on UNIX and \`cmd.exe\` on Windows. A different shell can be specified as a string. The shell should understand the \`-c\` switch on UNIX or \`/d /s /c\` on Windows.

    Note that if this is not set, no shell interpreter (Bash, \`cmd.exe\`, etc.) is used, so shell features such as variables substitution (\`echo $PATH\`) are not allowed.

    We recommend against using this option since it is:

    - not cross-platform, encouraging shell-specific syntax.
    - slower, because of the additional shell interpretation.
    - unsafe, potentially allowing command injection.
  `),
})

// DEPLOY //

export interface ExecSyncModeSpec {
  command: string[]
  timeout: number
  statusCommand?: string[]
}

const artifactSchema = s.object({
  source: s
    .posixPath({ allowGlobs: true, relativeOnly: true, subPathOnly: true })
    .describe("A POSIX-style path or glob to copy, relative to the build root."),
  target: s.posixPath({ relativeOnly: true, subPathOnly: true }).default(".").describe(artifactsTargetDescription),
})

export const artifactsSchema = s
  .sparseArray(artifactSchema)
  .default([])
  .describe("A list of artifacts to copy after the run.")

export const execStatusCommandSchema = s.array(s.string()).describe(sdk.util.dedent`
  The command to run to check the status of the action.

  If this is specified, it is run before the action's \`command\`. If the status command runs successfully and returns exit code of 0, the action is considered already complete and the \`command\` is not run. To indicate that the action is not complete, the status command should return a non-zero exit code.

  If this is not specified, the status is always reported as "unknown", so specifying this can be useful to avoid running the action unnecessarily.

  Action outputs are also read from the directory after the status command is run (if the status is "ready"). If your action command writes outputs when run, you'll need to ensure that the outputs are consistent between the status command and the main command, to avoid unexpected results.
`)

export const execRunSpecSchema = execCommonSchema.extend({
  artifacts: artifactsSchema.optional(),
  command: s
    .array(s.string())
    .describe(
      sdk.util.dedent`
        The command to run.

        ${execCommonCommandDoc}
      `
    )
    .example(["npm", "run", "build"]),
  statusCommand: execStatusCommandSchema.optional(),
  env: s.envVars().default({}).describe(execEnvVarDoc),
})

export type ExecActionConfig = ExecBuildConfig | ExecDeployConfig | ExecTestConfig | ExecRunConfig
export type ExecAction = ExecBuild | ExecDeploy | ExecTest | ExecRun
export type ResolvedExecAction = Resolved<ExecAction>
