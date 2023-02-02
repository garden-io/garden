/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import execa from "execa"
import { find } from "lodash"
import { LogEntry, PluginContext, PluginToolSpec } from "@garden-io/sdk/types"
import { PluginError, RuntimeError } from "@garden-io/core/build/src/exceptions"
import { resolve } from "path"
import { pathExists } from "fs-extra"
import { Writable } from "stream"

export const gradleVersion = "7.5.1"

const spec = {
  url: `https://services.gradle.org/distributions/gradle-${gradleVersion}-bin.zip`,
  sha256: "f6b8596b10cce501591e92f229816aa4046424f3b24d771751b06779d58c8ec4",
  extract: {
    format: "zip",
    targetPath: `gradle-${gradleVersion}/bin/gradle`,
  },
}

export const gradleSpec: PluginToolSpec = {
  name: "gradle",
  description: "The gradle CLI.",
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
    throw new PluginError(`Could not find configured gradle tool`, { tools: ctx.tools })
  }

  return tool
}

const baseErrorMessage = (gradlePath: string): string =>
  `Gradle binary path "${gradlePath}" is incorrect! Please check the \`gradlePath\` configuration option.`

async function checkGradleVersion(gradlePath: string) {
  try {
    const res = await execa(gradlePath, ["--version"])
    return res.stdout
  } catch (err) {
    const composeErrorMessage = (err: any): string => {
      if (err.code === "EACCES") {
        return `${baseErrorMessage(
          gradlePath
        )} It looks like the Gradle path defined in the config is not an executable binary.`
      } else if (err.code === "ENOENT") {
        return `${baseErrorMessage(gradlePath)} The Gradle path defined in the configuration does not exist.`
      } else {
        return baseErrorMessage(gradlePath)
      }
    }
    throw new RuntimeError(composeErrorMessage(err), { gradlePath })
  }
}

let gradlePathValid = false

async function verifyGradlePath(gradlePath: string) {
  if (gradlePathValid) {
    return
  }

  const versionOutput = await checkGradleVersion(gradlePath)
  const isGradle = versionOutput.toLowerCase().includes("gradle")
  if (!isGradle) {
    throw new RuntimeError(
      `${baseErrorMessage(gradlePath)} It looks like the Gradle path points to a non-Gradle executable binary.`,
      { gradlePath }
    )
  }
  gradlePathValid = true
}

/**
 * Run gradle with the specified args in the specified directory {@code cwd}.
 *
 * If {@code gradlePath} is provided explicitly, it will be used as a Gradle binary.
 * If no explicit binary specific, then a `./gradlew` script will be used if it's available in the specified directory.
 * Otherwise, the Gradle distribution will be downloaded and used.
 */
export async function gradle({
  ctx,
  args,
  cwd,
  log,
  openJdkPath,
  gradlePath,
  outputStream,
}: {
  ctx: PluginContext
  args: string[]
  cwd: string
  log: LogEntry
  openJdkPath: string
  gradlePath?: string
  outputStream: Writable
}) {
  let effectiveGradlePath: string

  if (!!gradlePath) {
    log.verbose(`Using explicitly specified Gradle binary from ${gradlePath}`)
    effectiveGradlePath = gradlePath
    await verifyGradlePath(effectiveGradlePath)
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
      effectiveGradlePath = await tool.getPath(log)
    }
  }

  log.debug(`Execing ${effectiveGradlePath} ${args.join(" ")}`)

  const res = execa(effectiveGradlePath, args, {
    cwd,
    env: {
      JAVA_HOME: openJdkPath,
    },
  })

  res.stdout?.pipe(outputStream)
  res.stderr?.pipe(outputStream)

  return res
}
