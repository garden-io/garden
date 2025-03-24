/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * PLEASE DO NOT UPDATE THESE SCHEMAS UNLESS ABSOLUTELY NECESSARY, AND IF YOU DO, MAKE SURE
 * CHANGES ARE REFLECTED IN THE CORRESPONDING ACTION SPECS + CONVERSION HANDLER.
 */

import {
  joiArray,
  joiEnvVars,
  joi,
  joiSparseArray,
  createSchema,
  artifactsTargetDescription,
} from "../../config/common.js"
import type { ArtifactSpec } from "../../config/validation.js"
import type { GardenModule } from "../../types/module.js"
import type { CommonServiceSpec } from "../../config/service.js"
import { baseServiceSpecSchema } from "../../config/service.js"
import type { BaseTestSpec } from "../../config/test.js"
import { baseTestSpecSchema } from "../../config/test.js"
import type { ModuleSpec, ModuleConfig } from "../../config/module.js"
import { baseBuildSpecSchema } from "../../config/module.js"
import type { BaseTaskSpec } from "../../config/task.js"
import { baseTaskSpecSchema } from "../../config/task.js"
import { dedent } from "../../util/string.js"
import type { ExecSyncModeSpec } from "./config.js"
import type { ConfigureModuleParams, ConfigureModuleResult } from "../../plugin/handlers/Module/configure.js"
import { memoize, omit } from "lodash-es"
import { DEFAULT_RUN_TIMEOUT_SEC } from "../../constants.js"

const execPathDoc = dedent`
  By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
  If the top level \`local\` directive is set to \`true\`, the command runs in the module source directory instead.
`
const localProcDefaultTimeoutSec = 10

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

const artifactsSchema = memoize(() => joiSparseArray(artifactSchema()))

export async function configureExecModule({
  moduleConfig,
}: ConfigureModuleParams<ExecModule>): Promise<ConfigureModuleResult> {
  // All the config keys that affect the build version
  moduleConfig.buildConfig = omit(moduleConfig.spec, ["tasks", "tests", "services"])

  moduleConfig.serviceConfigs = moduleConfig.spec.services.map((s) => ({
    name: s.name,
    dependencies: s.dependencies,
    disabled: s.disabled,
    timeout: s.timeout,
    spec: s,
  }))

  moduleConfig.taskConfigs = moduleConfig.spec.tasks.map((t) => ({
    name: t.name,
    cacheResult: false,
    dependencies: t.dependencies,
    disabled: t.disabled,
    timeout: t.timeout,
    spec: t,
  }))

  moduleConfig.testConfigs = moduleConfig.spec.tests.map((t) => ({
    name: t.name,
    dependencies: t.dependencies,
    disabled: t.disabled,
    spec: t,
    timeout: t.timeout,
  }))

  return { moduleConfig }
}

export interface ExecServiceSpec extends CommonServiceSpec {
  cleanupCommand?: string[]
  deployCommand: string[]
  statusCommand?: string[]
  syncMode?: ExecSyncModeSpec
  timeout: number
  env: { [key: string]: string }
}

export const execServiceSchema = () =>
  baseServiceSpecSchema()
    .keys({
      deployCommand: joi
        .sparseArray()
        .items(joi.string().allow(""))
        .description(
          dedent`
          The command to run to deploy the service.

          ${execPathDoc}
          `
        )
        .required(),
      statusCommand: joi
        .sparseArray()
        .items(joi.string().allow(""))
        .description(
          dedent`
          Optionally set a command to check the status of the service. If this is specified, it is run before the
          \`deployCommand\`. If the command runs successfully and returns exit code of 0, the service is considered
          already deployed and the \`deployCommand\` is not run.

          If this is not specified, the service is always reported as "unknown", so it's highly recommended to specify
          this command if possible.

          ${execPathDoc}
          `
        ),
      cleanupCommand: joi
        .sparseArray()
        .items(joi.string().allow(""))
        .description(
          dedent`
          Optionally set a command to clean the service up, e.g. when running \`garden delete env\`.

          ${execPathDoc}
          `
        ),
      timeout: joi.number().integer().min(1).default(DEFAULT_RUN_TIMEOUT_SEC).description(dedent`
        The maximum duration (in seconds) to wait for a local script to exit.
      `),
      env: joiEnvVars().description("Environment variables to set when running the deploy and status commands."),
      syncMode: joi.object().keys({
        command: joi
          .sparseArray()
          .items(joi.string().allow(""))
          .description(
            dedent`
              The command to run to deploy the service in sync mode. When in sync mode, Garden assumes that
              the command starts a persistent process and does not wait for it return. The logs from the process
              can be retrieved via the \`garden logs\` command as usual.

              If a \`statusCommand\` is set, Garden will wait until it returns a zero exit code before considering
              the service ready. Otherwise it considers the service immediately ready.

              ${execPathDoc}
            `
          ),
        statusCommand: joi
          .sparseArray()
          .items(joi.string().allow(""))
          .description(
            dedent`
              Optionally set a command to check the status of the service in sync mode. Garden will run the status command
              at an interval until it returns a zero exit code or times out.

              If no \`statusCommand\` is set, Garden will consider the service ready as soon as it has started the process.

              ${execPathDoc}
              `
          ),
        timeout: joi.number().default(localProcDefaultTimeoutSec).description(dedent`
          The maximum duration (in seconds) to wait for a for the \`statusCommand\` to return a zero
          exit code. Ignored if no \`statusCommand\` is set.
        `),
      }),
    })
    // TODO(deprecation): deprecate in 0.14 - the old devMode syntax must be deprecated
    .rename("devMode", "syncMode")
    .description("A service to deploy using shell commands.")

export interface ExecTestSpec extends BaseTestSpec {
  command: string[]
  env: { [key: string]: string }
  artifacts?: ArtifactSpec[]
}

export const execTestSchema = () =>
  baseTestSpecSchema()
    .keys({
      command: joi
        .sparseArray()
        .items(joi.string().allow(""))
        .description(
          dedent`
          The command to run to test the module.

          ${execPathDoc}
          `
        )
        .required(),
      env: joiEnvVars().description("Environment variables to set when running the command."),
      artifacts: artifactsSchema().description("A list of artifacts to copy after the test run."),
    })
    .description("The test specification of an exec module.")

export interface ExecTaskSpec extends BaseTaskSpec {
  artifacts?: ArtifactSpec[]
  command: string[]
  env: { [key: string]: string }
}

export const execTaskSpecSchema = createSchema({
  name: "exec:Task",
  description: "A task that can be run in this module.",
  extend: baseTaskSpecSchema,
  keys: () => ({
    artifacts: artifactsSchema().description("A list of artifacts to copy after the task run."),
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

interface ExecModuleBuildSpec {
  command: string[]
}

export interface ExecModuleSpec extends ModuleSpec {
  build: ExecModuleBuildSpec
  env: { [key: string]: string }
  services: ExecServiceSpec[]
  tasks: ExecTaskSpec[]
  tests: ExecTestSpec[]
}

export type ExecModuleConfig = ModuleConfig<ExecModuleSpec>

export const execModuleBuildSpecSchema = createSchema({
  name: "exec:Module:build-spec",
  extend: baseBuildSpecSchema,
  keys: () => ({
    command: joiArray(joi.string())
      .description(
        dedent`
        The command to run to perform the build.

        ${execPathDoc}
      `
      )
      .example(["npm", "run", "build"]),
  }),
})

export const execModuleSpecSchema = createSchema({
  name: "exec:Module",
  description: "The module specification for an exec module.",
  keys: () => ({
    build: execModuleBuildSpecSchema(),
    env: joiEnvVars(),
    services: joiSparseArray(execServiceSchema()).description("A list of services to deploy from this module."),
    tasks: joiSparseArray(execTaskSpecSchema()).description("A list of tasks that can be run in this module."),
    tests: joiSparseArray(execTestSchema()).description("A list of tests to run in the module."),
  }),
  allowUnknown: false,
})

export type ExecModule = GardenModule<ExecModuleSpec, ExecServiceSpec, ExecTestSpec, ExecTaskSpec>
