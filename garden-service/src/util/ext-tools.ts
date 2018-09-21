/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { platform, homedir } from "os"
import { pathExists, createWriteStream, ensureDir, chmod, remove, move } from "fs-extra"
import { ConfigurationError, ParameterError, GardenBaseError } from "../exceptions"
import { join, dirname, basename } from "path"
import { hashString } from "./util"
import Axios from "axios"
import * as execa from "execa"
import * as tar from "tar"
import { SupportedPlatform } from "../constants"
import { LogEntry } from "../logger/log-entry"
import { Extract } from "unzipper"
import { createHash } from "crypto"
import * as uuid from "uuid"

const globalGardenPath = join(homedir(), ".garden")
const toolsPath = join(globalGardenPath, "tools")

interface ExecParams {
  cwd?: string
  log: LogEntry
  args?: string[]
}

abstract class Cmd {
  abstract async exec(params: ExecParams): Promise<execa.ExecaReturns>
  abstract async stdout(params: ExecParams): Promise<string>
}

interface BinarySpec {
  url: string
  sha256?: string               // optionally specify sha256 checksum for validation
  extract?: {
    format: "tar" | "zip",      // note: the "tar" format also supports gzip compression
    executablePath: string[],   // the path of the executable in the archive
  }
}

// TODO: support different architectures? (the Garden class currently errors on non-x64 archs, and many tools may
// only be available in x64).
interface BinaryCmdSpec {
  name: string
  specs: { [key in SupportedPlatform]: BinarySpec }
}

export class DownloadError extends GardenBaseError {
  type = "download"
}

/**
 * This helper class allows you to declare a tool dependency by providing a URL to a single-file binary,
 * or an archive containing an executable, for each of our supported platforms. When executing the tool,
 * the appropriate URL for the current platform will be downloaded and cached in the user's home directory
 * (under .garden/tools/<name>/<url-hash>).
 *
 * Note: The binary or archive currently needs to be self-contained and work without further installation steps.
 */
export class BinaryCmd extends Cmd {
  name: string
  spec: BinarySpec

  private toolPath: string
  private versionDirname: string
  private versionPath: string
  private executablePath: string
  private executableSubpath: string[]
  private defaultCwd: string

  constructor(spec: BinaryCmdSpec) {
    super()

    const currentPlatform = platform()
    const platformSpec = spec.specs[currentPlatform]

    if (!platformSpec) {
      throw new ConfigurationError(
        `Command ${spec.name} doesn't have a spec for this platform (${currentPlatform})`,
        { spec, currentPlatform },
      )
    }

    this.name = spec.name
    this.spec = platformSpec
    this.toolPath = join(toolsPath, this.name)
    this.versionDirname = hashString(this.spec.url, 16)
    this.versionPath = join(this.toolPath, this.versionDirname)

    this.executableSubpath = this.spec.extract
      ? this.spec.extract.executablePath
      : [basename(this.spec.url)]
    this.executablePath = join(this.versionPath, ...this.executableSubpath)
    this.defaultCwd = dirname(this.executablePath)
  }

  private async download(log: LogEntry) {
    // TODO: use lockfile to avoid multiple downloads of the same thing
    // (we avoid a race condition by downloading to a temporary path, so it's more about efficiency)

    if (await pathExists(this.executablePath)) {
      return
    }

    const tmpPath = join(this.toolPath, this.versionDirname + "." + uuid.v4().substr(0, 8))
    const tmpExecutable = join(tmpPath, ...this.executableSubpath)

    log.setState(`Fetching ${this.name}...`)
    const debug = log.debug(`Downloading ${this.spec.url}...`)

    await ensureDir(tmpPath)

    try {
      await this.fetch(tmpPath, log)

      if (!(await pathExists(tmpExecutable))) {
        throw new ConfigurationError(
          `Archive ${this.spec.url} does not contain a file at ${join(...this.spec.extract!.executablePath)}`,
          { name: this.name, spec: this.spec },
        )
      }

      await chmod(tmpExecutable, 0o755)
      await move(tmpPath, this.versionPath, { overwrite: true })

    } finally {
      // make sure tmp path is cleared after errors
      if (await pathExists(tmpPath)) {
        await remove(tmpPath)
      }
    }

    debug && debug.setSuccess("Done")
    log.setSuccess(`Fetched ${this.name}`)
  }

  async exec({ cwd, args, log }: ExecParams) {
    await this.download(log)
    return execa(this.executablePath, args || [], { cwd: cwd || this.defaultCwd })
  }

  async stdout(params: ExecParams) {
    const res = await this.exec(params)
    return res.stdout
  }

  private async fetch(targetPath: string, log: LogEntry) {
    const response = await Axios({
      method: "GET",
      url: this.spec.url,
      responseType: "stream",
    })

    // compute the sha256 checksum
    const hash = createHash("sha256")
    hash.setEncoding("hex")
    response.data.pipe(hash)

    return new Promise((resolve, reject) => {
      response.data.on("error", (err) => {
        log.setError(`Failed fetching ${response.request.url}`)
        reject(err)
      })

      hash.on("readable", () => {
        // validate sha256 if provided
        const sha256 = hash.read()

        // end of stream event
        if (sha256 === null) {
          return
        }

        if (this.spec.sha256 && sha256 !== this.spec.sha256) {
          reject(new DownloadError(
            `Invalid checksum from ${this.spec.url} (got ${sha256})`,
            { name: this.name, spec: this.spec, sha256 },
          ))
        }
      })

      if (!this.spec.extract) {
        const targetExecutable = join(targetPath, ...this.executableSubpath)
        response.data.pipe(createWriteStream(targetExecutable))
        response.data.on("end", () => resolve())
      } else {
        const format = this.spec.extract.format
        let extractor

        if (format === "tar") {
          extractor = tar.x({
            C: targetPath,
            strict: true,
            onwarn: entry => console.log(entry),
          })
          extractor.on("end", () => resolve())
        } else if (format === "zip") {
          extractor = Extract({ path: targetPath })
          extractor.on("close", () => resolve())
        } else {
          reject(new ParameterError(`Invalid archive format: ${format}`, { name: this.name, spec: this.spec }))
          return
        }

        response.data.pipe(extractor)

        extractor.on("error", (err) => {
          log.setError(`Failed extracting ${format} archive ${this.spec.url}`)
          reject(err)
        })
      }
    })
  }
}
