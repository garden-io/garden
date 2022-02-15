/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import AsyncLock from "async-lock"
import { PluginToolSpec, PluginContext, LogEntry } from "@garden-io/sdk/types"
import { find } from "lodash"
import { PluginError } from "@garden-io/core/build/src/exceptions"
import { Writable } from "node:stream"
import execa from "execa"

const buildLock = new AsyncLock()

const spec = {
  url: "https://archive.apache.org/dist/maven/maven-3/3.6.3/binaries/apache-maven-3.6.3-bin.tar.gz",
  sha256: "26ad91d751b3a9a53087aefa743f4e16a17741d3915b219cf74112bf87a438c5",
  extract: {
    format: "tar",
    targetPath: "apache-maven-3.6.3/bin/mvn",
  },
}

export const mavenSpec: PluginToolSpec = {
  name: "maven",
  description: "The Maven CLI.",
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

export function getMvnTool(ctx: PluginContext) {
  const tool = find(ctx.tools, (_, k) => k.endsWith(".maven"))

  if (!tool) {
    throw new PluginError(`Could not find configured maven tool`, { tools: ctx.tools })
  }

  return tool
}

/**
 * Run maven with the specified args in the specified directory.
 */
export async function mvn({
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
  outputStream?: Writable
}) {
  const tool = getMvnTool(ctx)
  const mvnPath = await tool.getPath(log)

  // Maven has issues when running concurrent processes, so we're working around that with a lock.
  // TODO: http://takari.io/book/30-team-maven.html would be a more robust solution.
  return buildLock.acquire("mvn", async () => {
    log.debug(`Execing ${mvnPath} ${args.join(" ")}`)

    const res = execa(mvnPath, args, {
      cwd,
      env: {
        JAVA_HOME: openJdkPath,
      },
    })

    if (outputStream) {
      res.stdout?.pipe(outputStream)
      res.stderr?.pipe(outputStream)
    }

    return res
  })
}
