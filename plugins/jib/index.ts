/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
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
import { getModuleTypeUrl, getGitHubUrl } from "@garden-io/core/build/src/docs/common"
import { containerModuleSpecSchema } from "@garden-io/core/build/src/plugins/container/config"
import { joi } from "@garden-io/core/build/src/config/common"
import { BuildModuleParams } from "@garden-io/core/build/src/types/plugin/module/build"
import { renderOutputStream } from "@garden-io/core/build/src/util/util"
import { baseBuildSpecSchema } from "@garden-io/core/build/src/config/module"
import { ConfigureModuleParams } from "@garden-io/core/build/src/types/plugin/module/configure"
import { containerHelpers } from "@garden-io/core/build/src/plugins/container/helpers"
import { cloneDeep } from "lodash"
import { LogLevel } from "@garden-io/core/build/src/logger/logger"
import { detectProjectType, getBuildFlags, JibContainerModule } from "./util"

export interface JibProviderConfig extends GenericProviderConfig {}
export interface JibProvider extends Provider<JibProviderConfig> {}

export const configSchema = () => providerConfigBaseSchema().unknown(false)

const moduleTypeUrl = getModuleTypeUrl("jib-container")
const containerModuleTypeUrl = getModuleTypeUrl("container")
const exampleUrl = getGitHubUrl("examples/jib-container")

const jibModuleSchema = () =>
  containerModuleSpecSchema().keys({
    build: baseBuildSpecSchema().keys({
      projectType: joi
        .string()
        .allow("gradle", "maven", "jib", "auto")
        .default("auto")
        .description(
          dedent`
          The type of project to build. Defaults to auto-detect between gradle and maven (based on which files/directories are found in the module root), but in some cases you may need to specify it.
          `
        ),
      jdkVersion: joi.number().integer().allow(8, 11).default(11).description("The JDK version to use."),
      tarOnly: joi
        .boolean()
        .default(false)
        .description(
          "Don't load or push the resulting image to a Docker daemon or registry, only build it as a tar file."
        ),
      tarFormat: joi
        .string()
        .allow("docker", "oci")
        .default("docker")
        .description("Specify the image format in the resulting tar file. Only used if `tarOnly: true`."),
      extraFlags: joi
        .array()
        .items(joi.string())
        .description(`Specify extra flags to pass to maven/gradle when building the container image.`),
    }),
  })

export const gardenPlugin = () =>
  createGardenPlugin({
    name: "jib",
    docs: dedent`
      **EXPERIMENTAL**: Please provide feedback via GitHub issues or our community forum!

      Provides support for [Jib](https://github.com/GoogleContainerTools/jib) via the [jib module type](${moduleTypeUrl}).

      Use this to efficiently build container images for Java services. Check out the [jib example](${exampleUrl}) to see it in action.
    `,
    dependencies: [{ name: "container" }],
    configSchema: configSchema(),
    createModuleTypes: [
      {
        name: "jib-container",
        base: "container",
        docs: dedent`
        Extends the [container module type](${containerModuleTypeUrl}) to build the image with [Jib](https://github.com/GoogleContainerTools/jib). Use this to efficiently build container images for Java services. Check out the [jib example](${exampleUrl}) to see it in action.

        The image is always built locally, directly from the module source directory (see the note on that below), before shipping the container image to the right place. You can set \`build.tarOnly: true\` to only build the image as a tarball.

        By default (and when not using remote building), the image is pushed to the local Docker daemon, to match the behavior of and stay compatible with normal \`container\` modules.

        When using remote building with the \`kubernetes\` provider, the image is synced to the cluster (where individual layers are cached) and then pushed to the deployment registry from there. This is to make sure any registry auth works seamlessly and exactly like for normal Docker image builds.

        Please consult the [Jib documentation](https://github.com/GoogleContainerTools/jib) for how to configure Jib in your Gradle or Maven project.

        To provide additional arguments to Gradle/Maven when building, you can set the \`extraFlags\` field.

        **Important note:** Unlike many other module types, \`jib\` modules are built from the module _source_ directory instead of the build staging directory, because of how Java projects are often laid out across a repository. This means \`build.dependencies[].copy\` directives are effectively ignored, and any include/exclude statements and .gardenignore files will not impact the build result. _Note that you should still configure includes, excludes and/or a .gardenignore to tell Garden which files to consider as part of the module version hash, to correctly detect whether a new build is required._
      `,
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
            // opposed to just fetched) by checking if a Dockerfile is found or specified.
            moduleConfig.buildConfig!.dockerfile = moduleConfig.spec.dockerfile = "_jib"

            return { moduleConfig }
          },

          async getModuleOutputs({ moduleConfig, version }) {
            const deploymentImageName = containerHelpers.getDeploymentImageName(moduleConfig, undefined)

            const localImageId = containerHelpers.getLocalImageId(moduleConfig, version)

            const deploymentImageId = containerHelpers.unparseImageId({
              repository: moduleConfig.spec.image || deploymentImageName,
              tag: version.versionString,
            })

            return {
              outputs: {
                "local-image-name": containerHelpers.getLocalImageName(moduleConfig),
                "local-image-id": localImageId,
                "deployment-image-name": deploymentImageName,
                "deployment-image-id": deploymentImageId,
              },
            }
          },

          async build(params: BuildModuleParams<JibContainerModule>) {
            const { ctx, log, module } = params
            const { tarOnly, jdkVersion } = module.spec.build

            const openJdk = ctx.tools["jib.openjdk-" + jdkVersion]
            const openJdkPath = await openJdk.getPath(log)

            const statusLine = log.placeholder({ level: LogLevel.verbose, childEntriesInheritLevel: true })

            let projectType = module.spec.build.projectType

            if (!projectType) {
              projectType = detectProjectType(module)
              statusLine.setState(renderOutputStream(`Detected project type ${projectType}`))
            }

            const outputStream = split2()
            let buildLog = ""

            outputStream.on("error", () => {})
            outputStream.on("data", (line: Buffer) => {
              const str = line.toString()
              statusLine.setState({ section: module.name, msg: str })
              buildLog += str
            })

            statusLine.setState({ section: module.name, msg: `Using JAVA_HOME=${openJdkPath}` })

            const { flags, tarPath } = getBuildFlags(module, projectType)

            if (projectType === "maven") {
              await mvn({
                ctx,
                log,
                cwd: module.path,
                args: ["compile", "jib:buildTar", ...flags],
                openJdkPath,
                outputStream,
              })
            } else {
              await gradle({
                ctx,
                log,
                cwd: module.path,
                args: ["jibBuildTar", ...flags],
                openJdkPath,
                outputStream,
              })
            }

            if (!tarOnly) {
              statusLine.setState({ section: module.name, msg: "Loading image to Docker daemon" })
              await containerHelpers.dockerCli({
                ctx,
                cwd: module.path,
                args: ["load", "--input", tarPath],
                log,
              })
            }

            return {
              fetched: false,
              buildLog,
              details: {
                tarPath,
              },
            }
          },
        },
      },
    ],
    tools: [mavenSpec, gradleSpec, ...openJdkSpecs],
  })
