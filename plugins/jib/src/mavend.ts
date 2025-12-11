/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import AsyncLock from "async-lock"
import type { PluginContext, PluginToolSpec } from "@garden-io/sdk/build/src/types.js"
import { find } from "lodash-es"
import { PluginError } from "@garden-io/core/build/src/exceptions.js"
import type { BuildToolParams, VerifyBinaryParams } from "./build-tool-base.js"
import { runBuildTool, verifyBinaryPath } from "./build-tool-base.js"

const buildLock = new AsyncLock()

export const mvndVersion = "1.0.2"

const mvndSpec = {
  baseUrl: `https://github.com/apache/maven-mvnd/releases/download/${mvndVersion}/`,
  // 1.0.2 still has no ARM64 build for linux
  linux_amd64: {
    filename: `maven-mvnd-${mvndVersion}-linux-amd64.tar.gz`,
    sha256: "a5990f4cfd4aa3307a4c5c86d6cfdd13a0bd394a6b07c6bb64efa7decb342205",
    targetPath: `maven-mvnd-${mvndVersion}-linux-amd64/bin/mvnd`,
  },
  darwin_arm64: {
    filename: `maven-mvnd-${mvndVersion}-darwin-aarch64.tar.gz`,
    sha256: "a0f9fe345ca76726806fc17ef78caf73e3e1887921c8c156d53341564803e24b",
    targetPath: `maven-mvnd-${mvndVersion}-darwin-aarch64/bin/mvnd`,
  },
  darwin_amd64: {
    filename: `maven-mvnd-${mvndVersion}-darwin-amd64.tar.gz`,
    sha256: "926b0512ac3df2dd05770f61eeafbf97cfeafd14bb903fdea90b34bc8165ad21",
    targetPath: `maven-mvnd-${mvndVersion}-darwin-amd64/bin/mvnd`,
  },
  windows: {
    filename: `maven-mvnd-${mvndVersion}-windows-amd64.zip`,
    sha256: "c48cdbee495b6d93a171648801a4485bef10f1f0d0ee3eb64a5ee67f8ae77461",
    targetPath: `maven-mvnd-${mvndVersion}-windows-amd64/bin/mvnd.cmd`,
  },
}

export const mavendSpec: PluginToolSpec = {
  name: "mavend",
  version: mvndVersion,
  description: `The Maven Daemon CLI, v${mvndVersion}`,
  type: "binary",
  builds: [
    {
      platform: "linux",
      architecture: "amd64",
      sha256: mvndSpec.linux_amd64.sha256,
      url: `${mvndSpec.baseUrl}${mvndSpec.linux_amd64.filename}`,
      extract: {
        format: "tar",
        targetPath: mvndSpec.linux_amd64.targetPath,
      },
    },
    {
      platform: "darwin",
      architecture: "amd64",
      sha256: mvndSpec.darwin_amd64.sha256,
      url: `${mvndSpec.baseUrl}${mvndSpec.darwin_amd64.filename}`,
      extract: {
        format: "tar",
        targetPath: mvndSpec.darwin_amd64.targetPath,
      },
    },
    {
      platform: "darwin",
      architecture: "arm64",
      sha256: mvndSpec.darwin_arm64.sha256,
      url: `${mvndSpec.baseUrl}${mvndSpec.darwin_arm64.filename}`,
      extract: {
        format: "tar",
        targetPath: mvndSpec.darwin_arm64.targetPath,
      },
    },
    {
      platform: "windows",
      architecture: "amd64",
      url: `${mvndSpec.baseUrl}${mvndSpec.windows.filename}`,
      sha256: mvndSpec.windows.sha256,
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
    throw new PluginError({ message: `Could not find configured maven daemon tool` })
  }

  return tool
}

let mavendPathValid = false

async function verifyMavendPath(params: VerifyBinaryParams) {
  if (mavendPathValid) {
    return
  }
  await verifyBinaryPath(params)
  mavendPathValid = true
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
  binaryPath,
  concurrentMavenBuilds,
  outputStream,
}: BuildToolParams) {
  let mvndPath: string
  if (!!binaryPath) {
    log.verbose(`Using explicitly specified Maven Daemon binary from ${binaryPath}`)
    mvndPath = binaryPath
    await verifyMavendPath({
      binaryPath,
      toolName: "Maven Daemon",
      configFieldName: "mavendPath",
      outputVerificationString: "mvnd",
    })
  } else {
    log.verbose(
      `The Maven Daemon binary hasn't been specified explicitly. Maven ${mvndVersion} will be used by default.`
    )
    const tool = getMvndTool(ctx)
    mvndPath = await tool.ensurePath(log)
  }

  log.debug(`Execing ${mvndPath} ${args.join(" ")}`)
  const params = { binaryPath: mvndPath, args, cwd, openJdkPath, outputStream }
  if (concurrentMavenBuilds) {
    return runBuildTool(params)
  } else {
    return buildLock.acquire("mvnd", async () => {
      return runBuildTool(params)
    })
  }
}
