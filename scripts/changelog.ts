#!/usr/bin/env ts-node

import execa from "execa"
import { resolve } from "path"

const gardenRoot = resolve(__dirname, "..")

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
