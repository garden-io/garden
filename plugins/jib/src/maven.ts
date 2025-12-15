/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
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

export const mvnVersion = "3.9.9"

const spec = {
  url: `https://archive.apache.org/dist/maven/maven-3/${mvnVersion}/binaries/apache-maven-${mvnVersion}-bin.tar.gz`,
  sha256: "7a9cdf674fc1703d6382f5f330b3d110ea1b512b51f1652846d9e4e8a588d766",
  extract: {
    format: "tar",
    targetPath: `apache-maven-${mvnVersion}/bin/mvn`,
  },
}

export const mavenSpec: PluginToolSpec = {
  name: "maven",
  version: mvnVersion,
  description: `The Maven CLI, v${mvnVersion}`,
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
      url: `https://archive.apache.org/dist/maven/maven-3/${mvnVersion}/binaries/apache-maven-${mvnVersion}-bin.zip`,
      sha256: "4ec3f26fb1a692473aea0235c300bd20f0f9fe741947c82c1234cefd76ac3a3c",
      extract: {
        format: "zip",
        targetPath: spec.extract.targetPath + ".cmd",
      },
    },
  ],
}

export function getMvnTool(ctx: PluginContext) {
  const tool = find(ctx.tools, (_, k) => k.endsWith(".maven"))

  if (!tool) {
    throw new PluginError({ message: `Could not find configured maven tool` })
  }

  return tool
}

let mavenPathValid = false

async function verifyMavenPath(params: VerifyBinaryParams) {
  if (mavenPathValid) {
    return
  }
  await verifyBinaryPath(params)
  mavenPathValid = true
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
  binaryPath,
  concurrentMavenBuilds,
  outputStream,
}: BuildToolParams) {
  let mvnPath: string
  if (!!binaryPath) {
    log.verbose(`Using explicitly specified Maven binary from ${binaryPath}`)
    mvnPath = binaryPath
    await verifyMavenPath({
      binaryPath,
      toolName: "Maven",
      configFieldName: "mavenPath",
      outputVerificationString: "maven",
    })
  } else {
    log.verbose(`The Maven binary hasn't been specified explicitly. Maven ${mvnVersion} will be used by default.`)
    const tool = getMvnTool(ctx)
    mvnPath = await tool.ensurePath(log)
  }

  log.debug(`Execing ${mvnPath} ${args.join(" ")}`)
  const params = { binaryPath: mvnPath, args, cwd, openJdkPath, outputStream }
  if (concurrentMavenBuilds) {
    return runBuildTool(params)
  } else {
    // Maven has issues when running concurrent processes, so we're working around that with a lock.
    // TODO: http://takari.io/book/30-team-maven.html would be a more robust solution.
    return buildLock.acquire("mvn", async () => {
      return runBuildTool(params)
    })
  }
}
