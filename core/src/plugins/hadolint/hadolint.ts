/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { join, resolve } from "path"
import { pathExists, readFile } from "fs-extra"
import { providerConfigBaseSchema, GenericProviderConfig, Provider } from "../../config/provider"
import { joi } from "../../config/common"
import { dedent, splitLines, naturalList } from "../../util/string"
import { STATIC_DIR } from "../../constants"
import { padStart, padEnd } from "lodash"
import chalk from "chalk"
import { ConfigurationError } from "../../exceptions"
import { defaultDockerfileName } from "../container/config"
import { baseBuildSpecSchema } from "../../config/module"
import { getGitHubUrl } from "../../docs/common"
import { createGardenPlugin } from "../../plugin/plugin"
import { TestAction, TestActionConfig } from "../../actions/test"
import { TestActionDefinition } from "../../plugin/action-types"
import { mayContainTemplateString } from "../../template-string/template-string"

const defaultConfigPath = join(STATIC_DIR, "hadolint", "default.hadolint.yaml")
const configFilename = ".hadolint.yaml"

interface HadolintProviderConfig extends GenericProviderConfig {
  autoInject: boolean
  testFailureThreshold: "error" | "warning" | "none"
}

interface HadolintProvider extends Provider<HadolintProviderConfig> {}

const configSchema = providerConfigBaseSchema()
  .keys({
    autoInject: joi
      .boolean()
      .default(true)
      .description(
        dedent`
          By default, the provider automatically creates a \`hadolint\` module for every \`container\` module in your
          project. Set this to \`false\` to disable this behavior.
        `
      ),
    testFailureThreshold: joi
      .string()
      .allow("error", "warning", "none")
      .default("error")
      .description(
        dedent`
          Set this to \`"warning"\` if you'd like tests to be marked as failed if one or more warnings are returned.
          Set to \`"none"\` to always mark the tests as successful.
        `
      ),
  })
  .unknown(false)

interface HadolinTestSpec {
  dockerfilePath: string
}

type HadolintTestConfig = TestActionConfig<"hadolint", HadolinTestSpec>
type HadolintTest = TestAction<HadolintTestConfig, {}>

const gitHubUrl = getGitHubUrl("examples/hadolint")

export const gardenPlugin = () =>
  createGardenPlugin({
    name: "hadolint",
    dependencies: [{ name: "container" }],
    docs: dedent`
    This provider creates a [\`hadolint\`](../action-types/Test/hadolint.md) Test action type, and (by default) generates one such action for each \`container\` module that contains a Dockerfile in your project. Each module creates a single test that runs [hadolint](https://github.com/hadolint/hadolint) against the Dockerfile in question, in order to ensure that the Dockerfile is valid and follows best practices.

    To configure \`hadolint\`, you can use \`.hadolint.yaml\` config files. For each test, we first look for one in the relevant module root. If none is found there, we check the project root, and if none is there we fall back to default configuration. Note that for reasons of portability, we do not fall back to global/user configuration files.

    See the [hadolint docs](https://github.com/hadolint/hadolint#configure) for details on how to configure it, and the [hadolint example project](${gitHubUrl}) for a usage example.
  `,
    configSchema,
    handlers: {
      augmentGraph: async ({ ctx, actions }) => {
        const provider = ctx.provider as HadolintProvider

        if (!provider.config.autoInject) {
          return {}
        }

        const allTestNames = new Set(actions.filter((a) => a.kind === "Test").map((m) => m.name))

        const existingHadolintDockerfiles = actions
          // Can't really reason about templated dockerfile spec field
          .filter((a) => a.isCompatible("hadolint") && !mayContainTemplateString(a.getConfig("spec").dockerfile))
          .map((a) => resolve(a.basePath(), a.getConfig("spec").dockerfile))

        return {
          addActions: await Bluebird.filter(actions, async (action) => {
            const dockerfile = action.getConfig("spec").dockerfile

            // Make sure we don't step on an existing custom hadolint module
            if (
              !mayContainTemplateString(dockerfile) &&
              existingHadolintDockerfiles.includes(resolve(action.basePath(), dockerfile))
            ) {
              return false
            }

            return (
              // Pick all container or container-based modules
              action.kind === "Build" && action.isCompatible("container")
            )
          }).map((action) => {
            const baseName = "hadolint-" + action.name

            let name = baseName
            let i = 2

            while (allTestNames.has(name)) {
              name = `${baseName}-${i++}`
            }

            allTestNames.add(name)

            const dockerfilePath = action.getConfig("spec").dockerfile || defaultDockerfileName

            const include = mayContainTemplateString(dockerfilePath) ? undefined : [dockerfilePath]

            return {
              kind: "Test",
              type: "hadolint",
              name,
              description: `hadolint test for '${action.longDescription}' (auto-generated)`,
              include,
              internal: {
                basePath: action.basePath(),
              },
              spec: {
                dockerfilePath,
              },
            }
          }),
        }
      },
    },
    createActionTypes: {
      Test: [
        <TestActionDefinition<HadolintTest>>{
          name: "hadolint",
          docs: dedent`
          Runs \`hadolint\` on the specified Dockerfile.

          > Note: In most cases, you'll let the [provider](../../providers/hadolint.md) create this module type automatically, but you may in some cases want or need to manually specify a Dockerfile to lint.

          To configure \`hadolint\`, you can use \`.hadolint.yaml\` config files. For each test, we first look for one in the action source directory. If none is found there, we check the project root, and if none is there we fall back to   configuration. Note that for reasons of portability, we do not fall back to global/user configuration files.

          See the [hadolint docs](https://github.com/hadolint/hadolint#configure) for details on how to configure it.
          `,
          schema: joi.object().keys({
            dockerfilePath: joi
              .posixPath()
              .relativeOnly()
              .subPathOnly()
              .required()
              .description("POSIX-style path to a Dockerfile that you want to lint with `hadolint`."),
          }),
          handlers: {
            configure: async ({ ctx, config }) => {
              let dockerfilePath = config.spec.dockerfilePath

              if (!config.include) {
                config.include = []
              }

              if (!config.include.includes(dockerfilePath)) {
                try {
                  dockerfilePath = ctx.resolveTemplateStrings(dockerfilePath)
                } catch (error) {
                  throw new ConfigurationError(
                    `The spec.dockerfilePath field contains a template string which could not be resolved. Note that some template variables are not available for the field. Error: ${error}`,
                    { config, error }
                  )
                }
                config.include.push(dockerfilePath)
              }

              return { config }
            },

            run: async ({ ctx, log, action }) => {
              const spec = action.getSpec()
              const dockerfilePath = join(module.path, spec.dockerfilePath)
              const startedAt = new Date()
              let dockerfile: string

              try {
                dockerfile = (await readFile(dockerfilePath)).toString()
              } catch {
                throw new ConfigurationError(`hadolint: Could not find Dockerfile at ${spec.dockerfilePath}`, {
                  modulePath: module.path,
                  ...spec,
                })
              }

              let configPath: string
              const moduleConfigPath = join(module.path, configFilename)
              const projectConfigPath = join(ctx.projectRoot, configFilename)

              if (await pathExists(moduleConfigPath)) {
                // Prefer configuration from the module root
                configPath = moduleConfigPath
              } else if (await pathExists(projectConfigPath)) {
                // 2nd preference is configuration in project root
                configPath = projectConfigPath
              } else {
                // Fall back to empty default config
                configPath = defaultConfigPath
              }

              const args = ["--config", configPath, "--format", "json", dockerfilePath]
              const result = await ctx.tools["hadolint.hadolint"].exec({ log, args, ignoreError: true })

              let success = true

              const parsed = JSON.parse(result.stdout)
              const errors = parsed.filter((p: any) => p.level === "error")
              const warnings = parsed.filter((p: any) => p.level === "warning")
              const provider = ctx.provider as HadolintProvider

              const resultCategories: string[] = []
              let formattedResult = "OK"

              if (errors.length > 0) {
                resultCategories.push(`${errors.length} error(s)`)
              }

              if (warnings.length > 0) {
                resultCategories.push(`${warnings.length} warning(s)`)
              }

              let formattedHeader = `hadolint reported ${naturalList(resultCategories)}`

              if (parsed.length > 0) {
                const dockerfileLines = splitLines(dockerfile)

                formattedResult =
                  `${formattedHeader}:\n\n` +
                  parsed
                    .map((msg: any) => {
                      const color = msg.level === "error" ? chalk.bold.red : chalk.bold.yellow
                      const rawLine = dockerfileLines[msg.line - 1]
                      const linePrefix = padEnd(`${msg.line}:`, 5, " ")
                      const columnCursorPosition = (msg.column || 1) + linePrefix.length

                      return dedent`
                      ${color(msg.code + ":")} ${chalk.bold(msg.message || "")}
                      ${linePrefix}${chalk.gray(rawLine)}
                      ${chalk.gray(padStart("^", columnCursorPosition, "-"))}
                    `
                    })
                    .join("\n")
              }

              const threshold = provider.config.testFailureThreshold

              if (warnings.length > 0 && threshold === "warning") {
                success = false
              } else if (errors.length > 0 && threshold !== "none") {
                success = false
              } else if (warnings.length > 0) {
                log.warn(chalk.yellow(formattedHeader))
              }

              return {
                state: "ready",
                detail: {
                  testName: action.name,
                  moduleName: action.moduleName(),
                  command: ["hadolint", ...args],
                  version: action.versionString(),
                  success,
                  startedAt,
                  completedAt: new Date(),
                  log: formattedResult,
                },
                outputs: {},
              }
            },
          },
        },
      ],
    },
    createModuleTypes: [
      {
        name: "hadolint",
        docs: dedent`
        Runs \`hadolint\` on the specified Dockerfile.

        > Note: In most cases, you'll let the [provider](../providers/hadolint.md) create this module type automatically, but you may in some cases want or need to manually specify a Dockerfile to lint.

        To configure \`hadolint\`, you can use \`.hadolint.yaml\` config files. For each test, we first look for one in
        the module root. If none is found there, we check the project root, and if none is there we fall back to default
        configuration. Note that for reasons of portability, we do not fall back to global/user configuration files.

        See the [hadolint docs](https://github.com/hadolint/hadolint#configure) for details on how to configure it.
      `,
        needsBuild: false,
        schema: joi.object().keys({
          build: baseBuildSpecSchema(),
          dockerfilePath: joi
            .posixPath()
            .relativeOnly()
            .subPathOnly()
            .required()
            .description("POSIX-style path to a Dockerfile that you want to lint with `hadolint`."),
        }),
        handlers: {
          configure: async ({ moduleConfig }) => {
            moduleConfig.include = [moduleConfig.spec.dockerfilePath]
            return { moduleConfig }
          },

          convert: async (params) => {
            const { module } = params

            return {
              actions: [
                {
                  kind: "Test",
                  type: "hadolint",
                  name: module.name,

                  ...params.baseFields,
                  configFilePath: module.configPath,

                  include: [module.spec.dockerfilePath],

                  timeout: 10,
                  spec: {
                    dockerfilePath: module.spec.dockerfilePath,
                  },
                },
              ],
            }
          },
        },
      },
    ],
    tools: [
      {
        name: "hadolint",
        description: "A Dockerfile linter.",
        type: "binary",
        _includeInGardenImage: false,
        builds: [
          // this version has no arm support yet. If you add a later release, please add the "arm64" architecture.
          {
            platform: "darwin",
            architecture: "amd64",
            url: "https://github.com/hadolint/hadolint/releases/download/v1.17.2/hadolint-Darwin-x86_64",
            sha256: "da3bd1fae47f1ba4c4bca6a86d2c70bdbd6705308bd300d1f897c162bc32189a",
          },
          {
            platform: "linux",
            architecture: "amd64",
            url: "https://github.com/hadolint/hadolint/releases/download/v1.17.2/hadolint-Linux-x86_64",
            sha256: "b23e4d0e8964774cc0f4dd7ff81f1d05b5d7538b0b80dae5235b1239ab60749d",
          },
          {
            platform: "windows",
            architecture: "amd64",
            url: "https://github.com/hadolint/hadolint/releases/download/v1.17.2/hadolint-Windows-x86_64.exe",
            sha256: "8ba81d1fe79b91afb7ee16ac4e9fc6635646c2f770071d1ba924a8d26debe298",
          },
        ],
      },
    ],
  })
