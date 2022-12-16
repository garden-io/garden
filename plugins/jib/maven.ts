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
import { PluginError, RuntimeError } from "@garden-io/core/build/src/exceptions"
import { Writable } from "node:stream"
import execa from "execa"

const buildLock = new AsyncLock()

const mvnVersion = "3.8.5"

const spec = {
  url: `https://archive.apache.org/dist/maven/maven-3/${mvnVersion}/binaries/apache-maven-${mvnVersion}-bin.tar.gz`,
  sha256: "88e30700f32a3f60e0d28d0f12a3525d29b7c20c72d130153df5b5d6d890c673",
  extract: {
    format: "tar",
    targetPath: `apache-maven-${mvnVersion}/bin/mvn`,
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
      url: `https://archive.apache.org/dist/maven/maven-3/${mvnVersion}/binaries/apache-maven-${mvnVersion}-bin.zip`,
      sha256: "d53e045bc5c02aad179fae2fbc565d953354880db6661a8fab31f3a718d7b62c",
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
    throw new PluginError(`Could not find configured maven tool`, { tools: ctx.tools })
  }

  return tool
}

const baseErrorMessage = (mvnPath: string): string =>
  `Maven binary path "${mvnPath}" is incorrect! Please check the \`mavenPath\` configuration option.`

async function checkMavenVersion(mvnPath: string) {
  try {
    const res = await execa(mvnPath, ["--version"])
    return res.stdout
  } catch (err) {
    const composeErrorMessage = (err: any): string => {
      if (err.code === "EACCES") {
        return `${baseErrorMessage(
          mvnPath
        )} It looks like the Maven path defined in the config is not an executable binary.`
      } else if (err.code === "ENOENT") {
        return `${baseErrorMessage(mvnPath)} The Maven path defined in the configuration does not exist.`
      } else {
        return baseErrorMessage(mvnPath)
      }
    }
    throw new RuntimeError(composeErrorMessage(err), { mvnPath })
  }
}

let mavenPathValid = false

async function verifyMavenPath(mvnPath: string) {
  if (mavenPathValid) {
    return
  }

  const versionOutput = await checkMavenVersion(mvnPath)
  const isMaven = versionOutput.toLowerCase().includes("maven")
  if (!isMaven) {
    throw new RuntimeError(
      `${baseErrorMessage(mvnPath)} It looks like the Maven path points to a non-Maven executable binary.`,
      { mvnPath }
    )
  }
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
  mavenPath,
  outputStream,
}: {
  ctx: PluginContext
  args: string[]
  cwd: string
  log: LogEntry
  openJdkPath: string
  mavenPath?: string
  outputStream?: Writable
}) {
  let mvnPath: string
  let lockacquired=false;
  if (!!mavenPath) {
    log.verbose(`Using explicitly specified Maven binary from ${mavenPath}`)
    mvnPath = mavenPath
    await verifyMavenPath(mvnPath)
  } else {
    log.verbose(`The Maven binary hasn't been specified explicitly. Maven ${mvnVersion} will be used by default.`)
    const tool = getMvnTool(ctx)
    mvnPath = await tool.getPath(log)
  }



  if (lockacquired){
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
  } else {

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

  }
  // Maven has issues when running concurrent processes, so we're working around that with a lock.
  // TODO: http://takari.io/book/30-team-maven.html would be a more robust solution.
  
}
