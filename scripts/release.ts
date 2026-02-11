#!/usr/bin/env tsx
/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/* eslint-disable no-console */

import { execa } from "execa"
import semver from "semver"
import { confirm } from "@inquirer/prompts"
import chalk from "chalk"
import { dirname, relative, resolve } from "node:path"
import fsExtra from "fs-extra"

const { createWriteStream, readFile, writeFile } = fsExtra
import { getPackages } from "./script-utils.js"
import parseArgs from "minimist"
import deline from "deline"
import { replaceInFile } from "replace-in-file"
import { fileURLToPath } from "node:url"
import { finished } from "node:stream/promises"

const moduleDirName = dirname(fileURLToPath(import.meta.url))

type ReleaseType = "minor" | "patch" | "preminor" | "prepatch" | "prerelease"
const RELEASE_TYPES = ["minor", "patch", "preminor", "prepatch", "prerelease"]

const gardenRoot = resolve(moduleDirName, "..")
const rootPackageJsonPath = resolve(gardenRoot, "package.json")

/**
 * Performs the following steps to prepare for a release:
 * 1. Check out to a branch named release-${version}
 * 2. Bump the version in core/package.json and core/package-lock.json.
 * 5. Update the changelog.
 * 6. Add and commit CHANGELOG.md, core/package.json and core/package-lock.json
 * 7. Tag the commit.
 * 8. Push the tag. This triggers a CircleCI job that creates the release artifacts and publishes them to Github.
 * 9. If we're making a minor release, update links to examples and re-push the tag.
 * 10. If this is not a pre-release, pushes the release branch to Github.
 *
 * Usage: ./scripts/release.ts <minor | patch | preminor | prepatch | prerelease> [--force] [--dry-run]
 */
async function release() {
  // Parse arguments
  const argv = parseArgs(process.argv.slice(2))
  const releaseType = <ReleaseType>argv._[0]
  const force = !!argv.force
  const dryRun = !!argv["dry-run"]

  // Check if branch is clean
  try {
    await execa("git", ["diff", "--exit-code"], { cwd: gardenRoot })
  } catch (_) {
    throw new Error("Current branch has unstaged changes, aborting.")
  }

  if (!RELEASE_TYPES.includes(releaseType)) {
    throw new Error(`Invalid release type ${releaseType}, available types are: ${RELEASE_TYPES.join(", ")}`)
  }

  const prevVersion = JSON.parse(await readFile(rootPackageJsonPath, "utf-8")).version as string
  const version = semver.inc(prevVersion, releaseType)!

  // Update package.json versions

  /**
   * For prereleases, we omit the prerelease suffix for all package.json-s except the top-level one.
   *
   * This is to make references to internal packages (e.g. "@garden-io/core@*") work during the build process in CI.
   */
  const packageReleaseTypeMap = { preminor: "minor", prepatch: "patch" }
  const incrementedPackageVersion = semver.inc(prevVersion, packageReleaseTypeMap[releaseType] || releaseType)
  const parsed = semver.parse(incrementedPackageVersion)

  // We omit the prerelease suffix from `incrementedPackageVersion` (if there is one).
  const packageVersion = `${parsed?.major}.${parsed?.minor}.${parsed?.patch}`

  console.log(`Bumping version from ${prevVersion} to ${version}...`)

  await updatePackageJsonVersion(rootPackageJsonPath, version)

  console.log(`Setting package versions to ${packageVersion}...`)
  const packages = await getPackages()
  const packageJsonPaths = Object.values(packages).map((p) => resolve(p.location, "package.json"))
  await Promise.all(packageJsonPaths.map(async (p) => await updatePackageJsonVersion(p, packageVersion!)))

  const branchName = `release-${version}`

  // Check if branch already exists locally
  let localBranch
  try {
    localBranch = (await execa("git", ["rev-parse", "--verify", branchName], { cwd: gardenRoot })).stdout
  } catch (_) {
    // no op
  } finally {
    if (localBranch) {
      await rollBack()
      throw new Error(`Branch ${branchName} already exists locally. Aborting.`)
    }
  }

  // Check if branch already exists remotely
  let remoteBranch
  try {
    remoteBranch = (
      await execa("git", ["ls-remote", "--exit-code", "--heads", "origin", branchName], { cwd: gardenRoot })
    ).stdout
  } catch (_) {
    // no op
  } finally {
    if (remoteBranch) {
      await rollBack()
      throw new Error(`Branch ${branchName} already exists remotely. Aborting.`)
    }
  }

  // Check if user wants to continue
  const proceed = await prompt(version)
  if (!proceed) {
    await rollBack()
    return
  }

  // Pull remote tags
  console.log("Pulling remote tags...")
  await execa("git", ["fetch", "origin", "--tags", "-f"], { cwd: gardenRoot })

  // Verify tag doesn't exist
  const tags = (await execa("git", ["tag"], { cwd: gardenRoot })).stdout.split("\n")
  if (tags.includes(version) && !force) {
    await rollBack()
    throw new Error(`Tag ${version} already exists. Use "--force" to override.`)
  }

  // Checkout to a release branch
  console.log(`Checking out to branch ${branchName}...`)
  await execa("git", ["checkout", "-b", branchName], { cwd: gardenRoot })

  // Remove pre-release tags so they don't get included in the changelog
  await stripPrereleaseTags(tags, version)

  // Update changelog
  console.log("Updating changelog...")
  await updateChangelog(version)

  // Add and commit changes
  console.log("Committing changes...")
  await execa(
    "git",
    ["add", "CHANGELOG.md", rootPackageJsonPath, ...packageJsonPaths.map((p) => relative(gardenRoot, p))],
    { cwd: gardenRoot }
  )

  await execa("git", ["commit", "-m", `chore(release): bump version to ${version}`], { cwd: gardenRoot })

  // Tag the commit and push the tag
  if (!dryRun) {
    console.log("Pushing tag...")
    await createTag(version, force)
  }

  // Reset local tag state (after stripping release tags)
  await execa("git", ["fetch", "origin", "--tags"], { cwd: gardenRoot })

  // For non pre-releases, we update links to examples in the docs so that they point to the relevant tag.
  // E.g.: "github.com/garden-io/tree/v0.8.0/example/..." becomes "github.com/garden-io/tree/v0.9.0/example/..."
  // Note that we do this after pushing the tag originally. This is because we check that links are valid in CI
  // and the check would fail if the tag hasn't been created in the first place.
  if (releaseType === "minor" || releaseType === "patch") {
    console.log("Updating links to examples and re-pushing tag...")
    await updateExampleLinks(version)

    // Add and commit changes to example links
    await execa("git", ["add", "README.md", "docs"], { cwd: gardenRoot })
    await execa("git", ["commit", "--amend", "--no-edit"], { cwd: gardenRoot })

    // Tag the commit and force push the tag after updating the links (this triggers another CI build)
    if (!dryRun) {
      await createTag(version, true)
    }
  }

  if (!dryRun && !semver.prerelease(version)) {
    console.log("Pushing release branch...")
    const pushArgs = ["push", "origin", branchName, "--no-verify"]
    if (force) {
      pushArgs.push("-f")
    }
    await execa("git", pushArgs, { cwd: gardenRoot })
  }

  if (dryRun) {
    console.log(deline`
    Release ${chalk.bold.cyan(version)} is ready! To release, create and push a release tag with:\n

    ${chalk.bold(`git tag -a ${version} -m "chore(release): release ${version}"`)}

    ${chalk.bold(`git push push origin ${version} --no-verify`)}\n

    Then, if this is not a pre-release, push the branch with:\n

    ${chalk.bold(`git push origin ${branchName} --no-verify`)}\n

    and create a pull request on Github by visiting:
      https://github.com/garden-io/garden/pull/new/${branchName}\n

    Alternatively, you can undo the commit created by the dry-run and run the script
    again without the --dry-run flag. This will perform all the steps automatically.
    `)
  } else {
    console.log(deline`
    \nRelease ${chalk.bold.cyan(version)} has been ${chalk.bold("tagged")}, ${chalk.bold("committed")},
    and ${chalk.bold("pushed")} to Github! 🎉\n

    A CI job that creates the release artifacts is currently in process: https://circleci.com/gh/garden-io/garden\n

    If this is not a pre-release, create a pull request for ${branchName} on Github by visiting:
      https://github.com/garden-io/garden/pull/new/${branchName}\n

    Please refer to our release process docs for the next steps:
    https://github.com/garden-io/garden/blob/main/RELEASE_PROCESS.md
  `)
  }
}

async function updatePackageJsonVersion(packageJsonPath: string, newVersion: string) {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8"))
  packageJson.version = newVersion
  await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2))
}

async function createTag(version: string, force: boolean) {
  // Tag the commit
  const createTagArgs = ["tag", "-a", version, "-m", `chore(release): release ${version}`]
  if (force) {
    createTagArgs.push("-f")
  }
  await execa("git", createTagArgs, { cwd: gardenRoot })

  // Push the tag
  const pushTagArgs = ["push", "origin", version, "--no-verify"]
  if (force) {
    pushTagArgs.push("-f")
  }
  await execa("git", pushTagArgs, { cwd: gardenRoot })
}

async function updateExampleLinks(version: string) {
  const options = {
    files: ["docs/**/*.md", "README.md"],
    from: /github\.com\/garden-io\/garden\/tree\/[^\/]*\/examples/g,
    to: `github.com/garden-io/garden/tree/${version}/examples`,
  }
  const results = await replaceInFile(options)
  console.log(
    "Modified files:",
    results
      .filter((r) => r.hasChanged)
      .map((r) => r.file)
      .join("\n")
  )
}

async function rollBack() {
  // Undo any file changes. This is safe since we know the branch is clean.
  console.log("Undoing file changes")
  await execa("git", ["checkout", "."], { cwd: gardenRoot })
}

async function prompt(version: string): Promise<boolean> {
  const message = deline`
    Running this script will create a branch and a tag for ${chalk.bold.cyan(version)} and push them to Github.
    This triggers a CI process that creates the release artifacts.\n

    Are you sure you want to continue?
  `
  return await confirm({ message })
}

/**
 * Update CHANGELOG.md. We need to get the latest entry and prepend it to the current CHANGELOG.md
 */
async function updateChangelog(version: string) {
  const changelogPath = "./CHANGELOG.md"
  // TODO: Use readStream and pipe
  const changelog = await readFile(changelogPath)
  const nextChangelogEntry = (
    await execa(
      "git-chglog",
      ["--tag-filter-pattern", "^\\d+\\.\\d+\\.\\d+$", "--sort", "semver", "--next-tag", version, version],
      { cwd: gardenRoot }
    )
  ).stdout
  const writeStream = createWriteStream(changelogPath)
  writeStream.write(nextChangelogEntry)
  writeStream.write(changelog)
  writeStream.close()
  await finished(writeStream)
}

/**
 * We don't include pre-release tags in the changelog except for the current release cycle.
 * So if we're releasing, say, v0.9.1-3, we include the v0.9.1-0, v0.9.1-1, and v0.9.1-2 tags.
 *
 * Once we release v0.9.1, we remove the pre-release tags, so the changelog will only show the changes
 * between v0.9.0 and v0.9.1.
 */
async function stripPrereleaseTags(tags: string[], version: string) {
  const prereleaseTags = tags.filter((t) => !!semver.prerelease(t))

  for (const tag of prereleaseTags) {
    // If we're not releasing a pre-release, we remove the tag. Or,
    // if we are releasing a pre-release and the tag is not from the same cycle, we remove it.
    // E.g., if the current tag is v0.5.0-2 and we're releasing v0.9.0-2, we remove it.
    // If the current tag is v0.9.0-0 and we're releasing v0.9.0-2, we keep it.
    if (!semver.prerelease(version) || semver.diff(version, tag) !== "prerelease") {
      await execa("git", ["tag", "-d", tag])
    }
  }

  // We also need to remove the "edge-cedar" tag
  await execa("git", ["tag", "-d", "edge-cedar"])
}

;(async () => {
  try {
    await release()
    process.exit(0)
  } catch (err) {
    console.log(err)
    process.exit(1)
  }
})().catch(() => {})
