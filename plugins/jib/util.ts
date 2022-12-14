/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"
import { GardenModule } from "@garden-io/sdk/types"
import { ConfigurationError } from "@garden-io/core/build/src/exceptions"
import { getDockerBuildArgs } from "@garden-io/core/build/src/plugins/container/build"
import { ContainerBuildSpec, ContainerModuleSpec } from "@garden-io/core/build/src/plugins/container/config"

interface JibModuleBuildSpec extends ContainerBuildSpec {
  dockerBuild?: boolean
  projectType: "gradle" | "maven" | "mavend" | "auto"
  jdkVersion: number
  jdkPath?: string
  tarOnly?: boolean
  tarFormat: "docker" | "oci"
  mavenPath?: string
  mavendPath?: string
  mavenPhases: string[]
  gradlePath?: string
}

interface JibModuleSpec extends ContainerModuleSpec {
  build: JibModuleBuildSpec
}

export type JibContainerModule = GardenModule<JibModuleSpec>
export type JibPluginType = "gradle" | "maven"

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

export function detectProjectType(module: GardenModule): JibPluginType {
  const moduleFiles = module.version.files

  // TODO: support the Jib CLI

  for (const filename of gradlePaths) {
    const path = resolve(module.path, filename)
    if (moduleFiles.includes(path)) {
      return "gradle"
    }
  }

  for (const filename of mavenPaths) {
    const path = resolve(module.path, filename)
    if (moduleFiles.includes(path)) {
      return "maven"
    }
  }

  throw new ConfigurationError(`Could not detect a gradle or maven project to build module ${module.name}`, {})
}

export function getBuildFlags(module: JibContainerModule, projectType: JibModuleBuildSpec["projectType"]) {
  const { tarOnly, tarFormat, dockerBuild } = module.spec.build

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
  const basenameSuffix = `-${module.name}-${module.version.versionString}`
  const tarFilename = `jib-image${basenameSuffix}.tar`

  // TODO: don't assume module path is the project root
  const tarPath = resolve(module.path, targetDir, tarFilename)

  const dockerBuildArgs = getDockerBuildArgs(module)
  const imageId = module.outputs["deployment-image-id"]

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

  args.push(...(module.spec.extraFlags || []))

  return { args, tarPath }
}
