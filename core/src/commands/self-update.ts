/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import tar from "tar"
import { Command, CommandParams, CommandResult } from "./base"
import { printHeader } from "../logger/util"
import { BooleanParameter, ChoicesParameter, GlobalOptions, ParameterValues, StringParameter } from "../cli/params"
import { dedent } from "../util/string"
import { basename, dirname, join, resolve } from "path"
import chalk from "chalk"
import { Architecture, getArchitecture, isDarwinARM, getPackageVersion, getPlatform } from "../util/util"
import { RuntimeError } from "../exceptions"
import { makeTempDir } from "../util/fs"
import { createReadStream, createWriteStream } from "fs"
import { copy, mkdirp, move, readdir, remove } from "fs-extra"
import { GotHttpError, got } from "../util/http"
import { promisify } from "node:util"
import { gardenEnv } from "../constants"
import semver from "semver"
import stream from "stream"

const ARM64_INTRODUCTION_VERSION = "0.13.12"

const selfUpdateArgs = {
  version: new StringParameter({
    help: `Specify which version to switch/update to. It can be either a stable release, a pre-release, or an edge release version.`,
  }),
}

const selfUpdateOpts = {
  "force": new BooleanParameter({
    help: `Install the Garden CLI even if the specified or detected latest version is the same as the current version.`,
    aliases: ["f"],
  }),
  "install-dir": new StringParameter({
    help: `Specify an installation directory, instead of using the directory of the Garden CLI being used. Implies --force.`,
  }),
  "platform": new ChoicesParameter({
    choices: ["macos", "linux", "windows"],
    help: `Override the platform, instead of detecting it automatically.`,
  }),
  "major": new BooleanParameter({
    defaultValue: false,
    // TODO Core 1.0 major release: add these notes:
    //  "Takes precedence over --minor flag if both are defined."
    //  "The latest patch version will be installed if neither --major nor --minor flags are specified."
    help: dedent`
    Install the latest major version of Garden. Falls back to the current version if the greater major version does not exist.

    Note! If you use a non-stable version (i.e. pre-release, or draft, or edge), then the latest possible major version will be installed.`,
  }),
}

export type SelfUpdateArgs = typeof selfUpdateArgs
export type SelfUpdateOpts = typeof selfUpdateOpts

const versionScopes = ["major", "minor", "patch"] as const
export type VersionScope = (typeof versionScopes)[number]

function getVersionScope(opts: ParameterValues<GlobalOptions & SelfUpdateOpts>): VersionScope {
  if (opts["major"]) {
    return "major"
  }
  // TODO Core 1.0 major release: uncomment this:
  // if (opts["minor"]) {
  //   return "minor"
  // }
  return "patch"
}

export function isEdgeVersion(version: string): boolean {
  return version === "edge" || version.startsWith("edge-")
}

export function isPreReleaseVersion(semVersion: semver.SemVer | null): boolean {
  return (semVersion?.prerelease.length || 0) > 0
}

interface SelfUpdateResult {
  currentVersion: string
  latestVersion: string
  desiredVersion: string
  installationDirectory: string
  installedBuild?: string
  installedVersion?: string
  abortReason?: string
}

/**
 * Utilities and wrappers on top of GitHub REST API.
 */
export type Pagination = { pageNumber: number; pageSize: number }

export async function fetchReleases({ pageNumber, pageSize }: Pagination) {
  const results: any[] = await got(
    `${gardenEnv.GARDEN_RELEASES_ENDPOINT}?page=${pageNumber}&per_page=${[pageSize]}`
  ).json()
  return results
}

/**
 * Traverse the Garden releases on GitHub and get the first one matching the given predicate.
 *
 * @param primaryPredicate the primary predicate to identify the wanted release
 * @param fallbackPredicates the list of fallback predicates to be used if the primary one returns no result
 * @param fetcher the optional function to override the default release fetching machinery
 */
export async function findRelease({
  primaryPredicate,
  fallbackPredicates = [],
  fetcher = fetchReleases,
}: {
  primaryPredicate: (any: any) => boolean
  fallbackPredicates?: ((any: any) => boolean)[]
  fetcher?: (pagination: Pagination) => Promise<any[]>
}) {
  const pageSize = 100
  let pageNumber = 1
  let fetchedReleases: any[]
  /*
  Stores already fetched releases. This will be used with the fallback predicates.
  It is a memory consumer, but also a trade-off to avoid GitHub API rate limit errors.
  This will not eat gigs of RAM.
  */
  const allReleases: any[] = []
  do {
    /*
    This returns the releases ordered by 'published_at' field.
    It means that there are 2 ordered subsequences of 0.12.x and 0.13.x releases in the result list,
    but the list itself is not properly ordered.
    */
    fetchedReleases = await fetcher({ pageNumber, pageSize })
    for (const release of fetchedReleases) {
      if (primaryPredicate(release)) {
        return release
      }
    }
    allReleases.push(...fetchedReleases)
    pageNumber++
  } while (fetchedReleases.length > 0)

  for (const fallbackPredicate of fallbackPredicates) {
    for (const release of allReleases) {
      if (fallbackPredicate(release)) {
        return release
      }
    }
  }

  return undefined
}

/**
 * @return the latest version tag
 * @throws {RuntimeError} if the latest version cannot be detected
 */
export async function getLatestVersion(): Promise<string> {
  const latestVersionRes: any = await got(`${gardenEnv.GARDEN_RELEASES_ENDPOINT}/latest`).json()
  const latestVersion = latestVersionRes.tag_name
  if (!latestVersion) {
    throw new RuntimeError({
      message: `Unable to detect the latest Garden version: ${latestVersionRes}`,
    })
  }

  return latestVersion
}

export async function getLatestVersions(numOfStableVersions: number) {
  const res: any = await got(`${gardenEnv.GARDEN_RELEASES_ENDPOINT}?per_page=100`).json()

  return [
    chalk.cyan("edge-acorn"),
    chalk.cyan("edge-bonsai"),
    ...res
      .filter((r: any) => !r.prerelease && !r.draft)
      .map((r: any) => chalk.cyan(r.name))
      .slice(0, numOfStableVersions),
  ]
}

export class SelfUpdateCommand extends Command<SelfUpdateArgs, SelfUpdateOpts> {
  name = "self-update"
  help = "Update the Garden CLI."

  override cliOnly = true
  override noProject = true

  // TODO Core 1.0 major release: add this example (after --major example):
  //  garden self-update --minor  # install the latest minor version (if it exists) greater than the current one
  override description = dedent`
    Updates your Garden CLI in-place.

    Defaults to the latest minor release version, but you can also request a specific release version as an argument.

    Examples:

       garden self-update               # update to the latest minor Garden CLI version
       garden self-update edge-acorn    # switch to the latest edge build of garden 0.12 (which is created anytime a PR is merged to the 0.12 branch)
       garden self-update edge-bonsai   # switch to the latest edge build of garden Bonsai (0.13) (which is created anytime a PR is merged to main)
       garden self-update 0.12.24       # switch to the exact version 0.12.24 of the CLI
       garden self-update --major       # install the latest version, even if it's a major bump
       garden self-update --force       # re-install even if the same version is detected
       garden self-update --install-dir ~/garden  # install to ~/garden instead of detecting the directory
  `

  override arguments = selfUpdateArgs
  override options = selfUpdateOpts

  _basePreReleasesUrl = "https://github.com/garden-io/garden/releases/download/"
  // Overridden during testing
  _baseReleasesUrl = "https://download.garden.io/core/"

  override printHeader({ log }) {
    printHeader(log, "Update Garden", "🗞️")
  }

  async action({
    log,
    args,
    opts,
  }: CommandParams<SelfUpdateArgs, SelfUpdateOpts>): Promise<CommandResult<SelfUpdateResult>> {
    const currentVersion = getPackageVersion()

    let desiredVersion = args.version

    if (desiredVersion && desiredVersion[0] === "v") {
      desiredVersion = desiredVersion.slice(1)
    }

    let installationDirectory = opts["install-dir"]
    let platform = opts.platform

    if (!installationDirectory) {
      installationDirectory = dirname(process.execPath)
      log.info(
        chalk.white(
          "No installation directory specified via --install-dir option. Garden will be re-installed to the current installation directory: "
        ) + chalk.cyan(installationDirectory)
      )
    } else {
      log.info(chalk.white("Installation directory: ") + chalk.cyan(installationDirectory))
    }

    installationDirectory = resolve(installationDirectory)

    log.info(chalk.white("Checking for target and latest versions..."))
    const latestVersion = await getLatestVersion()

    if (!desiredVersion) {
      const versionScope = getVersionScope(opts)
      desiredVersion = await this.findTargetVersion(currentVersion, versionScope)
    }

    log.info(chalk.white("Current Garden version: ") + chalk.cyan(currentVersion))
    log.info(chalk.white("Target Garden version to be installed: ") + chalk.cyan(desiredVersion))
    log.info(chalk.white("Latest release version: ") + chalk.cyan(latestVersion))

    if (!opts.force && !opts["install-dir"] && desiredVersion === currentVersion) {
      log.warn("")
      log.warn(
        chalk.yellow(
          "The desired version and the current version are the same. Nothing to do. Specify --force if you'd like to re-install the same version."
        )
      )
      return {
        result: {
          currentVersion,
          installationDirectory,
          latestVersion,
          desiredVersion,
          abortReason: "Version already installed",
        },
      }
    }

    // Find the executable location
    // -> Make sure it's an actual executable, not a script (e.g. from a local dev build)
    const expectedExecutableName = process.platform === "win32" ? "garden.exe" : "garden"
    if (!opts["install-dir"] && basename(process.execPath) !== expectedExecutableName) {
      log.error(
        chalk.redBright(
          `The executable path ${process.execPath} doesn't indicate this is a normal binary installation for your platform. Perhaps you're running a local development build?`
        )
      )
      return {
        result: {
          currentVersion,
          installationDirectory,
          latestVersion,
          desiredVersion,
          abortReason: "Not running from binary installation",
        },
      }
    }

    const tempDir = await makeTempDir()

    try {
      if (!platform) {
        platform = getPlatform() === "darwin" ? "macos" : getPlatform()
      }

      let architecture = getArchitecture()
      const isArmInRosetta = isDarwinARM()

      // When running under Rosetta,
      // the architecture is reported back as amd64
      // but in this case we want to target an arm64 build
      // so we override the architecture here
      // and then check if the version is supported or not
      // potentially reverting it back to amd64 again
      if (isArmInRosetta) {
        architecture = "arm64"
      }

      if (
        architecture === "arm64" &&
        desiredVersion !== "edge-bonsai" &&
        semver.lt(desiredVersion, ARM64_INTRODUCTION_VERSION)
      ) {
        if (platform === "macos") {
          architecture = "amd64"
          log.info(
            chalk.yellow.bold(
              `No arm64 build available for Garden version ${desiredVersion}. Falling back to amd64 using Rosetta.`
            )
          )
        } else {
          return {
            result: {
              currentVersion,
              latestVersion,
              desiredVersion,
              installationDirectory,
              abortReason: `No arm64 build available for Garden version ${desiredVersion}.`,
            },
          }
        }
      }

      // Fetch the desired version and extract it to a temp directory
      const { build, filename, extension, url } = this.getReleaseArtifactDetails(platform, architecture, desiredVersion)

      log.info("")
      log.info(chalk.white(`Downloading version ${chalk.cyan(desiredVersion)} from ${chalk.underline(url)}...`))

      const tempPath = join(tempDir.path, filename)

      try {
        // See https://github.com/sindresorhus/got/blob/main/documentation/3-streams.md
        const pipeline = promisify(stream.pipeline)
        await pipeline(got.stream(url), createWriteStream(tempPath))
      } catch (err) {
        if (
          err instanceof GotHttpError &&
          err.code === "ERR_NON_2XX_3XX_RESPONSE" &&
          err.response?.statusCode === 404
        ) {
          log.info("")
          log.error(chalk.redBright(`Could not find version ${desiredVersion} for ${build}.`))

          // Print the latest available stable versions
          try {
            const latestVersions = await getLatestVersions(10)

            log.info(
              chalk.white.bold(`Here are the latest available versions: `) + latestVersions.join(chalk.white(", "))
            )
          } catch {}

          return {
            result: {
              currentVersion,
              latestVersion,
              desiredVersion,
              installationDirectory,
              abortReason: "Version not found",
            },
          }
        } else {
          throw err
        }
      }

      // Move the current release to a backup directory
      // -> Name the backup directory by the current version
      const backupRoot = join(installationDirectory, ".backup")
      const backupPath = join(backupRoot, currentVersion)
      await remove(backupPath)
      await mkdirp(backupPath)

      log.info(chalk.white(`Backing up prior installation to ${chalk.gray(backupPath)}...`))

      for (const path of await readdir(installationDirectory)) {
        if (path === ".backup") {
          continue
        }
        const absPath = join(installationDirectory, path)
        await move(absPath, join(backupPath, path))
      }

      // Move the extracted files to the install directory
      log.info(chalk.white(`Extracting to installation directory ${chalk.cyan(installationDirectory)}...`))

      if (extension === "zip") {
        // Note: lazy-loading for startup performance
        const { Extract } = await import("unzipper")

        await new Promise((_resolve, reject) => {
          const extractor = Extract({ path: tempDir.path })

          extractor.on("error", reject)
          extractor.on("finish", _resolve)

          const reader = createReadStream(tempPath)
          reader.pipe(extractor)
        })
      } else {
        await tar.x({
          file: tempPath,
          cwd: tempDir.path,
        })
      }

      await mkdirp(installationDirectory)
      await copy(join(tempDir.path, build), installationDirectory)

      log.info("")
      log.info(chalk.green("Done!"))

      return {
        result: {
          currentVersion,
          installedVersion: desiredVersion,
          installedBuild: build,
          latestVersion,
          desiredVersion,
          installationDirectory,
        },
      }
    } finally {
      await tempDir.cleanup()
    }
  }

  private getReleaseArtifactDetails(platform: string, architecture: Architecture, desiredVersion: string) {
    const extension = platform === "windows" ? "zip" : "tar.gz"
    const build = `${platform}-${architecture}`

    const desiredSemVer = semver.parse(desiredVersion)

    let filename: string
    let url: string
    if (desiredSemVer && isPreReleaseVersion(desiredSemVer)) {
      const desiredVersionWithoutPreRelease = `${desiredSemVer.major}.${desiredSemVer.minor}.${desiredSemVer.patch}`
      filename = `garden-${desiredVersionWithoutPreRelease}-${build}.${extension}`
      url = `${this._basePreReleasesUrl}${desiredVersion}/${filename}`
    } else {
      filename = `garden-${desiredVersion}-${build}.${extension}`
      url = `${this._baseReleasesUrl}${desiredVersion}/${filename}`
    }

    return { build, filename, extension, url }
  }

  /**
   * Returns either the latest patch, or minor, or major version greater than {@code currentVersion}
   * depending on the {@code versionScope}.
   * If the {@code currentVersion} is not a stable version (i.e. it's an edge or a pre-release),
   * then the latest possible version tag will be returned.
   *
   * @param currentVersion the current version of Garden Core
   * @param versionScope the SemVer version scope
   *
   * @return the matching version tag
   * @throws {RuntimeError} if the desired version cannot be detected, or if the current version cannot be recognized as a valid release version
   */
  private async findTargetVersion(currentVersion: string, versionScope: VersionScope): Promise<string> {
    if (isEdgeVersion(currentVersion)) {
      return getLatestVersion()
    }

    const currentSemVer = semver.parse(currentVersion)
    if (isPreReleaseVersion(currentSemVer)) {
      return getLatestVersion()
    }

    // The current version is necessary, it's not possible to proceed without its value
    if (!currentSemVer) {
      throw new RuntimeError({
        message: `Unexpected current version: ${currentVersion}. Please make sure it is either a valid (semver) release version.`,
      })
    }

    const targetVersionPredicate = this.getTargetVersionPredicate(currentSemVer, versionScope)
    const fallbackVersionPredicate = this.getTargetVersionPredicate(currentSemVer, "patch")
    // Currently we support only semver minor and patch versions, so we use patch as a fallback predicate.
    // TODO Core 1.0 implement proper fallback predicates for all semver version parts.
    const targetRelease = await findRelease({
      primaryPredicate: targetVersionPredicate,
      fallbackPredicates: [fallbackVersionPredicate],
    })

    if (!targetRelease) {
      throw new RuntimeError({
        message: `Unable to find the latest Garden version greater or equal than ${currentVersion} for the scope: ${versionScope}`,
      })
    }

    return targetRelease.tag_name
  }

  getTargetVersionPredicate(currentSemVer: semver.SemVer, versionScope: VersionScope) {
    return function _latestVersionInScope(release: any) {
      const tagName = release.tag_name
      // skip pre-release, draft and edge tags
      if (isEdgeVersion(tagName) || release.prerelease || release.draft) {
        return false
      }
      const tagSemVer = semver.parse(tagName)
      // skip any kind of unexpected tag versions, only stable releases should be processed here
      if (!tagSemVer) {
        return false
      }

      switch (versionScope) {
        // TODO Core 1.0: review these semantics and make the necessary corrections
        case "major": {
          if (tagSemVer.major === currentSemVer.major) {
            return tagSemVer.minor > currentSemVer.minor
          }
          return tagSemVer.major >= currentSemVer.major
        }
        case "minor":
          return tagSemVer.major === currentSemVer.major && tagSemVer.minor > currentSemVer.minor
        case "patch":
          return (
            tagSemVer.major === currentSemVer.major &&
            tagSemVer.minor === currentSemVer.minor &&
            /*
            On the patch level of the same major.minor version the version history is linear and properly sorted.
            So, we can use the >= condition here.
            */
            tagSemVer.patch >= currentSemVer.patch
          )
        default: {
          return versionScope satisfies never
        }
      }
    }
  }
}
