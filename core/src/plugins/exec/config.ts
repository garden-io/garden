/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { memoize } from "lodash"
import { BuildAction, BuildActionConfig } from "../../actions/build"
import { DeployAction, DeployActionConfig } from "../../actions/deploy"
import { RunAction, RunActionConfig } from "../../actions/run"
import { TestAction, TestActionConfig } from "../../actions/test"
import { Resolved } from "../../actions/types"
import {
  artifactsTargetDescription,
  createSchema,
  joi,
  joiEnvVars,
  joiSparseArray,
  StringMap,
} from "../../config/common"
import { ArtifactSpec } from "../../config/validation"
import { dedent } from "../../util/string"

const execPathDoc = dedent`
  Note that if a Build is referenced in the \`build\` field, the command will be run from the build directory for that Build action. If that Build has \`buildAtSource: true\` set, the command will be run from the source directory of the Build action. If no \`build\` reference is set, the command is run from the source directory of this action.
`
export const defaultStatusTimeout = 10

interface ExecOutputs {
  log: string
}

export const execOutputsSchema = createSchema({
  name: "exec-output",
  keys: () => ({
    log: joi
      .string()
      .allow("")
      .default("")
      .description(
        "The full log output from the executed command. (Pro-tip: Make it machine readable so it can be parsed by dependants)"
      ),
  }),
})

interface CommonKeys {
  shell?: boolean
}

const execCommonSchema = createSchema({
  name: "exec:common",
  keys: () => ({
    // Description adapted from https://github.com/sindresorhus/execa
    shell: joi.boolean().description(dedent`
    If \`true\`, runs file inside of a shell. Uses \`/bin/sh\` on UNIX and \`cmd.exe\` on Windows. A different shell can be specified as a string. The shell should understand the \`-c\` switch on UNIX or \`/d /s /c\` on Windows.

    Note that if this is not set, no shell interpreter (Bash, \`cmd.exe\`, etc.) is used, so shell features such as variables substitution (\`echo $PATH\`) are not allowed.

    We recommend against using this option since it is:

    - not cross-platform, encouraging shell-specific syntax.
    - slower, because of the additional shell interpretation.
    - unsafe, potentially allowing command injection.
  `),
  }),
})

// BUILD //

export interface ExecBuildActionSpec extends CommonKeys {
  command?: string[] // This needs to be optional to support "dummy" builds
  env: StringMap
}

export type ExecBuildConfig = BuildActionConfig<"exec", ExecBuildActionSpec>
export type ExecBuild = BuildAction<ExecBuildConfig, ExecOutputs>

export const execBuildActionSchema = createSchema({
  name: "exec:Build",
  extend: execCommonSchema,
  keys: () => ({
    command: joi
      .array()
      .items(joi.string())
      .description(
        dedent`
        The command to run to perform the build.

        _Note: You may omit this if all you need is for other implicit actions to happen, like copying files from build dependencies etc._

        By default, the command is run inside the Garden build directory (under .garden/build/<build-name>). If the top level \`buildAtSource\` directive is set to \`true\`, the command runs in the action source directory instead. Please see the docs for that field for more information and potential implications. Also note that other \`exec\` actions that reference this build via the \`build\` field will then also run from this action's source directory.
      `
      )
      .example(["npm", "run", "build"]),
    env: joiEnvVars(),
  }),
})

// DEPLOY //

export interface ExecSyncModeSpec {
  command: string[]
  timeout: number
  statusCommand?: string[]
}

export interface ExecDeployActionSpec extends CommonKeys {
  persistent?: boolean
  cleanupCommand?: string[]
  deployCommand: string[]
  statusCommand?: string[]
  statusTimeout: number
  env: StringMap
}

export type ExecDeployConfig = DeployActionConfig<"exec", ExecDeployActionSpec>
export type ExecDeploy = DeployAction<ExecDeployConfig, ExecOutputs>

export const execDeployCommandSchema = memoize(() =>
  joi
    .sparseArray()
    .items(joi.string().allow(""))
    .description(
      dedent`
      The command to run to perform the deployment.

      ${execPathDoc}
      `
    )
)

export const execDeployActionSchema = createSchema({
  name: "exec:Deploy",
  extend: execCommonSchema,
  keys: () => ({
    persistent: joi
      .boolean()
      .default(false)
      .description(
        dedent`
        Set this to true if the \`deployCommand\` is not expected to return, and should run until the Garden command is manually terminated.

        This replaces the previously supported \`devMode\` from \`exec\` actions.

        If this is set to true, it is highly recommended to also define \`statusCommand\` if possible. Otherwise the Deploy is considered to be immediately ready once the \`deployCommand\` is started.
        `
      ),
    deployCommand: execDeployCommandSchema().required(),
    statusCommand: joi
      .sparseArray()
      .items(joi.string().allow(""))
      .description(
        dedent`
        Optionally set a command to check the status of the deployment. If this is specified, it is run before the \`deployCommand\`. If the command runs successfully and returns exit code of 0, the deployment is considered already deployed and the \`deployCommand\` is not run.

        If this is not specified, the deployment is always reported as "unknown", so it's highly recommended to specify this command if possible.

        If \`persistent: true\`, Garden will run this command at an interval until it returns a zero exit code or times out.

        ${execPathDoc}
        `
      ),
    cleanupCommand: joi
      .sparseArray()
      .items(joi.string().allow(""))
      .description(
        dedent`
        Optionally set a command to clean the deployment up, e.g. when running \`garden delete env\`.

        ${execPathDoc}
        `
      ),
    statusTimeout: joi.number().default(defaultStatusTimeout).description(dedent`
      The maximum duration (in seconds) to wait for a for the \`statusCommand\` to return a zero exit code. Ignored if no \`statusCommand\` is set.
    `),
    env: joiEnvVars().description("Environment variables to set when running the deploy and status commands."),
  }),
})

// RUN //

export interface ExecRunActionSpec extends CommonKeys {
  artifacts?: ArtifactSpec[]
  command: string[]
  env: StringMap
}

export type ExecRunConfig = RunActionConfig<"exec", ExecRunActionSpec>
export type ExecRun = RunAction<ExecRunConfig, ExecOutputs>

export const execRunActionSchema = createSchema({
  name: "exec:Run",
  extend: execCommonSchema,
  keys: () => ({
    artifacts: artifactsSchema().description("A list of artifacts to copy after the run."),
    command: joi
      .sparseArray()
      .items(joi.string().allow(""))
      .description(
        dedent`
        The command to run.

        ${execPathDoc}
        `
      )
      .required(),
    env: joiEnvVars().description("Environment variables to set when running the command."),
  }),
})

// TEST //

export interface ExecTestActionSpec extends ExecRunActionSpec {}

export type ExecTestConfig = TestActionConfig<"exec", ExecTestActionSpec>
export type ExecTest = TestAction<ExecTestConfig, ExecOutputs>

export const execTestActionSchema = createSchema({
  name: "exec:Test",
  extend: execCommonSchema,
  keys: () => ({
    command: joi
      .sparseArray()
      .items(joi.string().allow(""))
      .description(
        dedent`
        The command to run to perform the test.

        ${execPathDoc}
        `
      )
      .required(),
    env: joiEnvVars().description("Environment variables to set when running the command."),
    artifacts: artifactsSchema().description("A list of artifacts to copy after the test run."),
  }),
})

// MISC //

export type ExecActionConfig = ExecBuildConfig | ExecDeployConfig | ExecTestConfig | ExecRunConfig
export type ExecAction = ExecBuild | ExecDeploy | ExecTest | ExecRun
export type ResolvedExecAction = Resolved<ExecAction>

const artifactSchema = () =>
  joi.object().keys({
    source: joi
      .posixPath()
      .allowGlobs()
      .relativeOnly()
      .subPathOnly()
      .required()
      .description("A POSIX-style path or glob to copy, relative to the build root."),
    target: joi.posixPath().relativeOnly().subPathOnly().default(".").description(artifactsTargetDescription),
  })

export const artifactsSchema = memoize(() => joiSparseArray(artifactSchema()))
