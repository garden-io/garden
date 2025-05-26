/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import split2 from "split2"
import { createGardenPlugin } from "@garden-io/sdk"
import { dedent } from "@garden-io/sdk/build/src/util/string.js"

import { openJdkSpecs } from "./openjdk.js"
import { mavenSpec, mvn, mvnVersion } from "./maven.js"
import { mavendSpec, mvnd, mvndVersion } from "./mavend.js"
import { gradle, gradleSpec, gradleVersion } from "./gradle.js"

// TODO: gradually get rid of these core dependencies, move some to SDK etc.
import type { BaseProviderConfig, Provider } from "@garden-io/core/build/src/config/provider.js"
import { providerConfigBaseSchema } from "@garden-io/core/build/src/config/provider.js"
import { getGitHubUrl } from "@garden-io/core/build/src/docs/common.js"
import {
  containerBuildSpecSchema,
  containerModuleSpecSchema,
} from "@garden-io/core/build/src/plugins/container/moduleConfig.js"
import { joi } from "@garden-io/core/build/src/config/common.js"
import { baseBuildSpecSchema } from "@garden-io/core/build/src/config/module.js"
import type { ConfigureModuleParams } from "@garden-io/core/build/src/plugin/handlers/Module/configure.js"
import { containerHelpers } from "@garden-io/core/build/src/plugins/container/helpers.js"
import cloneDeep from "fast-copy"
import { pick } from "lodash-es"
import { LogLevel } from "@garden-io/core/build/src/logger/logger.js"
import type { JibBuildActionSpec, JibBuildConfig, JibContainerModule } from "./util.js"
import { detectProjectType, getBuildFlags } from "./util.js"
import type {
  ConvertModuleParams,
  ConvertModuleResult,
} from "@garden-io/core/build/src/plugin/handlers/Module/convert.js"
import type { PluginEventLogContext } from "@garden-io/core/build/src/plugin-context.js"

export type JibProviderConfig = BaseProviderConfig

export type JibProvider = Provider<JibProviderConfig>

export const configSchema = () => providerConfigBaseSchema().unknown(false)

const exampleUrl = getGitHubUrl("examples/jib-container")
const systemJdkGardenEnvVar = "${local.env.JAVA_HOME}"

const jibBuildSchemaKeys = () => ({
  projectType: joi
    .string()
    .valid("gradle", "maven", "jib", "auto", "mavend")
    .default("auto")
    .description(
      dedent`
            The type of project to build. Defaults to auto-detecting between gradle and maven (based on which files/directories are found in the action root), but in some cases you may need to specify it.
            `
    ),
  jdkVersion: joi
    .number()
    .integer()
    .valid(8, 11, 13, 17, 21)
    .default(11)
    .description(
      dedent`
            The JDK version to use.

            The chosen version will be downloaded by Garden and used to define \`JAVA_HOME\` environment variable for Gradle and Maven.

            To use an arbitrary JDK distribution, please use the \`jdkPath\` configuration option.
            `
    ),
  jdkPath: joi
    .string()
    .optional()
    .empty(["", null])
    .description(
      dedent`
            The JDK home path. This **always overrides** the JDK defined in \`jdkVersion\`.

            The value will be used as \`JAVA_HOME\` environment variable for Gradle and Maven.
            `
    )
    .example(systemJdkGardenEnvVar),
  dockerBuild: joi
    .boolean()
    .default(false)
    .description(
      "Build the image and push to a local Docker daemon (i.e. use the `jib:dockerBuild` / `jibDockerBuild` target)."
    ),
  tarOnly: joi
    .boolean()
    .default(false)
    .description("Don't load or push the resulting image to a Docker daemon or registry, only build it as a tar file."),
  tarFormat: joi
    .string()
    .valid("docker", "oci")
    .default("docker")
    .description("Specify the image format in the resulting tar file. Only used if `tarOnly: true`."),
  gradlePath: joi.string().optional().empty(["", null]).description(dedent`
        Defines the location of the custom executable Gradle binary.

        If not provided, then the Gradle binary available in the working directory will be used.
        If no Gradle binary found in the working dir, then Gradle ${gradleVersion} will be downloaded and used.

        **Note!** Either \`jdkVersion\` or \`jdkPath\` will be used to define \`JAVA_HOME\` environment variable for the custom Gradle.
        To ensure a system JDK usage, please set \`jdkPath\` to \`${systemJdkGardenEnvVar}\`.
      `),
  mavenPath: joi.string().optional().empty(["", null]).description(dedent`
        Defines the location of the custom executable Maven binary.

        If not provided, then Maven ${mvnVersion} will be downloaded and used.

        **Note!** Either \`jdkVersion\` or \`jdkPath\` will be used to define \`JAVA_HOME\` environment variable for the custom Maven.
        To ensure a system JDK usage, please set \`jdkPath\` to \`${systemJdkGardenEnvVar}\`.
      `),
  mavenPhases: joi
    .array()
    .items(joi.string())
    .default(["compile"])
    .description("Defines the Maven phases to be executed during the Garden build step."),
  mavendPath: joi.string().optional().empty(["", null]).description(dedent`
        Defines the location of the custom executable Maven Daemon binary.

        If not provided, then Maven Daemon ${mvndVersion} will be downloaded and used.

        **Note!** Either \`jdkVersion\` or \`jdkPath\` will be used to define \`JAVA_HOME\` environment variable for the custom Maven Daemon.
        To ensure a system JDK usage, please set \`jdkPath\` to \`${systemJdkGardenEnvVar}\`.
      `),
  concurrentMavenBuilds: joi
    .boolean()
    .optional()
    .default(false)
    .description(
      dedent`
      [EXPERIMENTAL] Enable/disable concurrent Maven and Maven Daemon builds.

      Note! Concurrent builds can be unstable. This option is disabled by default.
      This option must be configured for each Build action individually.`
    )
    .meta({ experimental: true }),
  extraFlags: joi
    .sparseArray()
    .items(joi.string())
    .description(`Specify extra flags to pass to maven/gradle when building the container image.`),
})

const jibModuleSchema = () =>
  containerModuleSpecSchema().keys({
    build: baseBuildSpecSchema().keys(jibBuildSchemaKeys()),
  })

const jibBuildSchema = () => containerBuildSpecSchema().keys(jibBuildSchemaKeys())

const docs = dedent`
  Extends the [container type](./container.md) to build the image with [Jib](https://github.com/GoogleContainerTools/jib). Use this to efficiently build container images for Java services. Check out the [jib example](${exampleUrl}) to see it in action.

  The image is always built locally, directly from the source directory (see the note on that below), before shipping the container image to the right place. You can set \`build.tarOnly: true\` to only build the image as a tarball.

  By default (and when not using remote building), the image is pushed to the local Docker daemon, to match the behavior of and stay compatible with normal \`container\` actions.

  When using remote building with the \`kubernetes\` provider, the image is synced to the cluster (where individual layers are cached) and then pushed to the deployment registry from there. This is to make sure any registry auth works seamlessly and exactly like for normal Docker image builds.

  Please consult the [Jib documentation](https://github.com/GoogleContainerTools/jib) for how to configure Jib in your Gradle or Maven project.

  To provide additional arguments to Gradle/Maven when building, you can set the \`extraFlags\` field.

  **Important note:** Unlike many other types, \`jib-container\` builds are done from the _source_ directory instead of the build staging directory, because of how Java projects are often laid out across a repository. This means build dependency copy directives are effectively ignored, and any include/exclude statements and .gardenignore files will not impact the build result. _Note that you should still configure includes, excludes and/or a .gardenignore to tell Garden which files to consider as part of the Build version hash, to correctly detect whether a new build is required.**
`

export const gardenPlugin = () =>
  createGardenPlugin({
    name: "jib",
    docs: dedent`
      **EXPERIMENTAL**: Please provide feedback via GitHub issues or our community forum!

      Provides support for [Jib](https://github.com/GoogleContainerTools/jib) via the [jib action type](../action-types/Build/jib-container.md).

      Use this to efficiently build container images for Java services. Check out the [jib example](${exampleUrl}) to see it in action.
    `,
    dependencies: [{ name: "container" }],
    configSchema: configSchema(),
    tools: [mavenSpec, gradleSpec, mavendSpec, ...openJdkSpecs],

    createActionTypes: {
      Build: [
        {
          name: "jib-container",
          base: "container",
          docs,
          schema: jibBuildSchema(),
          handlers: {
            build: async (params) => {
              const { ctx, log, action } = params
              const spec = action.getSpec() as JibBuildActionSpec
              const { jdkVersion, jdkPath, mavenPhases, mavenPath, mavendPath, concurrentMavenBuilds, gradlePath } =
                spec

              let openJdkPath: string
              if (!!jdkPath) {
                log.verbose(`Using explicitly specified JDK from ${jdkPath}`)
                openJdkPath = jdkPath
              } else {
                log.verbose(`The JDK path hasn't been specified explicitly. JDK ${jdkVersion} will be used by default.`)
                const openJdk = ctx.tools["jib.openjdk-" + jdkVersion]
                openJdkPath = await openJdk.ensurePath(log)
              }

              const statusLine = log.createLog({ fixLevel: LogLevel.verbose })

              let projectType = spec.projectType

              if (!projectType) {
                projectType = await detectProjectType(action)
                statusLine.info(`Detected project type ${projectType}`)
              }

              let buildLog = ""

              const logEventContext: PluginEventLogContext = {
                level: "verbose",
                origin: ["maven", "mavend", "gradle"].includes(projectType) ? projectType : "gradle",
              }

              const outputStream = split2()
              outputStream.on("error", () => {})
              outputStream.on("data", (data: Buffer) => {
                ctx.events.emit("log", {
                  timestamp: new Date().toISOString(),
                  msg: data.toString(),
                  ...logEventContext,
                })
                buildLog += data.toString()
              })

              statusLine.info(`Using JAVA_HOME=${openJdkPath}`)

              const { args, tarPath } = getBuildFlags(action, projectType)

              if (projectType === "maven") {
                await mvn({
                  ctx,
                  log,
                  cwd: action.sourcePath(),
                  args: [...mavenPhases, ...args],
                  openJdkPath,
                  binaryPath: mavenPath,
                  concurrentMavenBuilds,
                  outputStream,
                })
              } else if (projectType === "mavend") {
                await mvnd({
                  ctx,
                  log,
                  cwd: action.sourcePath(),
                  args: [...mavenPhases, ...args],
                  openJdkPath,
                  binaryPath: mavendPath,
                  concurrentMavenBuilds,
                  outputStream,
                })
              } else {
                await gradle({
                  ctx,
                  log,
                  cwd: action.sourcePath(),
                  args,
                  openJdkPath,
                  binaryPath: gradlePath,
                  outputStream,
                })
              }

              const outputs = action.getOutputs()

              return {
                state: "ready",
                detail: {
                  fetched: false,
                  buildLog,
                  runtime: {
                    actual: {
                      kind: "local",
                    },
                  },
                  details: {
                    tarPath,
                  },
                  outputs,
                },
                outputs,
              }
            },
          },
        },
      ],
    },

    createModuleTypes: [
      {
        name: "jib-container",
        base: "container",
        docs,
        schema: jibModuleSchema(),
        needsBuild: true,
        handlers: {
          async configure(params: ConfigureModuleParams<JibContainerModule>) {
            const { base } = params
            let { moduleConfig } = params

            // The base handler will either auto-detect or set include if there's no Dockerfile, so we need to
            // override that behavior.
            const include = moduleConfig.include
            moduleConfig.include = []

            const configured = await base!({ ...params, moduleConfig: cloneDeep(moduleConfig) })

            moduleConfig = configured.moduleConfig
            moduleConfig.include = include
            moduleConfig.buildConfig!.projectType = moduleConfig.spec.build.projectType
            moduleConfig.buildConfig!.jdkVersion = moduleConfig.spec.build.jdkVersion

            // FIXME: for now we need to set this value because various code paths decide if the module is built (as
            //        opposed to just fetched) by checking if a Dockerfile is found or specified.
            moduleConfig.buildConfig!.dockerfile = moduleConfig.spec.dockerfile = "_jib"

            return { moduleConfig }
          },

          async convert(params: ConvertModuleParams<JibContainerModule>) {
            const { base, module, dummyBuild, convertBuildDependency } = params
            const output: ConvertModuleResult = await base!(params)

            const actions = output.group!.actions
            const buildActionIndex = actions.findIndex((a) => a.kind === "Build")

            const defaults = pick(module.spec.build, Object.keys(jibBuildSchemaKeys())) as Partial<JibBuildActionSpec>
            const buildAction: JibBuildConfig = {
              kind: "Build",
              type: "jib-container",
              name: module.name,
              ...params.baseFields,

              copyFrom: dummyBuild?.copyFrom,
              allowPublish: module.allowPublish,
              dependencies: module.build.dependencies.map(convertBuildDependency),

              timeout: module.build.timeout,
              spec: {
                // base container fields
                buildArgs: module.spec.buildArgs,
                extraFlags: module.spec.extraFlags,
                localId: module.spec.image,
                publishId: module.spec.image,
                targetStage: module.spec.build.targetImage,

                // jib fields
                ...defaults,
                jdkVersion: module.spec.build.jdkVersion,
                projectType: module.spec.build.projectType,
                tarFormat: module.spec.build.tarFormat,
                tarOnly: module.spec.build.tarOnly,
                dockerfile: "_jib", // See configure handler above
                mavenPhases: module.spec.build.mavenPhases,
              },
            }

            // Replace existing Build if any, otherwise add and update deps on other actions
            if (buildActionIndex >= 0) {
              actions[buildActionIndex] = buildAction
            } else {
              actions.push(buildAction)

              for (const action of actions) {
                if (!action.dependencies) {
                  action.dependencies = []
                }
                action.dependencies.push({ kind: "Build", name: buildAction.name })
              }
            }

            return output
          },

          // Need to override this handler because the base handler checks if there is a Dockerfile,
          // which doesn't apply here
          async getModuleOutputs({ moduleConfig, version }) {
            const deploymentImageName = containerHelpers.getDeploymentImageName(
              moduleConfig.name,
              moduleConfig.spec.image,
              undefined
            )

            const localImageId = containerHelpers.getLocalImageId(moduleConfig.name, moduleConfig.spec.image, version)

            let repository = deploymentImageName
            let tag = version.versionString

            if (moduleConfig.spec.image) {
              repository = moduleConfig.spec.image
              const imageSpecTag = containerHelpers.parseImageId(moduleConfig.spec.image, "").tag
              if (imageSpecTag) {
                tag = imageSpecTag
              }
            }

            const deploymentImageId = containerHelpers.unparseImageId({
              repository,
              tag,
            })

            return {
              outputs: {
                "local-image-name": containerHelpers.getLocalImageName(moduleConfig.name, moduleConfig.spec.image),
                "local-image-id": localImageId,
                "deployment-image-name": deploymentImageName,
                "deployment-image-id": deploymentImageId,
              },
            }
          },
        },
      },
    ],
  })
