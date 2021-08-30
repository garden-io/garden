/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import tar from "tar"
import { Command, CommandParams, CommandResult } from "./base"
import { printHeader } from "../logger/util"
import { BooleanParameter, ChoicesParameter, StringParameter } from "../cli/params"
import { dedent } from "../util/string"
import { basename, dirname, join, resolve } from "path"
import chalk from "chalk"
import { getArchitecture, getPackageVersion, getPlatform } from "../util/util"
import axios from "axios"
import { RuntimeError } from "../exceptions"
import { makeTempDir } from "../util/fs"
import { createReadStream, createWriteStream } from "fs"
import { copy, mkdirp, move, readdir, remove } from "fs-extra"
import { Extract } from "unzipper"

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
}

export type SelfUpdateArgs = typeof selfUpdateArgs
export type SelfUpdateOpts = typeof selfUpdateOpts

interface SelfUpdateResult {
  currentVersion: string
  latestVersion: string
  installationDirectory: string
  installedBuild?: string
  installedVersion?: string
  abortReason?: string
}

export class SelfUpdateCommand extends Command<SelfUpdateArgs, SelfUpdateOpts> {
  name = "self-update"
  help = "Update the Garden CLI."

  cliOnly = true
  noProject = true

  description = dedent`
    Updates your Garden CLI in-place.

    Defaults to the latest release version, but you can also request a specific release version as an argument.

    Examples:

       garden self-update          # update to the latest Garden CLI version
       garden self-update edge     # switch to the latest edge build (which is created anytime a PR is merged)
       garden self-update 0.12.24  # switch to the 0.12.24 version of the CLI
       garden self-update --force  # re-install even if the same version is detected
       garden self-update --install-dir ~/garden  # install to ~/garden instead of detecting the directory
  `

  arguments = selfUpdateArgs
  options = selfUpdateOpts

  // Overridden during testing
  _baseReleasesUrl = "https://github.com/garden-io/garden/releases/download/"

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

    log.info(chalk.white("Checking for latest version..."))

    const latestVersionRes = await axios({
      url: "https://github.com/garden-io/garden/releases/latest",
      responseType: "json",
      headers: {
        Accept: "application/json",
      },
    })

    if (!latestVersionRes.data.tag_name) {
      throw new RuntimeError(`Unable to detect latest Garden version: ${latestVersionRes.data}`, {
        response: latestVersionRes,
      })
    }

    const latestVersion = latestVersionRes.data.tag_name

    if (!desiredVersion) {
      desiredVersion = latestVersion
    }

    log.info(chalk.white("Installation directory: ") + chalk.cyan(installationDirectory))
    log.info(chalk.white("Current Garden version: ") + chalk.cyan(currentVersion))
    log.info(chalk.white("Latest release version: ") + chalk.cyan(latestVersion))

    if (!opts.force && !opts["install-dir"] && desiredVersion === currentVersion) {
      log.warn("")
      log.warn(
        chalk.yellow(
          "The desired version and the current version are the same. Nothing to do. Specify --force if you'd like to re-install the same version."
        )
      )
      return {
        result: { currentVersion, installationDirectory, latestVersion, abortReason: "Version already installed" },
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
      const architecture = getArchitecture()
      const extension = platform === "windows" ? "zip" : "tar.gz"
      const build = `${platform}-${architecture}`

      const filename = `garden-${desiredVersion}-${build}.${extension}`
      const url = `${this._baseReleasesUrl}${desiredVersion}/${filename}`

      log.info("")
      log.info(chalk.white(`Downloading version ${chalk.cyan(desiredVersion)} from ${chalk.underline(url)}...`))

      const tempPath = join(tempDir.path, filename)

      try {
        const res = await axios({
          url,
          responseType: "stream",
        })

        const writer = createWriteStream(tempPath)
        res.data.pipe(writer)

        await new Promise((_resolve, reject) => {
          writer.on("finish", _resolve)
          writer.on("error", reject)
          res.data.on("error", reject)
        })
      } catch (err) {
        if (err.response?.status === 404) {
          log.info("")
          log.error(chalk.redBright(`Could not find version ${desiredVersion} for ${build}.`))

          // Print the latest available stable versions
          try {
            const res = await axios({
              url: "https://api.github.com/repos/garden-io/garden/releases?per_page=100",
              responseType: "json",
              headers: {
                Accept: "application/vnd.github.v3+json",
              },
            })

            const latestVersions = [
              chalk.cyan("edge"),
              ...res.data
                .filter((r: any) => !r.prerelease && !r.draft)
                .map((r: any) => chalk.cyan(r.name))
                .slice(0, 10),
            ]

            log.info(
              chalk.white.bold(`Here are the latest available versions: `) + latestVersions.join(chalk.white(", "))
            )
          } catch {}

          return {
            result: { currentVersion, latestVersion, installationDirectory, abortReason: "Version not found" },
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
          installationDirectory,
        },
      }
    } finally {
      await tempDir.cleanup()
    }
  }
}
