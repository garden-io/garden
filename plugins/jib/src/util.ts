/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"
import type { GardenModule } from "@garden-io/sdk/build/src/types.js"
import { ConfigurationError } from "@garden-io/core/build/src/exceptions.js"
import { getDockerBuildArgs } from "@garden-io/core/build/src/plugins/container/build.js"
import type {
  ContainerBuildActionSpec,
  ContainerModuleBuildSpec,
  ContainerModuleSpec,
} from "@garden-io/core/build/src/plugins/container/moduleConfig.js"
import type { BuildAction, BuildActionConfig, ResolvedBuildAction } from "@garden-io/core/build/src/actions/build.js"
import type { ContainerBuildOutputs } from "@garden-io/core/build/src/plugins/container/config.js"
import type { Resolved } from "@garden-io/core/build/src/actions/types.js"
import type { ActionLog } from "@garden-io/core/build/src/logger/log-entry.js"

import fsExtra from "fs-extra"
const { pathExists } = fsExtra

interface JibBuildSpec {
  dockerBuild?: boolean
  projectType: "gradle" | "maven" | "mavend" | "auto"
  jdkVersion: number
  jdkPath?: string
  tarOnly?: boolean
  tarFormat: "docker" | "oci"
  mavenPath?: string
  mavendPath?: string
  mavenPhases: string[]
  concurrentMavenBuilds?: boolean
  gradlePath?: string
}

type JibModuleBuildSpec = ContainerModuleBuildSpec & JibBuildSpec

interface JibModuleSpec extends ContainerModuleSpec {
  build: JibModuleBuildSpec
}

export type JibBuildActionSpec = ContainerBuildActionSpec & JibBuildSpec
export type JibBuildConfig = BuildActionConfig<"jib-container", JibBuildActionSpec>
export type JibBuildAction = BuildAction<JibBuildConfig, ContainerBuildOutputs, Record<string, unknown>>

export type JibContainerModule = GardenModule<JibModuleSpec>
export type JibPluginType = "gradle" | "maven" | "mavend"

const gradlePaths = [
  "build.gradle",
  "build.gradle.kts",
  "gradle.properties",
  "settings.gradle",
  "gradlew",
  "gradlew.bat",
  "gradlew.cmd",
]
const mavenPaths = ["pom.xml", ".mvn"]
const mavendPaths = ["pom.xml", ".mvnd"]

export async function detectProjectType(action: ResolvedBuildAction): Promise<JibPluginType> {
  // TODO: support the Jib CLI

  for (const filename of gradlePaths) {
    const path = resolve(action.getBuildPath(), filename)
    if (await pathExists(path)) {
      return "gradle"
    }
  }

  for (const filename of mavenPaths) {
    const path = resolve(action.getBuildPath(), filename)
    if (await pathExists(path)) {
      return "maven"
    }
  }

  for (const filename of mavendPaths) {
    const path = resolve(action.getBuildPath(), filename)
    if (await pathExists(path)) {
      return "mavend"
    }
  }

  throw new ConfigurationError({
    message: `Could not detect a gradle or maven project to build ${action.longDescription()}`,
  })
}

export function getBuildFlags(
  log: ActionLog,
  action: Resolved<JibBuildAction>,
  projectType: JibModuleBuildSpec["projectType"]
) {
  const { tarOnly, tarFormat, dockerBuild, extraFlags, buildArgs } = action.getSpec()

  let targetDir: string
  let target: string

  if (projectType === "maven" || projectType === "mavend") {
    targetDir = "target"
    if (tarOnly) {
      target = "jib:buildTar"
    } else if (dockerBuild) {
      target = "jib:dockerBuild"
    } else {
      target = "jib:build"
    }
  } else {
    targetDir = "build"
    if (tarOnly) {
      target = "jibBuildTar"
    } else if (dockerBuild) {
      target = "jibDockerBuild"
    } else {
      target = "jib"
    }
  }

  // Make sure the target directory is scoped by module name, in case there are multiple modules in a project
  const basenameSuffix = `-${action.name}-${action.versionString(log)}`
  const tarFilename = `jib-image${basenameSuffix}.tar`

  // TODO: don't assume action path is the project root
  // Unlike many other types,
  // jib-container builds are done from the source directory instead of the build staging directory.
  const tarPath = resolve(action.sourcePath(), targetDir, tarFilename)

  const dockerBuildArgs = getDockerBuildArgs(action.versionString(log), buildArgs)
  const outputs = action.getOutputs()
  const imageId = outputs.deploymentImageId

  const args = [
    target,
    "-Djib.to.image=" + imageId,
    "-Djib.container.args=" + dockerBuildArgs.join(","),
    "-Dstyle.color=always",
    "-Djansi.passthrough=true",
    "-Djib.console=plain",
  ]

  if (tarOnly) {
    args.push(
      `-Djib.outputPaths.tar=${targetDir}/${tarFilename}`,
      `-Djib.outputPaths.digest=${targetDir}/jib-image${basenameSuffix}.digest`,
      `-Djib.outputPaths.imageId=${targetDir}/jib-image${basenameSuffix}.id`,
      `-Djib.outputPaths.imageJson=${targetDir}/jib-image${basenameSuffix}.json`
    )

    if (tarFormat === "oci") {
      args.push("-Djib.container.format=OCI")
    }
  }

  args.push(...(extraFlags || []))

  return { args, tarPath }
}
