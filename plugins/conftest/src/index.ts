/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve, relative } from "path"
import { styles } from "@garden-io/core/build/src/logger/styles.js"
import slash from "slash"
import type { ExecaReturnValue } from "execa"
import { createGardenPlugin } from "@garden-io/sdk"
import type { PluginContext, Log, PluginToolSpec } from "@garden-io/sdk/build/src/types.js"
import { dedent, naturalList } from "@garden-io/sdk/build/src/util/string.js"
import { matchGlobs, listDirectory } from "@garden-io/sdk/build/src/util/fs.js"

// TODO: gradually get rid of these core dependencies, move some to SDK etc.
import type { BaseProviderConfig, Provider } from "@garden-io/core/build/src/config/provider.js"
import { providerConfigBaseSchema } from "@garden-io/core/build/src/config/provider.js"
import { joi, joiIdentifier, joiSparseArray } from "@garden-io/core/build/src/config/common.js"
import { baseBuildSpecSchema } from "@garden-io/core/build/src/config/module.js"
import { PluginError, ConfigurationError, GardenError } from "@garden-io/core/build/src/exceptions.js"
import { getGitHubUrl } from "@garden-io/core/build/src/docs/common.js"
import { renderTemplates } from "@garden-io/core/build/src/plugins/kubernetes/helm/common.js"
import { getK8sProvider } from "@garden-io/core/build/src/plugins/kubernetes/util.js"
import type { TestAction, TestActionConfig } from "@garden-io/core/build/src/actions/test.js"
import type { TestActionHandlers } from "@garden-io/core/build/src/plugin/action-types.js"
import { uniq } from "lodash-es"
import type { HelmDeployAction } from "@garden-io/core/build/src/plugins/kubernetes/helm/config.js"
import { actionRefMatches } from "@garden-io/core/build/src/actions/base.js"
import type { Resolved } from "@garden-io/core/build/src/actions/types.js"
import { DEFAULT_TEST_TIMEOUT_SEC } from "@garden-io/core/build/src/constants.js"
import { reportDeprecatedFeatureUsage } from "@garden-io/core/build/src/util/deprecations.js"

export interface ConftestProviderConfig extends BaseProviderConfig {
  policyPath: string
  namespace?: string
  testFailureThreshold: "deny" | "warn" | "none"
}

export type ConftestProvider = Provider<ConftestProviderConfig>

export const conftestVersion = "0.45.0"
export const conftestSpec: PluginToolSpec = {
  name: "conftest",
  version: conftestVersion,
  description: `A rego-based configuration validator, v${conftestVersion}`,
  type: "binary",
  _includeInGardenImage: false,
  builds: [
    {
      platform: "darwin",
      architecture: "amd64",
      url: `https://github.com/open-policy-agent/conftest/releases/download/v${conftestVersion}/conftest_${conftestVersion}_Darwin_x86_64.tar.gz`,
      sha256: "cd199c00fb634242e9062fb6b68692040198b1a2fee88537add7a719485a9839",
      extract: {
        format: "tar",
        targetPath: "conftest",
      },
    },
    {
      platform: "darwin",
      architecture: "arm64",
      url: `https://github.com/open-policy-agent/conftest/releases/download/v${conftestVersion}/conftest_${conftestVersion}_Darwin_arm64.tar.gz`,
      sha256: "3c4e2d7fd01e7a2a17558e4e5f8086bc92312a8e8773747e2d4a067ca20127b4",
      extract: {
        format: "tar",
        targetPath: "conftest",
      },
    },
    {
      platform: "linux",
      architecture: "amd64",
      url: `https://github.com/open-policy-agent/conftest/releases/download/v${conftestVersion}/conftest_${conftestVersion}_Linux_x86_64.tar.gz`,
      sha256: "65edcf630f5cd2142138555542f10f8cbc99588e5dfcefbfa1e8074c7cc82c23",
      extract: {
        format: "tar",
        targetPath: "conftest",
      },
    },
    {
      platform: "linux",
      architecture: "arm64",
      url: `https://github.com/open-policy-agent/conftest/releases/download/v${conftestVersion}/conftest_${conftestVersion}_Linux_arm64.tar.gz`,
      sha256: "9851d4c2a6488fbaab6af34223ed77425bc6fb5a4b349a53e6e1410cdf4798f0",
      extract: {
        format: "tar",
        targetPath: "conftest",
      },
    },

    {
      platform: "windows",
      architecture: "amd64",
      url: `https://github.com/open-policy-agent/conftest/releases/download/v${conftestVersion}/conftest_${conftestVersion}_Windows_x86_64.zip`,
      sha256: "376135229a8ee5e4a1e77d10dad00dc907b04c4efb7d3857e542371902e309ce",
      extract: {
        format: "zip",
        targetPath: "conftest.exe",
      },
    },
  ],
}

export const configSchema = () =>
  providerConfigBaseSchema()
    .keys({
      policyPath: joi
        .posixPath()
        .relativeOnly()
        .subPathOnly()
        .default("./policy")
        .description("Path to the default policy directory or rego file to use for `conftest` actions."),
      namespace: joi.string().description("Default policy namespace to use for `conftest` actions."),
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

interface ConftestTestSpec {
  policyPath: string
  namespace: string
  files: string[]
  combine?: boolean
}

interface ConftestHelmTestSpec extends ConftestTestSpec {
  helmDeploy: string
}

type ConftestTestConfig = TestActionConfig<"conftest", ConftestTestSpec>
type ConftestHelmTestConfig = TestActionConfig<"conftest", ConftestHelmTestSpec>

const gitHubUrl = getGitHubUrl("examples/conftest")

const commonSchemaKeys = () => ({
  policyPath: joi
    .posixPath()
    .relativeOnly()
    .description(
      dedent`
        POSIX-style path to a directory containing the policies to match the config against, or a
        specific .rego file, relative to the action root.
        Must be a relative path, and should in most cases be within the project root.
        Defaults to the \`policyPath\` set in the provider config.
      `
    ),
  namespace: joi.string().default("main").description("The policy namespace in which to find _deny_ and _warn_ rules."),
  combine: joi.boolean().default(false).description("Set to true to use the conftest --combine flag"),
})

const testActionSchema = () =>
  joi.object().keys({
    ...commonSchemaKeys(),
    build: joiIdentifier().description("Specify a build whose files we want to test."),
    files: joi
      .array()
      .items(joi.posixPath().subPathOnly().relativeOnly().allowGlobs())
      .required()
      .description(
        dedent`
      A list of files to test with the given policy. Must be POSIX-style paths, and may include wildcards.
    `
      ),
  })

const commonModuleSchema = () =>
  joi.object().keys({
    build: baseBuildSpecSchema(),
    sourceModule: joiIdentifier().description("Specify a module whose sources we want to test."),
    ...commonSchemaKeys(),
  })

export const gardenPlugin = () =>
  createGardenPlugin({
    name: "conftest",
    docs: dedent`
    This provider allows you to validate your configuration files against policies that you specify, using the [conftest tool](https://github.com/open-policy-agent/conftest) and Open Policy Agent rego query files. The provider creates Test action types of the same name, which allow you to specify files to validate.

    Note that, in many cases, you'll actually want to use more specific providers that can automatically configure your \`conftest\` actions, e.g. the [\`conftest-container\`](./conftest-container.md) and/or [\`conftest-kubernetes\`](./conftest-kubernetes.md) providers. See the [conftest example project](${gitHubUrl}) for a simple usage example of the latter.

    If those don't match your needs, you can use this provider directly and manually configure your \`conftest\` actions. Simply add this provider to your project configuration, and see the [conftest action documentation](../action-types/Test/conftest.md) for a detailed reference. Also, check out the below reference for how to configure default policies, default namespaces, and test failure thresholds for all \`conftest\` actions.
  `,
    dependencies: [],
    configSchema: configSchema(),

    createActionTypes: {
      Test: [
        {
          name: "conftest",
          docs: dedent`
          Creates a test that runs \`conftest\` on the specified files, with the specified (or default) policy and namespace.

          > Note: In many cases, you'll let specific conftest providers (e.g. [\`conftest-container\`](../../providers/conftest-container.md) and [\`conftest-kubernetes\`](../../providers/conftest-kubernetes.md) create this automatically, but you may in some cases want or need to manually specify files to test.

          See the [conftest docs](https://github.com/open-policy-agent/conftest) for details on how to configure policies.
          `,
          schema: testActionSchema(),
          handlers: <TestActionHandlers<TestAction<ConftestTestConfig>>>{
            run: async ({ ctx, action, log }) => {
              const startedAt = new Date()
              const provider = ctx.provider as ConftestProvider

              const spec = action.getSpec()

              const buildPath = action.getBuildPath()
              const buildPathFiles = await listDirectory(buildPath)

              // TODO: throw if a specific file is listed under `spec.files` but isn't found?
              const files = matchGlobs(buildPathFiles, spec.files)

              if (files.length === 0) {
                return {
                  state: "ready",
                  detail: {
                    testName: action.name,
                    moduleName: action.moduleName(),
                    command: [],
                    version: action.versionString(),
                    success: true,
                    startedAt,
                    completedAt: new Date(),
                    log: "No files to test",
                  },
                  outputs: {},
                }
              }

              const args = prepareArgs(ctx, provider, action.sourcePath(), spec)
              args.push(...files)

              const result = await ctx.tools["conftest.conftest"].exec({ log, args, ignoreError: true, cwd: buildPath })

              const { success, formattedResult } = parseConftestResult(provider, log, result)

              return {
                state: success ? "ready" : "not-ready",
                detail: {
                  testName: action.name,
                  moduleName: action.moduleName(),
                  command: ["conftest", ...args],
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
        // TODO-G2: move to conftest-kubernetes
        {
          name: "conftest-helm",
          base: "conftest",
          docs: dedent`
          Special Test type for validating helm deploys with conftest. This is necessary in addition to the \`conftest\` Test type in order to be able to properly render the Helm chart ahead of validation, including all runtime values.

          If the helm Deploy requires runtime outputs from other actions, you must list the corresponding dependencies with the \`dependencies\` field.

          > Note: In most cases, you'll let the [\`conftest-kubernetes\`](../../providers/conftest-kubernetes.md) provider create this Test automatically, but you may in some cases want or need to manually specify files to test.

          See the [conftest docs](https://github.com/open-policy-agent/conftest) for details on how to configure policies.
          `,
          schema: testActionSchema().keys({
            helmDeploy: joi
              .actionReference()
              .kind("Deploy")
              .name("helm")
              .required()
              .description("The Helm Deploy action to validate."),
          }),
          handlers: <TestActionHandlers<TestAction<ConftestHelmTestConfig>>>{
            configure: async ({ ctx, config, log }) => {
              reportDeprecatedFeatureUsage({
                log,
                deprecation: "conftestPlugin",
              })

              let files = config.spec.files || []

              if (files.length > 0) {
                if (!config.include) {
                  config.include = []
                }

                try {
                  // @ts-expect-error todo: correct types for unresolved configs
                  files = ctx.deepEvaluate(files)
                } catch (error) {
                  if (!(error instanceof GardenError)) {
                    throw error
                  }
                  throw new ConfigurationError({
                    message: `The spec.files field contains a template string which could not be resolved. Note that some template variables are not available for the field. Error: ${error}`,
                    wrappedErrors: [error],
                  })
                }
                config.include = uniq([...config.include, ...files])
              }

              return { config, supportedModes: {} }
            },

            run: async ({ ctx, log, action }) => {
              const startedAt = new Date()
              const provider = ctx.provider as ConftestProvider
              const spec = action.getSpec()

              // Render the Helm chart
              // TODO: find a way to avoid these direct code dependencies
              const k8sProvider = getK8sProvider(ctx.provider.dependencies)
              const k8sCtx = { ...ctx, provider: k8sProvider }

              const sourceAction = <Resolved<HelmDeployAction> | null>(
                (action
                  .getResolvedDependencies()
                  .find((d) => actionRefMatches(d, { kind: "Deploy", name: spec.helmDeploy })) || null)
              )

              if (!sourceAction) {
                throw new ConfigurationError({
                  message: `Must specify a helm Deploy action in the \`helmDeploy\` field. Could not find Deploy action '${spec.helmDeploy}'.`,
                })
              }
              if (sourceAction.type !== "helm") {
                throw new ConfigurationError({
                  message: `Must specify a helm Deploy action in the \`helmDeploy\` field. Deploy action '${spec.helmDeploy}' has type '${sourceAction.type}'.`,
                })
              }

              const templates = await renderTemplates({
                ctx: k8sCtx,
                action: sourceAction,
                log,
              })

              // Run conftest, piping the rendered chart to stdin
              const args = prepareArgs(ctx, provider, action.sourcePath(), spec)
              args.push("-")

              const result = await ctx.tools["conftest.conftest"].exec({
                log,
                args,
                ignoreError: true,
                cwd: sourceAction.getBuildPath(),
                input: templates,
              })

              // Parse and return the results
              const { success, formattedResult } = parseConftestResult(provider, log, result)

              return {
                state: success ? "ready" : "not-ready",
                detail: {
                  testName: action.name,
                  moduleName: action.moduleName(),
                  command: ["conftest", ...args],
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
        name: "conftest",
        docs: dedent`
        Creates a test that runs \`conftest\` on the specified files, with the specified (or default) policy and
        namespace.

        > Note: In many cases, you'll let specific conftest providers (e.g. [\`conftest-container\`](../providers/conftest-container.md) and [\`conftest-kubernetes\`](../providers/conftest-kubernetes.md) create this action type automatically, but you may in some cases want or need to manually specify files to test.

        See the [conftest docs](https://github.com/open-policy-agent/conftest) for details on how to configure policies.
      `,
        schema: commonModuleSchema(),
        needsBuild: false,
        handlers: {
          configure: async ({ moduleConfig }) => {
            if (moduleConfig.spec.sourceModule) {
              // TODO-G2: change this to validation instead, require explicit dependency
              moduleConfig.build.dependencies.push({ name: moduleConfig.spec.sourceModule, copy: [] })
            }

            moduleConfig.include = moduleConfig.spec.files
            moduleConfig.testConfigs = [{ name: "test", dependencies: [], spec: {}, disabled: false, timeout: 10 }]
            return { moduleConfig }
          },

          convert: async (params) => {
            const { module, dummyBuild, convertBuildDependency } = params

            return {
              actions: [
                ...(dummyBuild ? [dummyBuild] : []),
                {
                  kind: "Test",
                  type: "conftest",
                  name: module.name + "-conftest",
                  ...params.baseFields,

                  build: module.spec.sourceModule ? convertBuildDependency(module.spec.sourceModule).name : undefined,
                  timeout: 10,
                  include: module.spec.files,

                  spec: {
                    ...module.spec,
                  },
                },
              ],
            }
          },
        },
      },
      {
        name: "conftest-helm",
        docs: dedent`
        Special module type for validating helm modules with conftest. This is necessary in addition to the \`conftest\` module type in order to be able to properly render the Helm chart ahead of validation, including all runtime values.

        If the helm module requires runtime outputs from other actions, you must list the corresponding dependencies with the \`runtimeDependencies\` field.

        > Note: In most cases, you'll let the [\`conftest-kubernetes\`](../providers/conftest-kubernetes.md) provider create this action type automatically, but you may in some cases want or need to manually specify files to test.

        See the [conftest docs](https://github.com/open-policy-agent/conftest) for details on how to configure policies.
      `,
        schema: commonModuleSchema().keys({
          sourceModule: joiIdentifier().required().description("Specify a helm module whose chart we want to test."),
          runtimeDependencies: joiSparseArray(joiIdentifier()).description(
            "A list of runtime dependencies that need to be resolved before rendering the Helm chart."
          ),
        }),
        needsBuild: false,
        handlers: {
          configure: async ({ moduleConfig }) => {
            // TODO-G2: change this to validation instead, require explicit dependency
            moduleConfig.build.dependencies.push({ name: moduleConfig.spec.sourceModule, copy: [] })
            moduleConfig.include = []
            moduleConfig.testConfigs = [
              {
                name: "test",
                dependencies: moduleConfig.spec.runtimeDependencies,
                spec: {},
                disabled: false,
                timeout: DEFAULT_TEST_TIMEOUT_SEC,
              },
            ]
            return { moduleConfig }
          },
        },
      },
    ],
    tools: [conftestSpec],
  })

function prepareArgs(ctx: PluginContext, provider: ConftestProvider, path: string, spec: ConftestTestSpec) {
  const defaultPolicyPath = relative(path, resolve(ctx.projectRoot, provider.config.policyPath))
  // Make sure the policy path is valid POSIX on Windows
  const policyPath = slash(resolve(path, spec.policyPath || defaultPolicyPath))
  const namespace = spec.namespace || provider.config.namespace

  const args = ["test", "--policy", policyPath, "--output", "json"]
  if (namespace) {
    args.push("--namespace", namespace)
  }
  if (spec.combine) {
    args.push("--combine")
  }
  return args
}

function parseConftestResult(provider: ConftestProvider, log: Log, result: ExecaReturnValue) {
  let success = true
  let parsed: any = []

  try {
    parsed = JSON.parse(result.stdout)
  } catch (err) {
    throw new PluginError({ message: `Error running conftest: ${result.all}` })
  }

  const resultCategories: string[] = []
  let formattedResult = "OK"

  let countFailures = 0
  let countWarnings = 0

  const lines: string[] = []

  // We let the format match the conftest output
  for (const { filename, warnings, failures } of parsed) {
    const failuresForFilename = failures || []
    for (const failure of failuresForFilename) {
      lines.push(
        styles.error.bold("FAIL") + styles.primary(" - ") + styles.error(filename) + styles.primary(" - ") + failure.msg
      )
      countFailures += 1
    }

    const warningsForFilename = warnings || []
    for (const warning of warningsForFilename) {
      lines.push(
        styles.warning.bold("WARN") +
          styles.primary(" - ") +
          styles.warning(filename) +
          styles.primary(" - ") +
          warning.msg
      )

      countWarnings += 1
    }
  }

  if (countFailures > 0) {
    resultCategories.push(`${countFailures} failure(s)`)
  }

  if (countWarnings > 0) {
    resultCategories.push(`${countWarnings} warning(s)`)
  }

  const formattedHeader = `conftest reported ${naturalList(resultCategories)}`

  const threshold = provider.config.testFailureThreshold

  if (countWarnings > 0 && threshold === "warn") {
    success = false
  } else if (countFailures > 0 && threshold !== "none") {
    success = false
  } else if (countWarnings > 0) {
    log.warn(formattedHeader)
  }

  if (!success) {
    formattedResult = formattedHeader + ":\n\n" + lines.join("\n")
  }

  return { success, formattedResult }
}
