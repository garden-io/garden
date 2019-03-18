/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as Joi from "joi"
import { omit, pick, get } from "lodash"
import { copy, pathExists, readFile } from "fs-extra"
import { GardenPlugin } from "../../types/plugin/plugin"
import {
  ContainerModuleSpec,
  ContainerServiceSpec,
  ContainerTestSpec,
  ContainerModuleConfig,
  ContainerTaskSpec,
} from "../container/config"
import { validateWithPath, joiArray } from "../../config/common"
import { BuildModuleParams, ConfigureModuleParams, GetBuildStatusParams } from "../../types/plugin/params"
import { Module } from "../../types/module"
import { configureContainerModule, gardenPlugin as containerPlugin } from "../container/container"
import { buildContainerModule, getContainerBuildStatus } from "../container/build"
import { resolve } from "path"
import { RuntimeError, ConfigurationError } from "../../exceptions"
import { containerHelpers } from "../container/helpers"
import { STATIC_DIR } from "../../constants"
import { xml2json } from "xml-js"
import { containerModuleSpecSchema } from "../container/config"
import { providerConfigBaseSchema } from "../../config/project"
import { openJdks } from "./openjdk"
import { maven } from "./maven"
import { LogEntry } from "../../logger/log-entry"

const defaultDockerfilePath = resolve(STATIC_DIR, "maven-container", "Dockerfile")

interface MavenContainerModuleSpec extends ContainerModuleSpec {
  jarPath: string
  jdkVersion: number
  mvnOpts: string[]
}

// type MavenContainerModuleConfig = ModuleConfig<MavenContainerModuleSpec>

export interface MavenContainerModule<
  M extends MavenContainerModuleSpec = MavenContainerModuleSpec,
  S extends ContainerServiceSpec = ContainerServiceSpec,
  T extends ContainerTestSpec = ContainerTestSpec,
  W extends ContainerTaskSpec = ContainerTaskSpec
  > extends Module<M, S, T, W> { }

const mavenKeys = {
  jarPath: Joi.string()
    .required()
    .description("The path to the packaged JAR artifact, relative to the module directory.")
    .example("target/my-module.jar"),
  jdkVersion: Joi.number()
    .integer()
    .allow(8, 11)
    .default(8)
    .description("The JDK version to use."),
  mvnOpts: joiArray(Joi.string())
    .description("Options to add to the `mvn package` command when building."),
}

const mavenFieldsSchema = Joi.object()
  .keys(mavenKeys)

export const mavenContainerModuleSpecSchema = containerModuleSpecSchema.keys(mavenKeys)
export const mavenContainerConfigSchema = providerConfigBaseSchema

export const gardenPlugin = (): GardenPlugin => {
  const basePlugin = containerPlugin()

  return {
    ...basePlugin,
    moduleActions: {
      "maven-container": {
        ...basePlugin.moduleActions!.container,
        configure: configureMavenContainerModule,
        getBuildStatus,
        build,
      },
    },
  }
}

export async function configureMavenContainerModule(params: ConfigureModuleParams<MavenContainerModule>) {
  const { ctx, moduleConfig } = params

  const mavenFields = validateWithPath({
    config: pick(params.moduleConfig.spec, Object.keys(mavenKeys)),
    schema: mavenFieldsSchema,
    name: moduleConfig.name,
    path: moduleConfig.path,
    projectRoot: ctx.projectRoot,
  })

  let containerConfig: ContainerModuleConfig = { ...moduleConfig }
  containerConfig.spec = <ContainerModuleSpec>omit(moduleConfig.spec, Object.keys(mavenKeys))

  const jdkVersion = mavenFields.jdkVersion!

  containerConfig.spec.buildArgs = {
    JAR_PATH: "app.jar",
    JDK_VERSION: jdkVersion.toString(),
  }

  const configured = await configureContainerModule({ ...params, moduleConfig: containerConfig })

  return {
    ...configured,
    spec: {
      ...configured.spec,
      ...mavenFields,
    },
  }
}

async function getBuildStatus(params: GetBuildStatusParams<MavenContainerModule>) {
  const { module, log } = params

  await prepareBuild(module, log)

  return getContainerBuildStatus(params)
}

async function build(params: BuildModuleParams<MavenContainerModule>) {
  // Run the maven build
  const { ctx, module, log } = params
  let { jarPath, jdkVersion, mvnOpts } = module.spec

  const pom = await loadPom(module.path)
  const artifactId = get(pom, ["project", "artifactId", "_text"])

  if (!artifactId) {
    throw new ConfigurationError(`Could not read artifact ID from pom.xml in ${module.path}`, { path: module.path })
  }

  log.setState(`Creating jar artifact...`)

  const openJdk = openJdks[jdkVersion]
  const openJdkPath = await openJdk.getPath(log)

  const mvnArgs = [
    "package",
    "--batch-mode",
    "--projects", ":" + artifactId,
    "--also-make",
    ...mvnOpts,
  ]
  const mvnCmdStr = "mvn " + mvnArgs.join(" ")

  await maven.exec({
    args: mvnArgs,
    cwd: ctx.projectRoot,
    log,
    env: {
      JAVA_HOME: openJdkPath,
    },
  })

  // Copy the artifact to the module build directory
  const resolvedJarPath = resolve(module.path, jarPath)

  if (!(await pathExists(resolvedJarPath))) {
    throw new RuntimeError(
      `Could not find artifact at ${resolvedJarPath} after running '${mvnCmdStr}'`,
      { jarPath, mvnArgs },
    )
  }

  await copy(resolvedJarPath, resolve(module.buildPath, "app.jar"))

  // Build the container
  await prepareBuild(module, log)
  return buildContainerModule(params)
}

async function prepareBuild(module: MavenContainerModule, log: LogEntry) {
  // Copy the default Dockerfile to the build directory, if the module doesn't provide one
  // Note: Doing this here so that the build status check works as expected.
  if (!(await containerHelpers.hasDockerfile(module))) {
    log.debug(`Using default Dockerfile`)
    await copy(defaultDockerfilePath, resolve(module.buildPath, "Dockerfile"))
  }
}

async function loadPom(dir: string) {
  try {
    const pomPath = resolve(dir, "pom.xml")
    const pomData = await readFile(pomPath)
    return JSON.parse(xml2json(pomData.toString(), { compact: true }))
  } catch (err) {
    throw new ConfigurationError(`Could not load pom.xml from directory ${dir}`, { dir })
  }
}
