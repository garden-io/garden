/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import semver from "semver"
import { RuntimeError } from "../exceptions"
import { deline } from "./string"
import { exec } from "./util"

type BinaryVersionCheckParams = {
  name: string
  versionCommand: { cmd: string; args: string[] }
  versionRegex: RegExp
  minVersion: string
}

const versionDetectFailure = (params: BinaryVersionCheckParams) =>
  new RuntimeError(
    deline`
    Could not detect ${params.name} version.
    Please make sure ${params.name} version ${params.minVersion} or later is installed and on your PATH.
    `,
    {}
  )

async function execVersionCheck(params: BinaryVersionCheckParams): Promise<string> {
  try {
    return (await exec(params.versionCommand.cmd, params.versionCommand.args)).stdout
  } catch (error) {
    throw new RuntimeError(
      deline`
      Could not find ${params.name} binary.
      Please make sure ${params.name} (version ${params.minVersion} or later) is installed and on your PATH.
      `,
      { error }
    )
  }
}

function parseVersionOutput(versionOutput: string, params: BinaryVersionCheckParams): string {
  const versionOutputFirstLine = versionOutput.split("\n")[0]
  const match = versionOutputFirstLine.match(params.versionRegex)
  if (!match || match.length < 2) {
    throw versionDetectFailure(params)
  }
  return match[1]
}

function validateVersionNumber(version: string, params: BinaryVersionCheckParams): boolean {
  try {
    return semver.gte(version, params.minVersion)
  } catch (_) {
    throw versionDetectFailure(params)
  }
}

/**
 * throws if version check fails or the version is too old
 */
export async function validateInstall(params: BinaryVersionCheckParams): Promise<void> {
  const versionOutput = await execVersionCheck(params)
  const version = parseVersionOutput(versionOutput, params)
  const versionGte = validateVersionNumber(version, params)

  if (!versionGte) {
    throw new RuntimeError(
      deline`
      Found ${params.name} binary but the version is too old (${version}).
      Please install version ${params.minVersion} or later.
      `,
      { version }
    )
  }
}
