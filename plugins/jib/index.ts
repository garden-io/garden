/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import split2 = require("split2")
import { createGardenPlugin } from "@garden-io/sdk"
import { dedent } from "@garden-io/sdk/util/string"

import { openJdkSpecs } from "./openjdk"
import { mavenSpec, mvn } from "./maven"
import { gradle, gradleSpec } from "./gradle"

// TODO: gradually get rid of these core dependencies, move some to SDK etc.
import { providerConfigBaseSchema, GenericProviderConfig, Provider } from "@garden-io/core/build/src/config/provider"
import { getGitHubUrl } from "@garden-io/core/build/src/docs/common"
import {
  containerBuildSpecSchema,
  containerModuleSpecSchema,
} from "../../core/build/src/plugins/container/moduleConfig"
import { joi } from "@garden-io/core/build/src/config/common"
import { renderOutputStream } from "@garden-io/core/build/src/util/util"
import { baseBuildSpecSchema } from "@garden-io/core/build/src/config/module"
import { ConfigureModuleParams } from "@garden-io/core/build/src/types/plugin/module/configure"
import { containerHelpers } from "@garden-io/core/build/src/plugins/container/helpers"
import { cloneDeep, pick } from "lodash"
import { LogLevel } from "@garden-io/core/build/src/logger/logger"
import { detectProjectType, getBuildFlags, JibBuildConfig, JibContainerModule } from "./util"
import { ConvertModuleParams, ConvertModuleResult } from "@garden-io/core/build/src/plugin/handlers/module/convert"
import { getContainerBuildActionOutputs } from "@garden-io/core/src/plugins/container/build"

export interface JibProviderConfig extends GenericProviderConfig {}

export interface JibProvider extends Provider<JibProviderConfig> {}

export const configSchema = () => providerConfigBaseSchema().unknown(false)

const exampleUrl = getGitHubUrl("examples/jib-container")

const jibBuildSchemaKeys = () => ({
  projectType: joi
    .string()
    .allow("gradle", "maven", "jib", "auto")
    .default("auto")
    .description(
      dedent`
        The type of project to build. Defaults to auto-detecting between gradle and maven (based on which files/directories are found in the module root), but in some cases you may need to specify it.
        `
    ),
  jdkVersion: joi.number().integer().allow(8, 11).default(11).description("The JDK version to use."),
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
    .allow("docker", "oci")
    .default("docker")
    .description("Specify the image format in the resulting tar file. Only used if `tarOnly: true`."),
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

  By default (and when not using remote building), the image is pushed to the local Docker daemon, to match the behavior of and stay compatible with normal \`container\` modules.

  When using remote building with the \`kubernetes\` provider, the image is synced to the cluster (where individual layers are cached) and then pushed to the deployment registry from there. This is to make sure any registry auth works seamlessly and exactly like for normal Docker image builds.

  Please consult the [Jib documentation](https://github.com/GoogleContainerTools/jib) for how to configure Jib in your Gradle or Maven project.

  To provide additional arguments to Gradle/Maven when building, you can set the \`extraFlags\` field.

  **Important note:** Unlike many other types, \`jib-container\` builds are done from the _source_ directory instead of the build staging directory, because of how Java projects are often laid out across a repository. This means build dependency copy directives are effectively ignored, and any include/exclude statements and .gardenignore files will not impact the build result. _Note that you should still configure includes, excludes and/or a .gardenignore to tell Garden which files to consider as part of the module version hash, to correctly detect whether a new build is required._
`

export const gardenPlugin = () =>
  createGardenPlugin({
    name: "jib",
    docs: dedent`
      **EXPERIMENTAL**: Please provide feedback via GitHub issues or our community forum!

      Provides support for [Jib](https://github.com/GoogleContainerTools/jib) via the [jib module type](../module-types/jib-container.md).

      Use this to efficiently build container images for Java services. Check out the [jib example](${exampleUrl}) to see it in action.
    `,
    dependencies: [{ name: "container" }],
    configSchema: configSchema(),
    tools: [mavenSpec, gradleSpec, ...openJdkSpecs],

    createActionTypes: {
      build: [
        {
          name: "jib-container",
          base: "container",
          docs,
          schema: jibBuildSchema(),
          handlers: {
            build: async (params) => {
              const { ctx, log, action } = params
              const spec = action.getSpec()
              const { jdkVersion } = spec.build

              const openJdk = ctx.tools["jib.openjdk-" + jdkVersion]
              const openJdkPath = await openJdk.getPath(log)

              const statusLine = log.placeholder({ level: LogLevel.verbose, childEntriesInheritLevel: true })

              let projectType = spec.build.projectType

              if (!projectType) {
                projectType = detectProjectType(action)
                statusLine.setState(renderOutputStream(`Detected project type ${projectType}`))
              }

              const outputStream = split2()
              let buildLog = ""

              outputStream.on("error", () => {})
              outputStream.on("data", (line: Buffer) => {
                const str = line.toString()
                statusLine.setState({ section: action.name, msg: str })
                buildLog += str
              })

              statusLine.setState({ section: action.name, msg: `Using JAVA_HOME=${openJdkPath}` })

              const { args, tarPath } = getBuildFlags(action, projectType)

              if (projectType === "maven") {
                await mvn({
                  ctx,
                  log,
                  cwd: action.basePath(),
                  args: ["compile", ...args],
                  openJdkPath,
                  outputStream,
                })
              } else {
                await gradle({
                  ctx,
                  log,
                  cwd: action.basePath(),
                  args,
                  openJdkPath,
                  outputStream,
                })
              }

              const outputs = getContainerBuildActionOutputs(action)

              return {
                fetched: false,
                buildLog,
                details: {
                  tarPath,
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
        handlers: {
          async configure(params: ConfigureModuleParams<JibContainerModule>) {
            let { base, moduleConfig } = params

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

            const buildAction: JibBuildConfig = {
              kind: "Build",
              type: "jib-container",
              name: module.name,
              ...params.baseFields,

              copyFrom: dummyBuild?.copyFrom,
              allowPublish: module.allowPublish,
              dependencies: module.build.dependencies.map(convertBuildDependency),

              spec: {
                // base container fields
                buildArgs: module.spec.buildArgs,
                extraFlags: module.spec.extraFlags,
                publishId: module.spec.image,
                targetStage: module.spec.build.targetImage,
                timeout: module.spec.build.timeout,

                // jib fields
                jdkVersion: module.spec.build.jdkVersion,
                projectType: module.spec.build.projectType,
                tarFormat: module.spec.build.tarFormat,
                tarOnly: module.spec.build.tarOnly,
                dockerfile: "_jib", // See configure handler above
                ...pick(module.spec.build, Object.keys(jibBuildSchemaKeys())),
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
                action.dependencies.push("build:" + buildAction.name)
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
