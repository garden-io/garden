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

/**
 * throws if version check fails or the version is too old
 */
export async function validateInstall(params: {
  name: string
  versionCommand: { cmd: string; args: string[] }
  versionRegex: RegExp
  minVersion: string
}) {
  let version: string | undefined = undefined
  const versionDetectFailure = new RuntimeError(
    deline`
    Could not detect ${params.name} version.
    Please make sure ${params.name} version ${params.minVersion} or later is installed and on your PATH.
    `,
    {}
  )

  try {
    const versionOutput = (await exec(params.versionCommand.cmd, params.versionCommand.args)).stdout
    version = versionOutput.split("\n")[0].match(params.versionRegex)?.[1]
  } catch (error) {
    throw new RuntimeError(
      deline`
      Could not find ${params.name} binary.
      Please make sure ${params.name} (version ${params.minVersion} or later) is installed and on your PATH.
      `,
      { error }
    )
  }

  if (!version) {
    throw versionDetectFailure
  }

  let versionGte = true

  try {
    versionGte = semver.gte(version, params.minVersion)
  } catch (_) {
    throw versionDetectFailure
  }

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
