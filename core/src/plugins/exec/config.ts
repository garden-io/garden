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

export const execPathDoc = dedent`
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
`)

export const execRunSpecSchema = execCommonSchema.extend({
  artifacts: artifactsSchema.optional(),
  command: s
    .array(s.string())
    .describe(
      sdk.util.dedent`
        The command to run.

        ${execPathDoc}
      `
    )
    .example(["npm", "run", "build"]),
  statusCommand: execStatusCommandSchema.optional(),
  env: s.envVars().default({}).describe(execEnvVarDoc),
})

export type ExecActionConfig = ExecBuildConfig | ExecDeployConfig | ExecTestConfig | ExecRunConfig
export type ExecAction = ExecBuild | ExecDeploy | ExecTest | ExecRun
export type ResolvedExecAction = Resolved<ExecAction>
