/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { memoize } from "lodash-es"
import { execSync } from "child_process"

const platformMap = {
  win32: "windows" as const,
}
const archMap = {
  x32: "386" as const,
  x64: "amd64" as const,
}
export type Architecture = Exclude<NodeJS.Architecture, keyof typeof archMap> | (typeof archMap)[keyof typeof archMap]
export type Platform =
  | Exclude<NodeJS.Platform, keyof typeof platformMap>
  | (typeof platformMap)[keyof typeof platformMap]

export function getPlatform(): Platform {
  return platformMap[process.platform] || process.platform
}

export function getArchitecture(): Architecture {
  // Note: When node is running a x64 build,
  // process.arch is always x64 even though the underlying CPU architecture may be arm64
  // To check if we are running under Rosetta,
  // use the `isDarwinARM` function below
  const arch = process.arch
  return archMap[arch] || arch
}

export const isDarwinARM = memoize(() => {
  if (process.platform !== "darwin") {
    return false
  }

  if (process.arch === "arm64") {
    return true
  } else if (process.arch === "x64") {
    // detect rosetta on Apple M cpu family macs
    // see also https://developer.apple.com/documentation/apple-silicon/about-the-rosetta-translation-environment
    // We use execSync here, because this function is called in a constructor
    // otherwise we'd make the function async and call `spawn`
    try {
      execSync("sysctl -n -q sysctl.proc_translated", { encoding: "utf-8" })
    } catch (err) {
      return false
    }
    return true
  }

  return false
})
