/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { BuildAction, BuildActionConfig } from "../../actions/build"
import { DeployAction, DeployActionConfig } from "../../actions/deploy"
import { RunAction, RunActionConfig } from "../../actions/run"
import { TestAction, TestActionConfig } from "../../actions/test"
import { artifactsTargetDescription, joi, joiEnvVars, joiSparseArray, StringMap } from "../../config/common"
import { ArtifactSpec } from "../../config/validation"
import { dedent } from "../../util/string"

const execPathDoc = dedent`
  Note that if a Build is referenced in the \`build\` field, the command will be run from the build directory for that Build action. If that Build has \`buildAtSource: true\` set, the command will be run from the source directory of the Build action. If no \`build\` reference is set, the command is run from the source directory of this action.
`
const localProcDefaultTimeoutSec = 10

// BUILD //

export interface ExecBuildActionSpec {
  command?: string[]
  timeout?: number
  env: StringMap
}
export type ExecBuildConfig = BuildActionConfig<"exec", ExecBuildActionSpec>
export type ExecBuild = BuildAction<ExecBuildConfig, {}>

export const execBuildActionSchema = () =>
  joi.object().keys({
    command: joi
      .array()
      .items(joi.string())
      .description(
        dedent`
        The command to run to perform the build.

        _Note: You may omit this if all you need is for other implicit actions to happen, like copying files from build dependencies, generating files specified with \`generateFiles\` etc._

        By default, the command is run inside the Garden build directory (under .garden/build/<build-name>). If the top level \`buildAtSource\` directive is set to \`true\`, the command runs in the action source directory instead. Please see the docs for that field for more information and potential implications. Also note that other \`exec\` actions that reference this build via the \`build\` field will then also run from this action's source directory.
      `
      )
      .example(["npm", "run", "build"]),
    env: joiEnvVars(),
  })

// DEPLOY //

export interface ExecDevModeSpec {
  command: string[]
  timeout: number
  statusCommand?: string[]
}

export interface ExecDeployActionSpec {
  cleanupCommand?: string[]
  deployCommand: string[]
  statusCommand?: string[]
  devMode?: ExecDevModeSpec
  timeout?: number
  env: StringMap
}

export type ExecDeployConfig = DeployActionConfig<"exec", ExecDeployActionSpec>
export type ExecDeploy = DeployAction<ExecDeployConfig, {}>

export const execDeployCommandSchema = () =>
  joi
    .sparseArray()
    .items(joi.string().allow(""))
    .description(
      dedent`
      The command to run to perform the deployment.

      ${execPathDoc}
      `
    )

export const execDeployActionSchema = () =>
  joi
    .object()
    .keys({
      deployCommand: execDeployCommandSchema().required(),
      statusCommand: joi
        .sparseArray()
        .items(joi.string().allow(""))
        .description(
          dedent`
          Optionally set a command to check the status of the deployment. If this is specified, it is run before the \`deployCommand\`. If the command runs successfully and returns exit code of 0, the deployment is considered already deployed and the \`deployCommand\` is not run.

          If this is not specified, the deployment is always reported as "unknown", so it's highly recommended to specify this command if possible.

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
      // TODO: Set a default in v0.13.
      timeout: joi.number().description(dedent`
        The maximum duration (in seconds) to wait for a local script to exit.
      `),
      env: joiEnvVars().description("Environment variables to set when running the deploy and status commands."),
      devMode: joi.object().keys({
        command: joi
          .sparseArray()
          .items(joi.string().allow(""))
          .description(
            dedent`
              The command to run to deploy in dev mode. When in dev mode, Garden assumes that the command starts a persistent process and does not wait for it return. The logs from the process can be retrieved via the \`garden logs\` command as usual.

              If a \`statusCommand\` is set, Garden will wait until it returns a zero exit code before considering the deployment ready. Otherwise it considers it immediately ready.

              ${execPathDoc}
            `
          ),
        statusCommand: joi
          .sparseArray()
          .items(joi.string().allow(""))
          .description(
            dedent`
              Optionally set a command to check the status of the deployment in dev mode. Garden will run the status command at an interval until it returns a zero exit code or times out.

              If no \`statusCommand\` is set, Garden will consider the deploy ready as soon as it has started the process.

              ${execPathDoc}
              `
          ),
        timeout: joi.number().default(localProcDefaultTimeoutSec).description(dedent`
          The maximum duration (in seconds) to wait for a for the \`statusCommand\` to return a zero exit code. Ignored if no \`statusCommand\` is set.
        `),
      }),
    })
    .description("Deploy using shell commands.")
    .meta({ name: "exec.Deploy" })

// RUN //

export interface ExecRunActionSpec {
  artifacts?: ArtifactSpec[]
  command: string[]
  env: StringMap
}

export type ExecRunConfig = RunActionConfig<"exec", ExecRunActionSpec>
export type ExecRun = RunAction<ExecRunConfig>

export const execRunActionSchema = () =>
  joi
    .object()
    .keys({
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
    })
    .description("A shell command Run.")

// TEST //

export interface ExecTestActionSpec extends ExecRunActionSpec {}
export type ExecTestConfig = TestActionConfig<"exec", ExecTestActionSpec>
export type ExecTest = TestAction<ExecTestConfig, {}>

export const execTestActionSchema = () =>
  joi
    .object()
    .keys({
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
    })
    .description("A shell command Test.")

// MISC //

export type ExecActionConfig = ExecBuildConfig | ExecDeployConfig | ExecTestConfig | ExecRunConfig

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

export const artifactsSchema = () => joiSparseArray(artifactSchema())
