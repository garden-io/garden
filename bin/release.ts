#!/usr/bin/env ts-node

import * as execa from "execa"
import * as semver from "semver"
import * as inquirer from "inquirer"
import chalk from "chalk"
import parseArgs = require("minimist")
import replace = require("replace-in-file")
import deline = require("deline")
import { resolve, join } from "path"

type ReleaseType = "minor" | "patch" | "preminor" | "prepatch" | "prerelease"
const RELEASE_TYPES = ["minor", "patch", "preminor", "prepatch", "prerelease"]

/**
 * Performs the following steps to prepare for a release:
 * 1. Check out to a branch named release-${version}
 * 2. Bump the version in garden-service/package.json and garden-service/package-lock.json.
 * 5. Update the changelog.
 * 6. Add and commit CHANGELOG.md, garden-service/package.json and garden-service/package-lock.json
 * 7. Tag the commit.
 * 8. Push the tag. This triggers CircleCI process that creates the release artifacts.
 * 9. If we're making a minor release, update links to examples and re-push the tag.
 * 10. Pushes the release branch to Github.
 *
 * Usage: ./bin/release.ts <minor | patch | preminor | prepatch | prerelease> [--force]
 */
async function release() {
  // Parse arguments
  const argv = parseArgs(process.argv.slice(2))
  const releaseType = <ReleaseType>argv._[0]
  const force = argv.force
  const gardenRoot = resolve(__dirname, "..")
  const gardenServiceRoot = join(gardenRoot, "garden-service")

  // Check if branch is clean
  try {
    await execa("git", ["diff", "--exit-code"], { cwd: gardenRoot })
  } catch (_) {
    throw new Error("Current branch has unstaged changes, aborting.")
  }

  if (!RELEASE_TYPES.includes(releaseType)) {
    throw new Error(`Invalid release type ${releaseType}, available types are: ${RELEASE_TYPES.join(", ")}`)
  }

  // Bump package.json and package-lock.json version. Returns the version that was set.
  const version = await execa.stdout("npm", [
    "version", "--no-git-tag-version", releaseType,
  ], { cwd: gardenServiceRoot })

  // Check if user wants to continue
  const proceed = await prompt(version)
  if (!proceed) {
    await rollBack(gardenRoot)
    return
  }

  // Pull remote tags
  console.log("Pulling remote tags...")
  await execa("git", ["fetch", "origin", "--tags"], { cwd: gardenRoot })

  // Verify tag doesn't exist
  const tags = (await execa.stdout("git", ["tag"], { cwd: gardenRoot })).split("\n")
  if (tags.includes(version) && !force) {
    await rollBack(gardenRoot)
    throw new Error(`Tag ${version} already exists. Use "--force" to override.`)
  }

  // Checkout to a release branch
  const branchName = `release-${version}`
  console.log(`Checking out to branch ${branchName}...`)
  await execa("git", ["checkout", "-b", branchName], { cwd: gardenRoot })

  // Remove pre-release tags so they don't get included in the changelog
  await stripPrereleaseTags(tags, version)

  // Update changelog
  console.log("Updating changelog...")
  await execa("git-chglog", [
    "--next-tag", version,
    "--output", "CHANGELOG.md",
    `..${version}`,
  ], { cwd: gardenRoot })

  // Add and commit changes
  console.log("Committing changes...")
  await execa("git", [
    "add",
    "CHANGELOG.md", "garden-service/package.json", "garden-service/package-lock.json",
  ], { cwd: gardenRoot })
  await execa("git", [
    "commit",
    "-m", `chore(release): bump version to ${version}`,
  ], { cwd: gardenRoot })

  // Tag the commit and push the tag
  console.log("Pushing tag...")
  await createTag(version, gardenRoot, force)

  // Reset local tag state (after stripping release tags)
  await execa("git", ["fetch", "origin", "--tags"], { cwd: gardenRoot })

  // For minor releases, we update links to examples in the docs so that they point to the relevant tag.
  // E.g.: "github.com/garden-io/tree/v0.8.0/example/..." becomes "github.com/garden-io/tree/v0.9.0/example/..."
  // Note that we do this after pushing the tag originally. This because we check that links are valid in CI
  // and the check would fail if the tag hasen't been created in the first place.
  if (releaseType === "minor") {
    console.log("Updating links to examples and re-pushing tag...")
    await updateExampleLinks(version)

    // Add and commit changes to example links
    await execa("git", [
      "add",
      "README.md", "docs",
    ], { cwd: gardenRoot })
    await execa("git", ["commit", "--amend", "--no-edit"], { cwd: gardenRoot })

    // Tag the commit and force push the tag after updating the links (this triggers another CI build)
    await createTag(version, gardenRoot, true)
  }

  console.log("Pushing release branch...")
  await execa("git", ["push", "origin", branchName, "--no-verify"], { cwd: gardenRoot })

  console.log(deline`
    \nVersion ${chalk.bold.cyan(version)} has been ${chalk.bold("tagged")}, ${chalk.bold("committed")},
    and ${chalk.bold("pushed")} to Github! 🎉\n

    A CI job that creates the release artifacts is currently in process: https://circleci.com/gh/garden-io/garden\n

    Create a pull request for ${branchName} on Github by visting:
      https://github.com/garden-io/garden/pull/new/${branchName}

    Please refer to our contributing docs for the next steps:
    https://github.com/garden-io/garden/blob/master/CONTRIBUTING.md
  `)
}

async function createTag(version: string, gardenRoot: string, force: boolean) {
  // Tag the commit
  const createTagArgs = ["tag", "-a", version, "-m", `chore(release): release ${version}`]
  if (force) {
    createTagArgs.push("-f")
  }
  await execa.stdout("git", createTagArgs, { cwd: gardenRoot })

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
    from: /github\.com\/garden-io\/garden\/tree\/.*\/examples/g,
    to: `github.com/garden-io/garden/tree/${version}/examples/`,
  }
  const changes = await replace(options)
  console.log("Modified files:", changes.join(", "))
}

async function rollBack(gardenRoot: string) {
  // Clean up changes to package.json and package-lock.json. This is safe since we know the branch is clean.
  console.log("Undoing changes to package.json and package-lock.json")
  await execa.stdout("git", [
    "checkout",
    "garden-service/package.json",
    "garden-service/package-lock.json",
  ], { cwd: gardenRoot })
}

async function prompt(version: string): Promise<boolean> {
  const message = deline`
    Running this script will create a branch and a tag for ${chalk.bold.cyan(version)} and push them to Github.
    This triggers a CI process that creates the release artifacts.\n

    Are you sure you want to continue?
  `
  const ans = await inquirer.prompt({
    name: "continue",
    message,
  })
  return ans.continue.startsWith("y")
}

/**
 * We don't include pre-release tags in the changelog except for the current release cycle.
 * So if we're releasing, say, v0.9.1-3, we include the v0.9.1-0, v0.9.1-1, and v0.9.1-2 tags.
 *
 * Once we release v0.9.1, we remove the pre-release tags, so the changelog will only show the changes
 * between v0.9.0 and v0.9.1.
 */
async function stripPrereleaseTags(tags: string[], version: string) {
  const prereleaseTags = tags.filter(t => !!semver.prerelease(t))

  for (const tag of prereleaseTags) {
    // If we're not releasing a pre-release, we remove the tag. Or,
    // if we are releasing a pre-release and the tag is not from the same cycle, we remove it.
    // E.g., if the current tag is v0.5.0-2 and we're releasing v0.9.0-2, we remove it.
    // If the current tag is v0.9.0-0 and we're releasing v0.9.0-2, we keep it.
    if (!semver.prerelease(version) || semver.diff(version, tag) !== "prerelease") {
      await execa.stdout("git", ["tag", "-d", tag])
    }
  }
}

(async () => {
  try {
    await release()
    process.exit(0)
  } catch (err) {
    console.log(err)
    process.exit(1)
  }
})().catch(() => { })
