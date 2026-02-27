#!/usr/bin/env tsx
/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/* eslint-disable no-console */

import fsExtra from "fs-extra"
const { writeFile } = fsExtra
import { execSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import dedent from "dedent"
import { getChangelog } from "./changelog.js"
import parseArgs from "minimist"
import { fileURLToPath } from "node:url"

const moduleDirName = dirname(fileURLToPath(import.meta.url))

const gardenRoot = resolve(moduleDirName, "..")

/**
 * Check if the changelog output is empty (no commit group headings like ### Features).
 */
function isChangelogEmpty(changelog: string): boolean {
  return !changelog.includes("### ")
}

/**
 * Fetch the list of repo collaborators (works with the default GITHUB_TOKEN).
 * Falls back to an empty set if the API is unavailable.
 */
function getRepoCollaborators(): Set<string> {
  try {
    const result = execSync(
      `gh api "repos/garden-io/garden/collaborators" --paginate --jq '.[].login'`,
      { timeout: 30000 }
    )
      .toString()
      .trim()
    return new Set(result.split("\n").filter(Boolean).map((login) => login.toLowerCase()))
  } catch {
    return new Set()
  }
}

/**
 * Extract GitHub usernames from git log and check which are external contributors.
 * Uses the repo collaborators list (which the default GITHUB_TOKEN can access)
 * rather than org membership (which requires the `user` scope).
 */
async function getExternalContributors(prevReleaseTag: string, curReleaseTag: string): Promise<string[]> {
  // Extract unique email/name pairs from git log
  let authors: string
  try {
    authors = execSync(
      `git log ${prevReleaseTag}..${curReleaseTag} --no-merges --format='%aN <%aE>'  | sort -u`
    ).toString()
  } catch {
    return []
  }

  const authorLines = authors.trim().split("\n").filter(Boolean)

  // Fetch repo collaborators once (more efficient and reliable than per-user org checks)
  const collaborators = getRepoCollaborators()

  const externalContributors: string[] = []

  for (const author of authorLines) {
    const emailMatch = author.match(/<(.+)>/)
    if (!emailMatch) {
      continue
    }
    const email = emailMatch[1]

    // Skip noreply and bot emails
    if (email.includes("noreply") || email.includes("[bot]")) {
      continue
    }

    // Try to get GitHub username from email via the GitHub API
    try {
      const searchResult = execSync(`gh api "search/users?q=${email}+in:email" --jq '.items[0].login'`, {
        timeout: 10000,
      })
        .toString()
        .trim()

      if (!searchResult || searchResult === "null") {
        continue
      }

      // Check if user is a repo collaborator — if not, they're an external contributor
      if (collaborators.size > 0 && !collaborators.has(searchResult.toLowerCase())) {
        externalContributors.push(`@${searchResult}`)
      }
    } catch {
      // GitHub API unavailable or rate limited — skip this author
      continue
    }
  }

  return externalContributors
}

/**
 * Extract issue references (fixes #123, closes #123) from commit messages.
 */
function getFixedIssues(prevReleaseTag: string, curReleaseTag: string): string[] {
  try {
    const log = execSync(`git log ${prevReleaseTag}..${curReleaseTag} --no-merges --format='%B'`).toString()
    const issuePattern = /(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s+#(\d+)/gi
    const issues = new Set<string>()
    let match
    while ((match = issuePattern.exec(log)) !== null) {
      issues.add(match[1])
    }
    return Array.from(issues).sort((a, b) => Number(a) - Number(b))
  } catch {
    return []
  }
}

function buildReleaseNotes(opts: {
  version: string
  description: string
  changelog: string
  changelogEmpty: boolean
  externalContributors: string[]
  fixedIssues: string[]
  manualMode: boolean
}): string {
  const { version, description, changelog, changelogEmpty, externalContributors, fixedIssues, manualMode } = opts

  const contributorSection =
    externalContributors.length > 0
      ? `Many thanks to ${externalContributors.join(", ")} for the contributions to this release!`
      : ""

  const issueSection =
    fixedIssues.length > 0
      ? fixedIssues.map((issue) => `* #${issue}`).join("\n")
      : manualMode
        ? "* [TODO: compose the list of the fixed issues here.]"
        : ""

  const changelogSection = changelogEmpty
    ? ""
    : manualMode
      ? `## Changelog\n[TODO: Review the changelog and remember to put the list of features on top of the list of bug fixes.]\n${changelog}`
      : `## Changelog\n${changelog}`

  return dedent(`
${description}

${contributorSection}

## Assets

Download the Garden binary for your platform from below or simply run \`garden self-update\` if you already have it installed.

* [Garden v${version} for Alpine AMD64 (tar.gz)](https://download.garden.io/core/${version}/garden-${version}-alpine-amd64.tar.gz)
* [Garden v${version} for Linux AMD64 (tar.gz)](https://download.garden.io/core/${version}/garden-${version}-linux-amd64.tar.gz)
* [Garden v${version} for Linux ARM64 (tar.gz)](https://download.garden.io/core/${version}/garden-${version}-linux-arm64.tar.gz)
* [Garden v${version} for MacOS AMD64 (tar.gz)](https://download.garden.io/core/${version}/garden-${version}-macos-amd64.tar.gz)
* [Garden v${version} for MacOS ARM64 (tar.gz)](https://download.garden.io/core/${version}/garden-${version}-macos-arm64.tar.gz)
* [Garden v${version} for Windows AMD64 (.zip)](https://download.garden.io/core/${version}/garden-${version}-windows-amd64.zip)

${changelogSection}
${issueSection ? `\n## Fixed Issues\n\n${issueSection}` : ""}
`)
}

async function draftReleaseNotes() {
  const argv = parseArgs(process.argv.slice(2))
  const prevReleaseTag = argv._[0]
  const curReleaseTag = argv._[1]
  const outputStdout = !!argv["output-stdout"]
  const manualMode = !!argv["manual"]

  if (!prevReleaseTag || !curReleaseTag) {
    console.error("Usage: ./scripts/draft-release-notes.ts <previous-tag> <current-tag> [--output-stdout] [--manual]")
    process.exit(1)
  }

  // Use stderr for progress messages so --output-stdout isn't contaminated
  const log = outputStdout ? (...args: unknown[]) => console.error(...args) : console.log

  log(`Generating release notes for ${curReleaseTag}...`)

  // Generate changelog
  log("Generating changelog...")
  const changelog = await getChangelog(curReleaseTag)

  // Identify external contributors
  log("Identifying external contributors...")
  const externalContributors = await getExternalContributors(prevReleaseTag, curReleaseTag)

  // Extract fixed issues from commits
  log("Extracting fixed issues...")
  const fixedIssues = getFixedIssues(prevReleaseTag, curReleaseTag)

  // Resolve the release description.
  const changelogEmpty = isChangelogEmpty(changelog)

  const defaultDescription = changelogEmpty
    ? dedent(`
        ## Garden ${curReleaseTag} is out! :tada:

        This is a maintenance release with no user-facing changes.
      `)
    : dedent(`
        ## Garden ${curReleaseTag} is out! :tada:

        Please see the changelog below for a detailed list of changes in this release.
      `)

  const description = manualMode
    ? `[TODO: amend the release description below if necessary.]\n${defaultDescription}`
    : defaultDescription

  const content = buildReleaseNotes({
    version: curReleaseTag,
    description,
    changelog,
    changelogEmpty,
    externalContributors,
    fixedIssues,
    manualMode,
  })

  if (outputStdout) {
    process.stdout.write(content)
  } else {
    const filename = `release-notes-${curReleaseTag}-draft.md`
    const outputPath = `${gardenRoot}/${filename}`
    log(`Writing release notes to ${outputPath}`)
    try {
      await writeFile(outputPath, content, { encoding: "utf-8" })
    } catch (err) {
      throw new Error(`Error writing release notes to path ${outputPath}: ${err}`)
    }
    log("Done!")
  }
}

;(async () => {
  try {
    await draftReleaseNotes()
    process.exit(0)
  } catch (err) {
    console.log(err)
    process.exit(1)
  }
})().catch(() => {})
