/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve, relative } from "path"
import chalk from "chalk"
import slash from "slash"
import { ExecaReturnValue } from "execa"
import { createGardenPlugin } from "@garden-io/sdk"
import { PluginContext, GardenModule, LogEntry } from "@garden-io/sdk/types"
import { dedent, naturalList } from "@garden-io/sdk/util/string"
import { matchGlobs, listDirectory } from "@garden-io/sdk/util/fs"

// TODO: gradually get rid of these core dependencies, move some to SDK etc.
import { providerConfigBaseSchema, GenericProviderConfig, Provider } from "@garden-io/core/build/src/config/provider"
import { joi, joiIdentifier, joiArray } from "@garden-io/core/build/src/config/common"
import { TestModuleParams } from "@garden-io/core/build/src/types/plugin/module/testModule"
import { baseBuildSpecSchema } from "@garden-io/core/build/src/config/module"
import { PluginError, ConfigurationError } from "@garden-io/core/build/src/exceptions"
import { getModuleTypeUrl, getGitHubUrl, getProviderUrl } from "@garden-io/core/build/src/docs/common"
import { renderTemplates } from "@garden-io/core/build/src/plugins/kubernetes/helm/common"
import { getK8sProvider } from "@garden-io/core/build/src/plugins/kubernetes/util"

export interface ConftestProviderConfig extends GenericProviderConfig {
  policyPath: string
  namespace?: string
  testFailureThreshold: "deny" | "warn" | "none"
}

export interface ConftestProvider extends Provider<ConftestProviderConfig> {}

export const configSchema = () => providerConfigBaseSchema()
  .keys({
    policyPath: joi
      .posixPath()
      .relativeOnly()
      .subPathOnly()
      .default("./policy")
      .description("Path to the default policy directory or rego file to use for `conftest` modules."),
    namespace: joi.string().description("Default policy namespace to use for `conftest` modules."),
    testFailureThreshold: joi
      .string()
      .allow("deny", "warn", "none")
      .default("error")
      .description(
        dedent`
          Set this to \`"warn"\` if you'd like tests to be marked as failed if one or more _warn_ rules are matched.
          Set to \`"none"\` to always mark the tests as successful.
        `
      ),
  })
  .unknown(false)

interface ConftestModuleSpec {
  policyPath: string
  namespace: string
  files: string[]
  sourceModule: string
  combine?: boolean
}

type ConftestModule = GardenModule<ConftestModuleSpec>

const moduleTypeUrl = getModuleTypeUrl("conftest")
const containerProviderUrl = getProviderUrl("conftest-container")
const kubernetesProviderUrl = getProviderUrl("conftest-kubernetes")
const gitHubUrl = getGitHubUrl("examples/conftest")

const commonModuleSchema = joi.object().keys({
  build: baseBuildSpecSchema(),
  sourceModule: joiIdentifier().description("Specify a module whose sources we want to test."),
  policyPath: joi
    .posixPath()
    .relativeOnly()
    .description(
      dedent`
        POSIX-style path to a directory containing the policies to match the config against, or a
        specific .rego file, relative to the module root.
        Must be a relative path, and should in most cases be within the project root.
        Defaults to the \`policyPath\` set in the provider config.
      `
    ),
  namespace: joi
    .string()
    .default("main")
    .description("The policy namespace in which to find _deny_ and _warn_ rules."),
  combine: joi
    .boolean()
    .default(false)
    .description("Set to true to use the conftest --combine flag"),
})

export const gardenPlugin = () => createGardenPlugin({
  name: "conftest",
  docs: dedent`
    This provider allows you to validate your configuration files against policies that you specify, using the [conftest tool](https://github.com/instrumenta/conftest) and Open Policy Agent rego query files. The provider creates a module type of the same name, which allows you to specify files to validate. Each module then creates a Garden test that becomes part of your Stack Graph.

    Note that, in many cases, you'll actually want to use more specific providers that can automatically configure your \`conftest\` modules, e.g. the [\`conftest-container\`](${containerProviderUrl}) and/or [\`conftest-kubernetes\`](${kubernetesProviderUrl}) providers. See the [conftest example project](${gitHubUrl}) for a simple usage example of the latter.

    If those don't match your needs, you can use this provider directly and manually configure your \`conftest\` modules. Simply add this provider to your project configuration, and see the [conftest module documentation](${moduleTypeUrl}) for a detailed reference. Also, check out the below reference for how to configure default policies, default namespaces, and test failure thresholds for all \`conftest\` modules.
  `,
  dependencies: [],
  configSchema: configSchema(),
  createModuleTypes: [
    {
      name: "conftest",
      docs: dedent`
        Creates a test that runs \`conftest\` on the specified files, with the specified (or default) policy and
        namespace.

        > Note: In many cases, you'll let specific conftest providers (e.g. [\`conftest-container\`](${containerProviderUrl}) and [\`conftest-kubernetes\`](${kubernetesProviderUrl}) create this module type automatically, but you may in some cases want or need to manually specify files to test.

        See the [conftest docs](https://github.com/instrumenta/conftest) for details on how to configure policies.
      `,
      schema: commonModuleSchema.keys({
        files: joi
          .array()
          .items(
            joi
              .posixPath()
              .subPathOnly()
              .relativeOnly()
              .allowGlobs()
          )
          .required()
          .description(
            dedent`
              A list of files to test with the given policy. Must be POSIX-style paths, and may include wildcards.
            `
          ),
      }),
      handlers: {
        configure: async ({ moduleConfig }) => {
          if (moduleConfig.spec.sourceModule) {
            moduleConfig.build.dependencies.push({ name: moduleConfig.spec.sourceModule, copy: [] })
          }

          moduleConfig.include = moduleConfig.spec.files
          moduleConfig.testConfigs = [{ name: "test", dependencies: [], spec: {}, disabled: false, timeout: 10 }]
          return { moduleConfig }
        },
        testModule: async ({ ctx, log, module, testConfig }: TestModuleParams<ConftestModule>) => {
          const startedAt = new Date()
          const provider = ctx.provider as ConftestProvider

          const buildPath = module.spec.sourceModule
            ? module.buildDependencies[module.spec.sourceModule].buildPath
            : module.buildPath
          const buildPathFiles = await listDirectory(buildPath)

          // TODO: throw if a specific file is listed under `module.spec.files` but isn't found?
          const files = matchGlobs(buildPathFiles, module.spec.files)

          if (files.length === 0) {
            return {
              testName: testConfig.name,
              moduleName: module.name,
              command: [],
              version: module.version.versionString,
              success: true,
              startedAt,
              completedAt: new Date(),
              log: "No files to test",
            }
          }

          const args = prepareArgs(ctx, provider, module)
          args.push(...files)

          const result = await ctx.tools["conftest.conftest"].exec({ log, args, ignoreError: true, cwd: buildPath })

          const { success, formattedResult } = parseConftestResult(provider, log, result)

          return {
            testName: testConfig.name,
            moduleName: module.name,
            command: ["conftest", ...args],
            version: module.version.versionString,
            success,
            startedAt,
            completedAt: new Date(),
            log: formattedResult,
          }
        },
      },
    },
    {
      name: "conftest-helm",
      docs: dedent`
        Special module type for validating helm modules with conftest. This is necessary in addition to the \`conftest\` module type in order to be able to properly render the Helm chart ahead of validation, including all runtime values.

        If the helm module requires runtime outputs from other modules, you must list the corresponding dependencies with the \`runtimeDependencies\` field.

        > Note: In most cases, you'll let the [\`conftest-kubernetes\`](${kubernetesProviderUrl}) provider create this module type automatically, but you may in some cases want or need to manually specify files to test.

        See the [conftest docs](https://github.com/instrumenta/conftest) for details on how to configure policies.
      `,
      schema: commonModuleSchema.keys({
        sourceModule: joiIdentifier()
          .required()
          .description("Specify a helm module whose chart we want to test."),
        runtimeDependencies: joiArray(joiIdentifier()).description(
          "A list of runtime dependencies that need to be resolved before rendering the Helm chart."
        ),
      }),
      handlers: {
        configure: async ({ moduleConfig }) => {
          moduleConfig.build.dependencies.push({ name: moduleConfig.spec.sourceModule, copy: [] })
          moduleConfig.include = []
          moduleConfig.testConfigs = [
            {
              name: "test",
              dependencies: moduleConfig.spec.runtimeDependencies,
              spec: {},
              disabled: false,
              timeout: null,
            },
          ]
          return { moduleConfig }
        },
        testModule: async ({ ctx, log, module, testConfig }: TestModuleParams<ConftestModule>) => {
          const startedAt = new Date()
          const provider = ctx.provider as ConftestProvider

          // Render the Helm chart
          // TODO: find a way to avoid these direct code dependencies
          const k8sProvider = getK8sProvider(ctx.provider.dependencies)
          const k8sCtx = { ...ctx, provider: k8sProvider }
          const sourceModule = module.buildDependencies[module.spec.sourceModule]

          if (sourceModule?.type !== "helm") {
            throw new ConfigurationError(`Must specify a helm module as a sourceModule`, {
              sourceModuleName: sourceModule?.name,
              sourceModuleType: sourceModule?.type,
            })
          }

          const templates = await renderTemplates(k8sCtx, sourceModule, false, log)

          // Run conftest, piping the rendered chart to stdin
          const args = prepareArgs(ctx, provider, module)
          args.push("-")

          const result = await ctx.tools["conftest.conftest"].exec({
            log,
            args,
            ignoreError: true,
            cwd: sourceModule.buildPath,
            input: templates,
          })

          // Parse and return the results
          const { success, formattedResult } = parseConftestResult(provider, log, result)

          return {
            testName: testConfig.name,
            moduleName: module.name,
            command: ["conftest", ...args],
            version: module.version.versionString,
            success,
            startedAt,
            completedAt: new Date(),
            log: formattedResult,
          }
        },
      },
    },
  ],
  tools: [
    {
      name: "conftest",
      description: "A rego-based configuration validator.",
      type: "binary",
      _includeInGardenImage: true,
      builds: [
        {
          platform: "darwin",
          architecture: "amd64",
          url:
            "https://github.com/open-policy-agent/conftest/releases/download/v0.17.1/conftest_0.17.1_Darwin_x86_64.tar.gz",
          sha256: "1c97f0e43fab99c94593696d362fc1e00e8e80bd0321729412de51d83ecbfb73",
          extract: {
            format: "tar",
            targetPath: "conftest",
          },
        },
        {
          platform: "linux",
          architecture: "amd64",
          url:
            "https://github.com/open-policy-agent/conftest/releases/download/v0.17.1/conftest_0.17.1_Linux_x86_64.tar.gz",
          sha256: "d18c95a4b04e87bfd59e06cc980801d2df5dabb371b495506ef03f70a0a40624",
          extract: {
            format: "tar",
            targetPath: "conftest",
          },
        },
        {
          platform: "windows",
          architecture: "amd64",
          url:
            "https://github.com/open-policy-agent/conftest/releases/download/v0.17.1/" +
            "conftest_0.17.1_Windows_x86_64.zip",
          sha256: "4c2df80420f2f148ec085bb75a8c5b92e1c665c6a041768a79924c81082527c3",
          extract: {
            format: "zip",
            targetPath: "conftest.exe",
          },
        },
      ],
    },
  ],
})

function prepareArgs(ctx: PluginContext, provider: ConftestProvider, module: ConftestModule) {
  const defaultPolicyPath = relative(module.path, resolve(ctx.projectRoot, provider.config.policyPath))
  // Make sure the policy path is valid POSIX on Windows
  const policyPath = slash(resolve(module.path, module.spec.policyPath || defaultPolicyPath))
  const namespace = module.spec.namespace || provider.config.namespace

  const args = ["test", "--policy", policyPath, "--output", "json"]
  if (namespace) {
    args.push("--namespace", namespace)
  }
  if (module.spec.combine) {
    args.push("--combine")
  }
  return args
}

function parseConftestResult(provider: ConftestProvider, log: LogEntry, result: ExecaReturnValue) {
  let success = true
  let parsed: any = []

  try {
    parsed = JSON.parse(result.stdout)
  } catch (err) {
    throw new PluginError(`Error running conftest: ${result.all}`, { result })
  }

  const allFailures = parsed.filter((p: any) => p.failures?.length > 0)
  const allWarnings = parsed.filter((p: any) => p.warnings?.length > 0)

  const resultCategories: string[] = []
  let formattedResult = "OK"

  if (allFailures.length > 0) {
    resultCategories.push(`${allFailures.length} failure(s)`)
  }

  if (allWarnings.length > 0) {
    resultCategories.push(`${allWarnings.length} warning(s)`)
  }

  let formattedHeader = `conftest reported ${naturalList(resultCategories)}`

  if (allFailures.length > 0 || allWarnings.length > 0) {
    const lines = [`${formattedHeader}:\n`]

    // We let the format match the conftest output
    for (const { filename, warnings, failures } of parsed) {
      for (const failure of failures) {
        lines.push(
          chalk.redBright.bold("FAIL") + chalk.gray(" - ") + chalk.redBright(filename) + chalk.gray(" - ") + failure.msg
        )
      }
      for (const warning of warnings) {
        lines.push(
          chalk.yellowBright.bold("WARN") +
            chalk.gray(" - ") +
            chalk.yellowBright(filename) +
            chalk.gray(" - ") +
            warning.msg
        )
      }
    }

    formattedResult = lines.join("\n")
  }

  const threshold = provider.config.testFailureThreshold

  if (allWarnings.length > 0 && threshold === "warn") {
    success = false
  } else if (allFailures.length > 0 && threshold !== "none") {
    success = false
  } else if (allWarnings.length > 0) {
    log.warn(chalk.yellow(formattedHeader))
  }

  return { success, formattedResult }
}
