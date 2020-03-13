/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { platform } from "os"
import { pathExists, createWriteStream, ensureDir, chmod, remove, move } from "fs-extra"
import { ConfigurationError, ParameterError, GardenBaseError } from "../exceptions"
import { join, dirname, basename, sep } from "path"
import { hashString, exec } from "./util"
import tar from "tar"
import { SupportedPlatform, GARDEN_GLOBAL_PATH } from "../constants"
import { LogEntry } from "../logger/log-entry"
import { Extract } from "unzipper"
import { createHash } from "crypto"
import uuid from "uuid"
import crossSpawn from "cross-spawn"
import { spawn } from "./util"
import { Writable } from "stream"
import got from "got/dist/source"
const AsyncLock = require("async-lock")

const toolsPath = join(GARDEN_GLOBAL_PATH, "tools")

export interface LibraryExtractSpec {
  // Archive format. Note: the "tar" format also implicitly supports gzip and bz2 compression.
  format: "tar" | "zip"
  // Path to the target file or directory, relative to the download directory, after downloading and
  // extracting the archive. For BinaryCmds, this should point to the executable in the archive.
  targetPath: string[]
}

export interface LibraryPlatformSpec {
  url: string
  // Optionally specify sha256 checksum for validation.
  sha256?: string
  // If the URL contains an archive, provide extraction instructions.
  extract?: LibraryExtractSpec
}

// TODO: support different architectures? (the Garden class currently errors on non-x64 archs, and many tools may
// only be available in x64).
interface LibrarySpec {
  name: string
  specs: { [key in SupportedPlatform]: LibraryPlatformSpec }
}

export class DownloadError extends GardenBaseError {
  type = "download"
}

/**
 * This helper class allows you to declare a library dependency by providing a URL to a file or an archive,
 * for each of our supported platforms. When requesting the path to the library, the appropriate URL for the
 * current platform will be downloaded, extracted (if applicable) and cached in the user's home directory
 * (under .garden/tools/<name>/<url-hash>).
 *
 * Note: The file or archive currently needs to be self-contained and work without further installation steps.
 */
export class Library {
  name: string
  spec: LibraryPlatformSpec

  private lock: any
  private toolPath: string
  private versionDirname: string
  protected versionPath: string
  protected targetSubpath: string[]

  constructor(spec: LibrarySpec, currentPlatform = platform()) {
    const platformSpec = spec.specs[currentPlatform]

    if (!platformSpec) {
      throw new ConfigurationError(`Command ${spec.name} doesn't have a spec for this platform (${currentPlatform})`, {
        spec,
        currentPlatform,
      })
    }

    this.lock = new AsyncLock()

    this.name = spec.name
    this.spec = platformSpec
    this.toolPath = join(toolsPath, this.name)
    this.versionDirname = hashString(this.spec.url, 16)
    this.versionPath = join(this.toolPath, this.versionDirname)

    this.targetSubpath = this.spec.extract ? this.spec.extract.targetPath : [basename(this.spec.url)]
  }

  async getPath(log: LogEntry) {
    await this.download(log)
    return join(this.versionPath, ...this.targetSubpath)
  }

  protected async download(log: LogEntry) {
    return this.lock.acquire("download", async () => {
      if (await pathExists(this.versionPath)) {
        return
      }

      const tmpPath = join(this.toolPath, this.versionDirname + "." + uuid.v4().substr(0, 8))
      const targetAbsPath = join(tmpPath, ...this.targetSubpath)

      const logEntry = log.info({
        symbol: "info",
        msg: `Fetching ${this.name}...`,
      })
      const debug = logEntry.debug(`Downloading ${this.spec.url}...`)

      await ensureDir(tmpPath)

      try {
        await this.fetch(tmpPath, log)

        if (this.spec.extract && !(await pathExists(targetAbsPath))) {
          throw new ConfigurationError(
            `Archive ${this.spec.url} does not contain a file or directory at ${this.targetSubpath.join(sep)}`,
            { name: this.name, spec: this.spec }
          )
        }

        await move(tmpPath, this.versionPath, { overwrite: true })
      } finally {
        // make sure tmp path is cleared after errors
        if (await pathExists(tmpPath)) {
          await remove(tmpPath)
        }
      }

      debug && debug.setSuccess("Done")
      logEntry.setSuccess(`Fetched ${this.name}`)
    })
  }

  protected async fetch(tmpPath: string, log: LogEntry) {
    const response = got.stream({
      method: "GET",
      url: this.spec.url,
    })

    // compute the sha256 checksum
    const hash = createHash("sha256")
    hash.setEncoding("hex")
    response.pipe(hash)

    return new Promise((resolve, reject) => {
      response.on("error", (err) => {
        log.setError(`Failed fetching ${this.spec.url}`)
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
          reject(
            new DownloadError(`Invalid checksum from ${this.spec.url} (got ${sha256})`, {
              name: this.name,
              spec: this.spec,
              sha256,
            })
          )
        }
      })

      if (!this.spec.extract) {
        const targetExecutable = join(tmpPath, ...this.targetSubpath)
        response.pipe(createWriteStream(targetExecutable))
        response.on("end", () => resolve())
      } else {
        const format = this.spec.extract.format
        let extractor: Writable

        if (format === "tar") {
          extractor = tar.x({
            C: tmpPath,
            strict: true,
          })
          extractor.on("end", () => resolve())
        } else if (format === "zip") {
          extractor = Extract({ path: tmpPath })
          extractor.on("close", () => resolve())
        } else {
          reject(
            new ParameterError(`Invalid archive format: ${format}`, {
              name: this.name,
              spec: this.spec,
            })
          )
          return
        }

        response.pipe(extractor)

        extractor.on("error", (err) => {
          log.setError(`Failed extracting ${format} archive ${this.spec.url}`)
          reject(err)
        })
      }
    })
  }
}

interface BinarySpec extends LibrarySpec {
  defaultTimeout?: number
}

export interface ExecParams {
  args?: string[]
  cwd?: string
  env?: { [key: string]: string }
  log: LogEntry
  timeout?: number
  input?: Buffer | string
  ignoreError?: boolean
  stdout?: Writable
  stderr?: Writable
}

export interface SpawnParams extends ExecParams {
  tty?: boolean
}

/**
 * This helper class allows you to declare a tool dependency by providing a URL to a single-file binary,
 * or an archive containing an executable, for each of our supported platforms. When executing the tool,
 * the appropriate URL for the current platform will be downloaded and cached in the user's home directory
 * (under .garden/tools/<name>/<url-hash>).
 *
 * Note: The binary or archive currently needs to be self-contained and work without further installation steps.
 */
export class BinaryCmd extends Library {
  name: string
  spec: LibraryPlatformSpec

  private chmodDone: boolean
  private defaultTimeout: number

  constructor(spec: BinarySpec) {
    super(spec)
    this.chmodDone = false
    this.defaultTimeout = 60
  }

  async getPath(log: LogEntry) {
    const path = await super.getPath(log)
    // Make sure the target path is executable
    if (!this.chmodDone) {
      await chmod(path, 0o755)
      this.chmodDone = true
    }
    return path
  }

  async exec({ args, cwd, env, log, timeout, input, ignoreError, stdout, stderr }: ExecParams) {
    const path = await this.getPath(log)

    if (!args) {
      args = []
    }
    if (!cwd) {
      cwd = dirname(path)
    }

    log.debug(`Execing '${path} ${args.join(" ")}' in ${cwd}`)

    return exec(path, args, {
      cwd,
      timeout: this.getTimeout(timeout) * 1000,
      env,
      input,
      reject: !ignoreError,
      stdout,
      stderr,
    })
  }

  async stdout(params: ExecParams) {
    try {
      const res = await this.exec(params)
      return res.stdout
    } catch (err) {
      // Add log output to error
      if (err.all) {
        err.message += "\n\n" + err.all
      }
      throw err
    }
  }

  async json(params: ExecParams) {
    const out = await this.stdout(params)
    return JSON.parse(out)
  }

  async spawn({ args, cwd, env, log }: SpawnParams) {
    const path = await this.getPath(log)

    if (!args) {
      args = []
    }
    if (!cwd) {
      cwd = dirname(path)
    }

    log.debug(`Spawning '${path} ${args.join(" ")}' in ${cwd}`)
    return crossSpawn(path, args, { cwd, env })
  }

  async spawnAndWait({ args, cwd, env, log, ignoreError, stdout, stderr, timeout, tty }: SpawnParams) {
    const path = await this.getPath(log)

    if (!args) {
      args = []
    }
    if (!cwd) {
      cwd = dirname(path)
    }

    log.debug(`Spawning '${path} ${args.join(" ")}' in ${cwd}`)
    return spawn(path, args || [], {
      cwd,
      timeout: this.getTimeout(timeout),
      ignoreError,
      env,
      stdout,
      stderr,
      tty,
    })
  }

  private getTimeout(timeout?: number) {
    return timeout === undefined ? this.defaultTimeout : timeout
  }
}
