/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
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
import { getPackageVersion, getPlatform } from "../util/util"
import { RuntimeError } from "../exceptions"
import { makeTempDir } from "../util/fs"
import { createReadStream, createWriteStream } from "fs"
import { copy, mkdirp, move, readdir, remove } from "fs-extra"
import { got } from "../util/http"
import { promisify } from "node:util"
import semver from "semver"
import stream from "stream"

const selfUpdateArgs = {
  version: new StringParameter({
    help: `Specify which version to switch/update to.`,
  }),
}

const selfUpdateOpts = {
  "force": new BooleanParameter({
    help: `Install the Garden CLI even if the specified or detected latest version is the same as the current version.`,
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
    Install the latest major version greater than the current one. Falls back to the current version if the greater major version does not exist.

    Note! If you use a non-stable version (i.e. pre-release, or draft, or edge), then the latest possible major version will be installed.`,
  }),
  // TODO Core 1.0 major release: uncomment this:
  // "minor": new BooleanParameter({
  //   defaultValue: false,
  //   help: dedent`Install the latest minor version greater than the current one.
  //   Falls back to the current version if the greater minor version does not exist.
  //
  //   The latest patch version will be installed if neither --major nor --minor flags are specified.
  //
  //   Note! If you use a non-stable version (i.e. pre-release, or draft, or edge),
  //   then the latest possible major version will be installed.`,
  // }),
}

export type SelfUpdateArgs = typeof selfUpdateArgs
export type SelfUpdateOpts = typeof selfUpdateOpts

const versionScopes = ["major", "minor", "patch"] as const
type VersionScope = typeof versionScopes[number]

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
namespace GitHubApi {
  /**
   * Traverse the Garden releases on GitHub and get the first one matching the given predicate.
   *
   * @param predicate the predicate to identify the wanted release
   */
  export async function findRelease(predicate: (any) => boolean) {
    const releasesPerPage = 100
    let page = 1
    let fetchedReleases: any[]
    do {
      fetchedReleases = await got(
        `https://api.github.com/repos/garden-io/garden/releases?page=${page}&per_page=${releasesPerPage}`
      ).json()
      for (const release of fetchedReleases) {
        if (predicate(release)) {
          return release
        }
      }
      page++
    } while (fetchedReleases.length > 0)

    return undefined
  }

  /**
   * @return the latest version tag
   * @throws {RuntimeError} if the latest version cannot be detected
   */
  export async function getLatestVersion(): Promise<string> {
    const latestVersionRes: any = await got("https://api.github.com/repos/garden-io/garden/releases/latest").json()
    const latestVersion = latestVersionRes.tag_name
    if (!latestVersion) {
      throw new RuntimeError(`Unable to detect the latest Garden version: ${latestVersionRes}`, {
        response: latestVersionRes,
      })
    }

    return latestVersionRes.tag_name
  }
}

export class SelfUpdateCommand extends Command<SelfUpdateArgs, SelfUpdateOpts> {
  name = "self-update"
  help = "Update the Garden CLI."

  cliOnly = true
  noProject = true

  // TODO Core 1.0 major release: add this example (after --major example):
  //  garden self-update --minor  # install the latest minor version (if it exists) greater than the current one
  description = dedent`
    Updates your Garden CLI in-place.

    Defaults to the latest release version, but you can also request a specific release version as an argument.

    Examples:

       garden self-update          # update to the latest Garden CLI version
       garden self-update edge     # switch to the latest edge build (which is created anytime a PR is merged)
       garden self-update 0.12.24  # switch to the 0.12.24 version of the CLI
       garden self-update --major  # install the latest major version (if it exists) greater than the current one
       garden self-update --force  # re-install even if the same version is detected
       garden self-update --install-dir ~/garden  # install to ~/garden instead of detecting the directory
  `

  arguments = selfUpdateArgs
  options = selfUpdateOpts

  // Overridden during testing
  _baseReleasesUrl = "https://download.garden.io/core/"

  printHeader({ headerLog }) {
    printHeader(headerLog, "Update Garden", "rolled_up_newspaper")
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
    }

    installationDirectory = resolve(installationDirectory)

    log.info(chalk.white("Checking for target and latest versions..."))
    const latestVersion = await GitHubApi.getLatestVersion()

    if (!desiredVersion) {
      const versionScope = getVersionScope(opts)
      desiredVersion = await this.getTargetVersion(currentVersion, versionScope)
    }

    log.info(chalk.white("Installation directory: ") + chalk.cyan(installationDirectory))
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
      log.error("")
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
      // Fetch the desired version and extract it to a temp directory
      if (!platform) {
        platform = getPlatform() === "darwin" ? "macos" : getPlatform()
      }
      const architecture = "amd64" // getArchitecture()
      const extension = platform === "windows" ? "zip" : "tar.gz"
      const build = `${platform}-${architecture}`

      const filename = `garden-${desiredVersion}-${build}.${extension}`
      const url = `${this._baseReleasesUrl}${desiredVersion}/${filename}`

      log.info("")
      log.info(chalk.white(`Downloading version ${chalk.cyan(desiredVersion)} from ${chalk.underline(url)}...`))

      const tempPath = join(tempDir.path, filename)

      try {
        // See https://github.com/sindresorhus/got/blob/main/documentation/3-streams.md
        const pipeline = promisify(stream.pipeline)
        await pipeline(got.stream(url), createWriteStream(tempPath))
      } catch (err) {
        if (err.code === "ERR_NON_2XX_3XX_RESPONSE" && err.response?.statusCode === 404) {
          log.info("")
          log.error(chalk.redBright(`Could not find version ${desiredVersion} for ${build}.`))

          // Print the latest available stable versions
          try {
            const res: any = await got("https://api.github.com/repos/garden-io/garden/releases?per_page=100").json()

            const latestVersions = [
              chalk.cyan("edge"),
              ...res
                .filter((r: any) => !r.prerelease && !r.draft)
                .map((r: any) => chalk.cyan(r.name))
                .slice(0, 10),
            ]

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
        const { Extract } = require("unzipper")

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
   * @throws {RuntimeError} if the desired version cannot be detected,
   * or if the current version cannot be recognized as a valid release version
   */
  private async getTargetVersion(currentVersion: string, versionScope: VersionScope): Promise<string> {
    if (this.isEdgeVersion(currentVersion)) {
      return GitHubApi.getLatestVersion()
    }

    const currentSemVer = semver.parse(currentVersion)
    const isCurrentPrerelease = currentSemVer?.prerelease.length || 0
    if (isCurrentPrerelease) {
      return GitHubApi.getLatestVersion()
    }

    // The current version is necessary, it's not possible to proceed without its value
    if (!currentSemVer) {
      throw new RuntimeError(
        `Unexpected current version: ${currentVersion}. ` +
          `Please make sure it is either a valid (semver) release version.`,
        {}
      )
    }

    const targetRelease = await GitHubApi.findRelease((release) => {
      const tagName = release.tag_name
      // skip pre-release, draft and edge tags
      if (this.isEdgeVersion(tagName) || release.prerelease || release.draft) {
        return false
      }
      const tagSemVer = semver.parse(tagName)
      // skip any kind of unexpected tag versions, only stable releases should be processed here
      if (!tagSemVer) {
        return false
      }
      return this.targetVersionMatches(tagSemVer, currentSemVer, versionScope)
    })

    if (!targetRelease) {
      throw new RuntimeError(
        `Unable to detect the latest Garden version greater or equal than ${currentVersion} for the scope: ${versionScope}`,
        {}
      )
    }

    return targetRelease.tag_name
  }

  private isEdgeVersion(version: string) {
    return version === "edge" || version.startsWith("edge-")
  }

  private targetVersionMatches(tagSemVer: semver.SemVer, currentSemVer: semver.SemVer, versionScope: VersionScope) {
    switch (versionScope) {
      case "major":
        return tagSemVer.major >= currentSemVer.major
      case "minor":
        return tagSemVer.major === currentSemVer.major && tagSemVer.minor >= currentSemVer.minor
      case "patch":
        return (
          tagSemVer.major === currentSemVer.major &&
          tagSemVer.minor === currentSemVer.minor &&
          tagSemVer.patch >= currentSemVer.patch
        )
      default: {
        const _exhaustiveCheck: never = versionScope
        return _exhaustiveCheck
      }
    }
  }
}
