/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { platform, homedir } from "os"
import { pathExists, createWriteStream, ensureDir, chmod, remove } from "fs-extra"
import { ConfigurationError, ParameterError, GardenBaseError } from "../exceptions"
import { join, dirname } from "path"
import { hashString } from "./util"
import Axios from "axios"
import * as execa from "execa"
import * as tar from "tar"
import { SupportedPlatform } from "../constants"
import { LogEntry } from "../logger/log-entry"
import { Extract } from "unzip"
import { createHash } from "crypto"

const globalGardenPath = join(homedir(), ".garden")
const toolsPath = join(globalGardenPath, "tools")

interface ExecParams {
  cwd?: string
  logEntry?: LogEntry
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

  private toolDir: string
  private targetFilename: string
  private downloadPath: string
  private executablePath: string
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
    this.toolDir = join(toolsPath, this.name)
    this.targetFilename = hashString(this.spec.url, 16)
    this.downloadPath = join(this.toolDir, this.targetFilename)

    const executableSubpath = this.spec.extract
      ? this.spec.extract.executablePath
      : [this.name]
    this.executablePath = join(this.downloadPath, ...executableSubpath)
    this.defaultCwd = dirname(this.executablePath)
  }

  private async download(logEntry?: LogEntry) {
    if (await pathExists(this.executablePath)) {
      return
    }

    logEntry && logEntry.setState(`Fetching ${this.name}...`)
    const debug = logEntry && logEntry.debug(`Downloading ${this.spec.url}...`)

    const response = await Axios({
      method: "GET",
      url: this.spec.url,
      responseType: "stream",
    })
    let endStream = response.data
    let extractor

    await ensureDir(this.downloadPath)

    // compute the sha256 checksum
    const hash = createHash("sha256")
    hash.setEncoding("hex")
    response.data.pipe(hash)

    // return a promise and resolve when download finishes
    return new Promise((resolve, reject) => {
      response.data.on("error", (err) => {
        logEntry && logEntry.setError(`Failed fetching ${this.spec.url}`)
        reject(err)
      })

      if (!this.spec.extract) {
        response.data.pipe(createWriteStream(this.executablePath))
      } else {
        const format = this.spec.extract.format

        if (format === "tar") {
          extractor = tar.x({
            C: this.downloadPath,
            strict: true,
            onwarn: entry => console.log(entry),
          })
        } else if (format === "zip") {
          extractor = Extract({ path: this.downloadPath })
        } else {
          reject(new ParameterError(`Invalid archive format: ${format}`, { name: this.name, spec: this.spec }))
        }

        endStream = extractor
        response.data.pipe(extractor)

        extractor.on("error", (err) => {
          logEntry && logEntry.setError(`Failed extracting ${format} archive ${this.spec.url}`)
          reject(err)
        })
      }

      endStream.on("end", (_) => {
        // validate sha256 if provided
        const sha256 = hash.read()

        if (this.spec.sha256 && sha256 !== this.spec.sha256) {
          reject(new DownloadError(
            `Invalid checksum from ${this.spec.url} (got ${sha256})`,
            { name: this.name, spec: this.spec, sha256 },
          ))
        }

        pathExists(this.executablePath, (err, exists) => {
          if (err) {
            reject(err)
          }

          if (!exists) {
            reject(new ConfigurationError(
              `Archive ${this.spec.url} does not contain a file at ${join(...this.spec.extract!.executablePath)}`,
              { name: this.name, spec: this.spec },
            ))
          }

          chmod(this.executablePath, 0o755, (chmodErr) => {
            if (chmodErr) {
              remove(this.downloadPath, () => reject(chmodErr))
              return
            }

            debug && debug.setSuccess("Done")
            logEntry && logEntry.setSuccess(`Fetched ${this.name}`)
            resolve()
          })
        })
      })
    })
  }

  async exec({ cwd, args, logEntry }: ExecParams) {
    await this.download(logEntry)
    return execa(this.executablePath, args || [], { cwd: cwd || this.defaultCwd })
  }

  async stdout(params: ExecParams) {
    const res = await this.exec(params)
    return res.stdout
  }
}
