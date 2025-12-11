/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { find } from "lodash-es"
import type { PluginContext, PluginToolSpec } from "@garden-io/sdk/build/src/types.js"
import { PluginError } from "@garden-io/core/build/src/exceptions.js"
import { resolve } from "path"
import fsExtra from "fs-extra"
const { pathExists } = fsExtra
import type { BuildToolParams, VerifyBinaryParams } from "./build-tool-base.js"
import { runBuildTool, verifyBinaryPath } from "./build-tool-base.js"

export const gradleVersion = "7.6.4"

const spec = {
  url: `https://services.gradle.org/distributions/gradle-${gradleVersion}-bin.zip`,
  sha256: "bed1da33cca0f557ab13691c77f38bb67388119e4794d113e051039b80af9bb1",
  extract: {
    format: "zip",
    targetPath: `gradle-${gradleVersion}/bin/gradle`,
  },
}

export const gradleSpec: PluginToolSpec = {
  name: "gradle",
  version: gradleVersion,
  description: `The gradle CLI, v${gradleVersion}`,
  type: "binary",
  builds: [
    {
      platform: "darwin",
      architecture: "amd64",
      ...spec,
    },
    {
      platform: "darwin",
      architecture: "arm64",
      ...spec,
    },
    {
      platform: "linux",
      architecture: "amd64",
      ...spec,
    },
    {
      platform: "linux",
      architecture: "arm64",
      ...spec,
    },
    {
      platform: "windows",
      architecture: "amd64",
      ...spec,
      extract: {
        format: "zip",
        targetPath: spec.extract.targetPath + ".bat",
      },
    },
  ],
}

export function getGradleTool(ctx: PluginContext) {
  const tool = find(ctx.tools, (_, k) => k.endsWith(".gradle"))

  if (!tool) {
    throw new PluginError({ message: `Could not find configured gradle tool` })
  }

  return tool
}

let gradlePathValid = false

async function verifyGradlePath(params: VerifyBinaryParams) {
  if (gradlePathValid) {
    return
  }
  await verifyBinaryPath(params)
  gradlePathValid = true
}

/**
 * Run gradle with the specified args in the specified directory {@code cwd}.
 *
 * If {@code gradlePath} is provided explicitly, it will be used as a Gradle binary.
 * If no explicit binary specific, then a `./gradlew` script will be used if it's available in the specified directory.
 * Otherwise, the Gradle distribution will be downloaded and used.
 */
export async function gradle({ ctx, args, cwd, log, openJdkPath, binaryPath, outputStream }: BuildToolParams) {
  let effectiveGradlePath: string
  if (!!binaryPath) {
    log.verbose(`Using explicitly specified Gradle binary from ${binaryPath}`)
    effectiveGradlePath = binaryPath
    await verifyGradlePath({
      binaryPath,
      toolName: "Gradle",
      configFieldName: "gradlePath",
      outputVerificationString: "gradle",
    })
  } else {
    const gradlewPath = resolve(cwd, process.platform === "win32" ? "gradlew.bat" : "gradlew")
    if (await pathExists(gradlewPath)) {
      log.verbose(
        `The Gradle binary hasn't been specified explicitly, but a local one has been found at ${gradlewPath}. It will be used by default.`
      )
      effectiveGradlePath = gradlewPath
    } else {
      log.verbose(
        `The Gradle binary hasn't been specified explicitly. Gradle ${gradleVersion} will be used by default.`
      )
      const tool = getGradleTool(ctx)
      effectiveGradlePath = await tool.ensurePath(log)
    }
  }

  log.debug(`Execing ${effectiveGradlePath} ${args.join(" ")}`)
  return runBuildTool({ binaryPath: effectiveGradlePath, args, cwd, openJdkPath, outputStream })
}
