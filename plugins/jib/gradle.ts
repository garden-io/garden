/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import execa from "execa"
import { find } from "lodash"
// import { PluginToolSpec, PluginContext, LogEntry } from "@garden-io/sdk/types"
import { PluginContext, LogEntry } from "@garden-io/sdk/types"
import { PluginError } from "@garden-io/core/build/src/exceptions"
import { resolve } from "path"
import { pathExists } from "fs-extra"
import { Writable } from "stream"

const spec = {
  url: "https://services.gradle.org/distributions/gradle-7.1.1-bin.zip",
  sha256: "bf8b869948901d422e9bb7d1fa61da6a6e19411baa7ad6ee929073df85d6365d",
  extract: {
    format: "zip",
    targetPath: "gradle-7.1.1/bin/gradle",
  },
}

export const gradleSpec: any = {
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

/**
 * Run gradle with the specified args in the specified directory. If that directory contains a `./gradlew` script, we
 * use that. Otherwise we download gradle and use that.
 */
export async function gradle({
  ctx,
  args,
  cwd,
  log,
  openJdkPath,
  outputStream,
}: {
  ctx: PluginContext
  args: string[]
  cwd: string
  log: LogEntry
  openJdkPath: string
  outputStream: Writable
}) {
  const gradlewPath = resolve(cwd, process.platform === "win32" ? "gradlew.bat" : "gradlew")

  let gradlePath = gradlewPath

  if (!(await pathExists(gradlePath))) {
    const tool = getGradleTool(ctx)
    gradlePath = await tool.getPath(log)
  }

  log.debug(`Execing ${gradlePath} ${args.join(" ")}`)

  const res = execa(gradlePath, args, {
    cwd,
    env: {
      JAVA_HOME: openJdkPath,
    },
  })

  res.stdout?.pipe(outputStream)
  res.stderr?.pipe(outputStream)

  return res
}
