/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { LogEntry, PluginContext } from "@garden-io/sdk/types"
import { Writable } from "node:stream"
import execa from "execa"
import { RuntimeError } from "@garden-io/core/build/src/exceptions"

export interface CheckVersionParams {
  binaryPath: string
  toolName: string
  configFieldName: string
}

export function baseErrorMessage({ binaryPath, configFieldName }: CheckVersionParams): string {
  return `Gradle binary path "${binaryPath}" is incorrect! Please check the \`${configFieldName}\` configuration option.`
}

export async function getBuildToolVersion(params: CheckVersionParams) {
  const { binaryPath, toolName } = params
  try {
    const res = await execa(binaryPath, ["--version"])
    return res.stdout
  } catch (error) {
    const composeErrorMessage = (err: any): string => {
      if (err.code === "EACCES") {
        return `${baseErrorMessage(
          params
        )} It looks like the ${toolName} path defined in the config is not an executable binary.`
      } else if (err.code === "ENOENT") {
        return `${baseErrorMessage(params)} The ${toolName} path defined in the configuration does not exist.`
      } else {
        return baseErrorMessage(params)
      }
    }
    throw new RuntimeError(composeErrorMessage(error), { binaryPath })
  }
}

export interface VerifyBinaryParams extends CheckVersionParams {
  outputVerificationString: string
}

export async function verifyBinaryPath(params: VerifyBinaryParams) {
  const { binaryPath, toolName, outputVerificationString } = params
  const versionOutput = await getBuildToolVersion(params)
  const isMaven = versionOutput.toLowerCase().includes(outputVerificationString)
  if (!isMaven) {
    throw new RuntimeError(
      `${baseErrorMessage(params)} It looks like the ${toolName} path points to a wrong executable binary.`,
      { binaryPath }
    )
  }
}

export interface BuildToolParams {
  ctx: PluginContext
  args: string[]
  cwd: string
  log: LogEntry
  openJdkPath: string
  binaryPath?: string
  concurrentMavenBuilds?: boolean
  outputStream?: Writable
}

export function runBuildTool({
  binaryPath,
  args,
  cwd,
  openJdkPath,
  outputStream,
}: {
  binaryPath: string
  args: string[]
  cwd: string
  openJdkPath: string
  outputStream?: Writable
}) {
  const res = execa(binaryPath, args, {
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
