/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import AsyncLock from "async-lock"
import { Log, PluginContext, PluginToolSpec } from "@garden-io/sdk/types"
import { find } from "lodash"
import { PluginError, RuntimeError } from "@garden-io/core/build/src/exceptions"
import { Writable } from "node:stream"
import execa from "execa"

const buildLock = new AsyncLock()

export const mvnVersion = "3.8.8"

const spec = {
  url: `https://archive.apache.org/dist/maven/maven-3/${mvnVersion}/binaries/apache-maven-${mvnVersion}-bin.tar.gz`,
  sha256: "17811e108701af5985bf5167abbd47c06e92c6c6bd1c13a1a1c095c9b4ecc32a",
  extract: {
    format: "tar",
    targetPath: `apache-maven-${mvnVersion}/bin/mvn`,
  },
}

export const mavenSpec: PluginToolSpec = {
  name: "maven",
  version: mvnVersion,
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
      sha256: "2e181515ce8ae14b7a904c40bb4794831f5fd1d9641107a13b916af15af4001a",
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
  } catch (error) {
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
    throw new RuntimeError(composeErrorMessage(error), { mvnPath })
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
  lockacquired,
}: {
  ctx: PluginContext
  args: string[]
  cwd: string
  log: Log
  openJdkPath: string
  mavenPath?: string
  outputStream?: Writable
  lockacquired?: boolean
}) {
  let mvnPath: string
  //let lockacquired = false
  if (!!mavenPath) {
    log.verbose(`Using explicitly specified Maven binary from ${mavenPath}`)
    mvnPath = mavenPath
    await verifyMavenPath(mvnPath)
  } else {
    log.verbose(`The Maven binary hasn't been specified explicitly. Maven ${mvnVersion} will be used by default.`)
    const tool = getMvnTool(ctx)
    mvnPath = await tool.ensurePath(log)
  }

  if (lockacquired) {
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
