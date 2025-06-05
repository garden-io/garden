#!/usr/bin/env -S node --import ./scripts/register-hook.js
/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { execa } from "execa"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const moduleDirName = dirname(fileURLToPath(import.meta.url))

const gardenRoot = resolve(moduleDirName, "..")

export async function getChangelog(curReleaseTag: string) {
  try {
    return (
      await execa(
        "git-chglog",
        ["--tag-filter-pattern", "^\\d+\\.\\d+\\.\\d+$", "--sort", "semver", `${curReleaseTag}..${curReleaseTag}`],
        { cwd: gardenRoot }
      )
    ).stdout
  } catch (err) {
    throw new Error(`Error generating changelog: ${err}`)
  }
}
