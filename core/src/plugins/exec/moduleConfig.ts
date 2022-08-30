/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * PLEASE DO NOT UPDATE THESE SCHEMAS UNLESS ABSOLUTELY NECESSARY, AND IF YOU DO, MAKE SURE
 * CHANGES ARE REFLECTED IN THE CORRESPONDING ACTION SPECS + CONVERSION HANDLER.
 */

import { joiArray, joiEnvVars, joi, joiSparseArray } from "../../config/common"
import { ArtifactSpec } from "../../config/validation"
import { GardenModule } from "../../types/module"
import { baseServiceSpecSchema, CommonServiceSpec } from "../../config/service"
import { BaseTestSpec, baseTestSpecSchema } from "../../config/test"
import { ModuleSpec, BaseBuildSpec, baseBuildSpecSchema, ModuleConfig } from "../../config/module"
import { BaseTaskSpec, baseTaskSpecSchema } from "../../config/task"
import { dedent } from "../../util/string"
import { artifactsSchema, ExecDevModeSpec } from "./config"
import { ConfigureModuleParams, ConfigureModuleResult } from "../../plugin/handlers/module/configure"
import { ConfigurationError } from "../../exceptions"
import { omit } from "lodash"

const execPathDoc = dedent`
  By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
  If the top level \`local\` directive is set to \`true\`, the command runs in the module source directory instead.
`
const localProcDefaultTimeoutSec = 10

export async function configureExecModule({
  moduleConfig,
}: ConfigureModuleParams<ExecModule>): Promise<ConfigureModuleResult> {
  const buildDeps = moduleConfig.build.dependencies
  if (moduleConfig.spec.local && buildDeps.some((d) => d.copy.length > 0)) {
    const buildDependenciesWithCopySpec = buildDeps
      .filter((d) => !!d.copy)
      .map((d) => d.name)
      .join(", ")
    throw new ConfigurationError(
      dedent`
      Invalid exec module configuration: Module ${moduleConfig.name} copies ${buildDependenciesWithCopySpec}

      A local exec module cannot have a build dependency with a copy spec.
    `,
      {
        buildDependenciesWithCopySpec,
        buildConfig: moduleConfig.build,
      }
    )
  }

  // All the config keys that affect the build version
  moduleConfig.buildConfig = omit(moduleConfig.spec, ["tasks", "tests", "services"])

  moduleConfig.serviceConfigs = moduleConfig.spec.services.map((s) => ({
    name: s.name,
    dependencies: s.dependencies,
    disabled: s.disabled,
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
  devMode?: ExecDevModeSpec
  timeout?: number
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
              The command to run to deploy the service in dev mode. When in dev mode, Garden assumes that
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
              Optionally set a command to check the status of the service in dev mode. Garden will run the status command
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

export const execTaskSpecSchema = () =>
  baseTaskSpecSchema()
    .keys({
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
    })
    .description("A task that can be run in this module.")

interface ExecBuildSpec extends BaseBuildSpec {
  command: string[]
}

export interface ExecModuleSpecBase extends ModuleSpec {
  build: ExecBuildSpec
  env: { [key: string]: string }
  services: ExecServiceSpec[]
  tasks: ExecTaskSpec[]
  tests: ExecTestSpec[]
}

export interface ExecModuleSpec extends ExecModuleSpecBase {
  local?: boolean
}

export type ExecModuleConfig = ModuleConfig<ExecModuleSpec, any, ExecTestSpec, ExecTaskSpec>

export const execBuildSpecSchema = () =>
  baseBuildSpecSchema().keys({
    command: joiArray(joi.string())
      .description(
        dedent`
        The command to run to perform the build.

        ${execPathDoc}
      `
      )
      .example(["npm", "run", "build"]),
  })

export const execModuleSpecSchema = () =>
  joi
    .object()
    .keys({
      local: joi
        .boolean()
        .description(
          dedent`
          If set to true, Garden will run the build command, services, tests, and tasks in the module source directory,
          instead of in the Garden build directory (under .garden/build/<module-name>).

          Garden will therefore not stage the build for local exec modules. This means that include/exclude filters
          and ignore files are not applied to local exec modules.
          `
        )
        .default(false),
      build: execBuildSpecSchema(),
      env: joiEnvVars(),
      services: joiSparseArray(execServiceSchema()).description("A list of services to deploy from this module."),
      tasks: joiSparseArray(execTaskSpecSchema()).description("A list of tasks that can be run in this module."),
      tests: joiSparseArray(execTestSchema()).description("A list of tests to run in the module."),
    })
    .unknown(false)
    .description("The module specification for an exec module.")

export interface ExecModule extends GardenModule<ExecModuleSpec, ExecServiceSpec, ExecTestSpec, ExecTaskSpec> {}
