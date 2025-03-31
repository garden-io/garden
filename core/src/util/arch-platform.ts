/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { memoize } from "lodash-es"
import { execSync } from "child_process"
import { InternalError } from "../exceptions.js"

const archMap = {
  x32: "386" as const,
  x64: "amd64" as const,
} as const
const supportedArchitectures = ["386", "amd64", "arm64"] as const
const _supportedPlatforms = ["darwin", "windows", "linux", "alpine"] as const
export type Platform = (typeof _supportedPlatforms)[number]
export type Architecture = (typeof supportedArchitectures)[number]

export function getPlatform(): Platform {
  const platform = process.platform

  if (platform === "win32") {
    return "windows"
  }

  if (platform === "linux") {
    if (getRustTargetEnv() === "musl") {
      return "alpine"
    }

    return "linux"
  }

  if (platform === "darwin") {
    return "darwin"
  }

  throw new InternalError({ message: `Unsupported platform: ${platform}` })
}

// rust target env
// The Garden SEA rust wrapper will set an environment variable called GARDEN_SEA_TARGET_ENV on linux so we can download Alpine binaries if needed.
type RustTargetEnv = undefined | "musl" | "gnu"
export function getRustTargetEnv(): RustTargetEnv {
  const targetEnv = process.env.GARDEN_SEA_TARGET_ENV

  if (targetEnv === undefined || targetEnv === "musl" || targetEnv === "gnu") {
    return targetEnv
  }

  throw new InternalError({ message: `Invalid value for GARDEN_SEA_TARGET_ENV: ${targetEnv}` })
}

export function getArchitecture(): Architecture {
  // Note: When node is running a x64 build,
  // process.arch is always x64 even though the underlying CPU architecture may be arm64
  // To check if we are running under Rosetta,
  // use the `isDarwinARM` function below
  const arch = archMap[process.arch] || process.arch

  if (!supportedArchitectures.includes(arch)) {
    throw new InternalError({ message: `Unsupported architecture: ${arch}` })
  }

  return arch
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
