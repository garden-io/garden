/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve, relative } from "path"
import { createGardenPlugin } from "../../types/plugin/plugin"
import { providerConfigBaseSchema, ProviderConfig, Provider } from "../../config/provider"
import { joi, joiIdentifier } from "../../config/common"
import { dedent, naturalList } from "../../util/string"
import { TestModuleParams } from "../../types/plugin/module/testModule"
import { Module } from "../../types/module"
import { BinaryCmd } from "../../util/ext-tools"
import chalk from "chalk"
import { baseBuildSpecSchema } from "../../config/module"
import { matchGlobs, listDirectory } from "../../util/fs"
import { PluginError } from "../../exceptions"
import { getModuleTypeUrl, getGitHubUrl, getProviderUrl } from "../../docs/common"

interface ConftestProviderConfig extends ProviderConfig {
  policyPath: string
  namespace?: string
  testFailureThreshold: "deny" | "warn" | "none"
}

export interface ConftestProvider extends Provider<ConftestProviderConfig> {}

export const configSchema = providerConfigBaseSchema()
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
}

type ConftestModule = Module<ConftestModuleSpec>

const moduleTypeUrl = getModuleTypeUrl("conftest")
const containerProviderUrl = getProviderUrl("conftest-container")
const kubernetesProviderUrl = getProviderUrl("conftest-kubernetes")
const gitHubUrl = getGitHubUrl("examples/conftest")

export const gardenPlugin = createGardenPlugin({
  name: "conftest",
  docs: dedent`
    This provider allows you to validate your configuration files against policies that you specify, using the [conftest tool](https://github.com/instrumenta/conftest) and Open Policy Agent rego query files. The provider creates a module type of the same name, which allows you to specify files to validate. Each module then creates a Garden test that becomes part of your Stack Graph.

    Note that, in many cases, you'll actually want to use more specific providers that can automatically configure your \`conftest\` modules, e.g. the [\`conftest-container\`](${containerProviderUrl}) and/or [\`conftest-kubernetes\`](${kubernetesProviderUrl}) providers. See the [conftest example project](${gitHubUrl}) for a simple usage example of the latter.

    If those don't match your needs, you can use this provider directly and manually configure your \`conftest\` modules. Simply add this provider to your project configuration, and see the [conftest module documentation](${moduleTypeUrl}) for a detailed reference. Also, check out the below reference for how to configure default policies, default namespaces, and test failure thresholds for all \`conftest\` modules.
  `,
  dependencies: [],
  configSchema,
  createModuleTypes: [
    {
      name: "conftest",
      docs: dedent`
        Creates a test that runs \`conftest\` on the specified files, with the specified (or default) policy and
        namespace.

        > Note: In many cases, you'll let specific conftest providers (e.g. [\`conftest-container\`](${containerProviderUrl}) and [\`conftest-kubernetes\`](${kubernetesProviderUrl}) create this module type automatically, but you may in some cases want or need to manually specify files to test.

        See the [conftest docs](https://github.com/instrumenta/conftest) for details on how to configure policies.
      `,
      schema: joi.object().keys({
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
          moduleConfig.testConfigs = [{ name: "test", dependencies: [], spec: {}, timeout: 10 }]
          return { moduleConfig }
        },
        testModule: async ({ ctx, log, module, testConfig }: TestModuleParams<ConftestModule>) => {
          const startedAt = new Date()
          const provider = ctx.provider as ConftestProvider

          const defaultPolicyPath = relative(module.path, resolve(ctx.projectRoot, provider.config.policyPath))
          const policyPath = resolve(module.path, module.spec.policyPath || defaultPolicyPath)
          const namespace = module.spec.namespace || provider.config.namespace

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

          const args = ["test", "--policy", policyPath, "--output", "json"]
          if (namespace) {
            args.push("--namespace", namespace)
          }
          args.push(...files)

          const result = await conftest.exec({ log, args, ignoreError: true, cwd: buildPath })

          let success = true
          let parsed: any = []

          try {
            parsed = JSON.parse(result.stdout)
          } catch (err) {
            throw new PluginError(`Error running conftest: ${result.all}`, { result })
          }

          const allFailures = parsed.filter((p: any) => p.Failures?.length > 0)
          const allWarnings = parsed.filter((p: any) => p.Warnings?.length > 0)

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
            for (const { filename, Warnings, Failures } of parsed) {
              for (const failure of Failures) {
                lines.push(
                  chalk.redBright.bold("FAIL") +
                    chalk.gray(" - ") +
                    chalk.redBright(filename) +
                    chalk.gray(" - ") +
                    failure
                )
              }
              for (const warning of Warnings) {
                lines.push(
                  chalk.yellowBright.bold("WARN") +
                    chalk.gray(" - ") +
                    chalk.yellowBright(filename) +
                    chalk.gray(" - ") +
                    warning
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
})

const conftest = new BinaryCmd({
  name: "conftest",
  specs: {
    darwin: {
      url: "https://github.com/instrumenta/conftest/releases/download/v0.15.0/conftest_0.15.0_Darwin_x86_64.tar.gz",
      sha256: "73cea42e467edf7bec58648514096f5975353b0523a5f2b309833ff4a972765e",
      extract: {
        format: "tar",
        targetPath: ["conftest"],
      },
    },
    linux: {
      url: "https://github.com/instrumenta/conftest/releases/download/v0.15.0/conftest_0.15.0_Linux_x86_64.tar.gz",
      sha256: "23c6af69dcd2c9fe935ee3cd5652cc14ffc9d7cf0fd55d4abc6a5c3bd470b692",
      extract: {
        format: "tar",
        targetPath: ["conftest"],
      },
    },
    win32: {
      url: "https://github.com/instrumenta/conftest/releases/download/v0.15.0/conftest_0.15.0_Windows_x86_64.zip",
      sha256: "c452bb4b71d6fbf5d918e1b3ed28092f7bc3a157f44e0ecd6fa1968e1cad4bec",
      extract: {
        format: "zip",
        targetPath: ["conftest.exe"],
      },
    },
  },
})
