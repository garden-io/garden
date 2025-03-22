/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join, resolve } from "path"
import fsExtra from "fs-extra"
import { joi } from "../../config/common.js"
import { dedent, splitLines, naturalList } from "../../util/string.js"
import { STATIC_DIR } from "../../constants.js"
import { padStart, padEnd } from "lodash-es"
import { ConfigurationError, GardenError } from "../../exceptions.js"
import { defaultDockerfileName } from "../container/config.js"
import { baseBuildSpecSchema } from "../../config/module.js"
import { getGitHubUrl } from "../../docs/common.js"
import type { TestAction, TestActionConfig } from "../../actions/test.js"
import { isUnresolved } from "../../template/templated-strings.js"
import type { BaseAction } from "../../actions/base.js"
import type { BuildAction } from "../../actions/build.js"
import { sdk } from "../../plugin/sdk.js"
import { styles } from "../../logger/styles.js"
import { reportDeprecatedFeatureUsage } from "../../util/deprecations.js"

const { pathExists, readFile } = fsExtra

const defaultConfigPath = join(STATIC_DIR, "hadolint", "default.hadolint.yaml")
const configFilename = ".hadolint.yaml"

interface HadolintTestSpec {
  dockerfilePath: string
}

type HadolintTestConfig = TestActionConfig<"hadolint", HadolintTestSpec>
type HadolintTest = TestAction<HadolintTestConfig, {}>

const isHadolintTest = (action: BaseAction): action is HadolintTest =>
  action.kind === "Test" && action.isCompatible("hadolint")

const gitHubUrl = getGitHubUrl("examples/hadolint")

const defaultHadolintTimeoutSec = 10

export const gardenPlugin = sdk.createGardenPlugin({
  name: "hadolint",
  dependencies: [{ name: "container" }],
  docs: dedent`
      This provider creates a [\`hadolint\`](../action-types/Test/hadolint.md) Test action type, and (by default) generates one such action for each \`container\` Build that contains a Dockerfile in your project. Each Test runs [hadolint](https://github.com/hadolint/hadolint) against the Dockerfile in question, in order to ensure that the Dockerfile is valid and follows best practices.

      To configure \`hadolint\`, you can use \`.hadolint.yaml\` config files. For each Test, we first look for one in the relevant action's root. If none is found there, we check the project root, and if none is there we fall back to default configuration. Note that for reasons of portability, we do not fall back to global/user configuration files.

      See the [hadolint docs](https://github.com/hadolint/hadolint#configure) for details on how to configure it, and the [hadolint example project](${gitHubUrl}) for a usage example.
    `,

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

          const action: HadolintTestConfig = {
            kind: "Test",
            type: "hadolint",
            name: module.name,

            ...params.baseFields,

            include: [module.spec.dockerfilePath],

            timeout: defaultHadolintTimeoutSec,

            spec: {
              dockerfilePath: module.spec.dockerfilePath,
            },
          }
          action.internal.configFilePath = module.configPath

          return { actions: [action] }
        },
      },
    },
  ],
})

const s = sdk.schema

const hadolintVersion = "2.12.0"
gardenPlugin.addTool({
  name: "hadolint",
  version: hadolintVersion,
  description: `A Dockerfile linter, v${hadolintVersion}`,
  type: "binary",
  _includeInGardenImage: false,
  builds: [
    // this version has no arm support yet. If you add a later release, please add the "arm64" architecture.
    {
      platform: "darwin",
      architecture: "amd64",
      url: `https://github.com/hadolint/hadolint/releases/download/v${hadolintVersion}/hadolint-Darwin-x86_64`,
      sha256: "2a5b7afcab91645c39a7cebefcd835b865f7488e69be24567f433dfc3d41cd27",
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: `https://github.com/hadolint/hadolint/releases/download/v${hadolintVersion}/hadolint-Linux-x86_64`,
      sha256: "56de6d5e5ec427e17b74fa48d51271c7fc0d61244bf5c90e828aab8362d55010",
    },
    {
      platform: "linux",
      architecture: "arm64",
      url: `https://github.com/hadolint/hadolint/releases/download/v${hadolintVersion}/hadolint-Linux-arm64`,
      sha256: "5798551bf19f33951881f15eb238f90aef023f11e7ec7e9f4c37961cb87c5df6",
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: `https://github.com/hadolint/hadolint/releases/download/v${hadolintVersion}/hadolint-Windows-x86_64.exe`,
      sha256: "ed89a156290e15452276b2b4c84efa688a5183d3b578bfaec7cfdf986f0632a8",
    },
  ],
})

const providerConfigSchema = s.object({
  autoInject: s
    .boolean()
    .default(true)
    .describe(
      dedent`
      By default, the provider automatically creates a \`hadolint\` Test for every \`container\` Build in your
      project. Set this to \`false\` to disable this behavior.
      `
    ),
  testFailureThreshold: s
    .enum(["error", "warning", "none"])
    .default("error")
    .describe(
      dedent`
      Set this to \`"warning"\` if you'd like tests to be marked as failed if one or more warnings are returned.
      Set to \`"none"\` to always mark the tests as successful.
      `
    ),
})

export const provider = gardenPlugin.createProvider({ configSchema: providerConfigSchema, outputsSchema: s.object({}) })

provider.addHandler("augmentGraph", async ({ ctx, actions }) => {
  if (!ctx.provider.config.autoInject) {
    return {}
  }

  const allTestNames = new Set(actions.filter((a) => a.kind === "Test").map((m) => m.name))

  const existingHadolintDockerfiles = actions
    .filter(isHadolintTest)
    // Can't really reason about templated dockerfile spec field
    .filter((a) => !isUnresolved(a.getConfig("spec").dockerfilePath))
    .map((a) => resolve(a.sourcePath(), a.getConfig("spec").dockerfilePath))

  const pickCompatibleAction = (action: BaseAction): action is BuildAction | HadolintTest => {
    // Make sure we don't step on an existing custom hadolint module
    if (isHadolintTest(action)) {
      const dockerfilePath = action.getConfig("spec").dockerfilePath
      if (
        !isUnresolved(dockerfilePath) &&
        existingHadolintDockerfiles.includes(resolve(action.sourcePath(), dockerfilePath))
      ) {
        return false
      }
    }

    // Pick all container or container-based modules
    return action.kind === "Build" && action.isCompatible("container")
  }

  const makeHadolintTestAction = (action: BuildAction | HadolintTest): HadolintTestConfig => {
    const baseName = "hadolint-" + action.name

    let name = baseName
    let i = 2

    while (allTestNames.has(name)) {
      name = `${baseName}-${i++}`
    }

    allTestNames.add(name)

    const dockerfilePath =
      (isHadolintTest(action) ? action.getConfig("spec").dockerfilePath : action.getConfig("spec").dockerfile) ||
      defaultDockerfileName

    const include = isUnresolved(dockerfilePath) ? undefined : [dockerfilePath]

    return {
      kind: "Test",
      type: "hadolint",
      name,
      description: `hadolint test for '${action.longDescription()}' (auto-generated)`,
      include,
      internal: {
        basePath: action.sourcePath(),
      },
      timeout: action.getConfig().timeout,
      spec: {
        dockerfilePath,
      },
    }
  }

  return {
    addActions: actions.filter(pickCompatibleAction).map(makeHadolintTestAction),
  }
})

const hadolintTest = provider.createActionType({
  kind: "Test",
  name: "hadolint",
  docs: dedent`
    Runs \`hadolint\` on the specified Dockerfile.

    > Note: In most cases, you'll let the [provider](../../providers/hadolint.md) create this action type automatically, but you may in some cases want or need to manually specify a Dockerfile to lint.

    To configure \`hadolint\`, you can use \`.hadolint.yaml\` config files. For each test, we first look for one in the action source directory. If none is found there, we check the project root, and if none is there we fall back to   configuration. Note that for reasons of portability, we do not fall back to global/user configuration files.

    See the [hadolint docs](https://github.com/hadolint/hadolint#configure) for details on how to configure it.
  `,
  specSchema: s
    .object({
      dockerfilePath: s
        .posixPath({ relativeOnly: true, subPathOnly: true })
        .describe("POSIX-style path to a Dockerfile that you want to lint with `hadolint`."),
    })
    .required(),
  staticOutputsSchema: s.object({}),
  runtimeOutputsSchema: s.object({}),
})

hadolintTest.addHandler("configure", async ({ ctx, config, log }) => {
  reportDeprecatedFeatureUsage({
    log,
    deprecation: "hadolintPlugin",
  })

  let dockerfilePath = config.spec.dockerfilePath

  if (!config.include) {
    config.include = []
  }

  if (!config.include.includes(dockerfilePath)) {
    try {
      // @ts-expect-error todo: correct types for unresolved configs
      dockerfilePath = ctx.deepEvaluate(dockerfilePath)
    } catch (error) {
      if (!(error instanceof GardenError)) {
        throw error
      }
      throw new ConfigurationError({
        message: `The spec.dockerfilePath field contains a template string which could not be resolved. Note that some template variables are not available for the field. Error: ${error.message}`,
        wrappedErrors: [error],
      })
    }
    config.include.push(dockerfilePath)
  }

  return { config, supportedModes: {} }
})

hadolintTest.addHandler("run", async ({ ctx, log, action }) => {
  const spec = action.getSpec()
  const dockerfilePath = join(action.sourcePath(), spec.dockerfilePath)
  const startedAt = new Date()
  let dockerfile: string

  try {
    dockerfile = (await readFile(dockerfilePath)).toString()
  } catch {
    throw new ConfigurationError({
      message: `hadolint: Could not find Dockerfile at ${spec.dockerfilePath}. Action path: ${action.sourcePath()}`,
    })
  }

  let configPath: string
  const moduleConfigPath = join(action.sourcePath(), configFilename)
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

  const resultCategories: string[] = []
  let formattedResult = "OK"

  if (errors.length > 0) {
    resultCategories.push(`${errors.length} error(s)`)
  }

  if (warnings.length > 0) {
    resultCategories.push(`${warnings.length} warning(s)`)
  }

  const formattedHeader = `hadolint reported ${naturalList(resultCategories)}`

  if (parsed.length > 0) {
    const dockerfileLines = splitLines(dockerfile)

    formattedResult =
      `${formattedHeader}:\n\n` +
      parsed
        .map((msg: any) => {
          const color = msg.level === "error" ? styles.error.bold : styles.warning.bold
          const rawLine = dockerfileLines[msg.line - 1]
          const linePrefix = padEnd(`${msg.line}:`, 5, " ")
          const columnCursorPosition = (msg.column || 1) + linePrefix.length

          return dedent`
          ${color(msg.code + ":")} ${styles.bold(msg.message || "")}
          ${linePrefix}${styles.primary(rawLine)}
          ${styles.primary(padStart("^", columnCursorPosition, "-"))}
        `
        })
        .join("\n")
  }

  const threshold = ctx.provider.config.testFailureThreshold

  if (warnings.length > 0 && threshold === "warning") {
    success = false
  } else if (errors.length > 0 && threshold !== "none") {
    success = false
  } else if (warnings.length > 0) {
    log.warn(formattedHeader)
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
})
