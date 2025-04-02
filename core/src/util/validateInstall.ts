/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import semver from "semver"
import { RuntimeError } from "../exceptions.js"
import { deline } from "./string.js"
import { exec } from "./util.js"
import { makeDocsLinkStyled } from "../docs/common.js"

type BinaryVersionCheckParams = {
  name: string
  versionCommand: { cmd: string; args: string[] }
  versionRegex: RegExp
  minVersion: string
}

function versionCheckError(params: BinaryVersionCheckParams, msg: string): RuntimeError {
  return new RuntimeError({
    message: deline`
      ${msg}
      Please make sure ${params.name} (version ${params.minVersion} or later) is installed and on your PATH.
      More about garden installation and requirements can be found in our documentation at ${makeDocsLinkStyled("getting-started/installation")}
      `,
  })
}

async function execVersionCheck(params: BinaryVersionCheckParams): Promise<string> {
  try {
    return (await exec(params.versionCommand.cmd, params.versionCommand.args)).stdout
  } catch (error) {
    throw versionCheckError(params, `Could not find ${params.name} binary: ${error}`)
  }
}

function parseVersionOutput(versionOutput: string, params: BinaryVersionCheckParams): string {
  const versionOutputFirstLine = versionOutput.split("\n")[0]
  const match = versionOutputFirstLine.match(params.versionRegex)
  if (!match || match.length < 2) {
    throw versionCheckError(
      params,
      `Could not detect ${params.name} binary version in the version command's output: "${versionOutputFirstLine}": Failed to match regex "${params.versionRegex}".`
    )
  }
  return match[1]
}

function validateVersionNumber(version: string, params: BinaryVersionCheckParams): boolean {
  try {
    return semver.gte(version, params.minVersion)
  } catch (error) {
    throw versionCheckError(
      params,
      `Could not parse the ${params.name} version ${version} as a valid semver value: ${error}`
    )
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
    throw versionCheckError(params, `Found ${params.name} binary but the version is too old (${version}).`)
  }
}
