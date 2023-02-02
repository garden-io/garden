/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import AsyncLock from "async-lock"
import { LogEntry, PluginContext, PluginToolSpec } from "@garden-io/sdk/types"
import { find } from "lodash"
import { PluginError } from "@garden-io/core/build/src/exceptions"
import { Writable } from "node:stream"
import execa from "execa"

const buildLock = new AsyncLock()

const mvndVersion = "0.8.2"
const mvndSpec = {
  description: "The Maven Daemon CLI.",
  baseUrl: `https://github.com/apache/maven-mvnd/releases/download/${mvndVersion}/`,
  linux: {
    filename: `maven-mvnd-${mvndVersion}-linux-amd64.tar.gz`,
    sha256: "5bcd4c3e45b767d562aa8d81583461abeb4fd6626ea1b8a1d961f34ef472f115",
    targetPath: `maven-mvnd-${mvndVersion}-linux-amd64/bin/mvnd`,
  },
  darwin_aarch64: {
    filename: `maven-mvnd-${mvndVersion}-darwin-aarch64.tar.gz`,
    sha256: "b3fab0126188072ea80784c4bcc726bf398e0115ed37f3e243e14c84a2fe7e45",
    targetPath: `maven-mvnd-${mvndVersion}-darwin-aarch64/bin/mvnd`,
  },
  darwin_amd64: {
    filename: `maven-mvnd-${mvndVersion}-darwin-amd64.tar.gz`,
    sha256: "889278f2e2a88450dcb074558a136fe06f9874db9b8d224674a5163a92ef2b69",
    targetPath: `maven-mvnd-${mvndVersion}-darwin-amd64/bin/mvnd`,
  },
  windows: {
    filename: `maven-mvnd-${mvndVersion}-windows-amd64.zip`,
    sha256: "bfe6115b643ecb54b52a46df9e5b790035e54e67e21c10f964c7d58f633b7f22",
    targetPath: `maven-mvnd-${mvndVersion}-windows-amd64/bin/mvnd.cmd`,
  },
}

export const mavendSpec: PluginToolSpec = {
  name: "mavend",
  description: "The Maven Daemon CLI.",
  type: "binary",
  builds: [
    {
      platform: "linux",
      architecture: "amd64",
      sha256: mvndSpec.linux.sha256,
      url: `${mvndSpec.baseUrl}${mvndSpec.linux.filename}`,
      extract: {
        format: "tar",
        targetPath: mvndSpec.linux.targetPath,
      },
    },
    {
      platform: "darwin",
      architecture: "amd64",
      sha256: mvndSpec.linux.sha256,
      url: `${mvndSpec.baseUrl}${mvndSpec.darwin_amd64.filename}`,
      extract: {
        format: "tar",
        targetPath: mvndSpec.darwin_amd64.targetPath,
      },
    },
    {
      platform: "darwin",
      architecture: "aarch64",
      sha256: mvndSpec.linux.sha256,
      url: `${mvndSpec.baseUrl}${mvndSpec.darwin_aarch64.filename}`,
      extract: {
        format: "tar",
        targetPath: mvndSpec.darwin_aarch64.targetPath,
      },
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: `${mvndSpec.baseUrl}${mvndSpec.windows.filename}`,
      sha256: "d53e045bc5c02aad179fae2fbc565d953354880db6661a8fab31f3a718d7b62c",
      extract: {
        format: "zip",
        targetPath: mvndSpec.windows.targetPath,
      },
    },
  ],
}

export function getMvndTool(ctx: PluginContext) {
  const tool = find(ctx.tools, (_, k) => k.endsWith(".mavend"))

  if (!tool) {
    throw new PluginError(`Could not find configured maven daemon tool`, { tools: ctx.tools })
  }

  return tool
}

/**
 * Run mavend with the specified args in the specified directory.
 */
export async function mvnd({
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
  let mvndPath: string
  log.verbose(`The Maven Daemon binary hasn't been specified explicitly. Maven ${mvndVersion} will be used by default.`)

  const tool = getMvndTool(ctx)
  mvndPath = await tool.getPath(log)

  return buildLock.acquire("mvnd", async () => {
    log.debug(`Execing ${mvndPath} ${args.join(" ")}`)

    const res = execa(mvndPath, args, {
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
