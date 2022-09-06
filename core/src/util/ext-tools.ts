/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { platform } from "os"
import split2 from "split2"
import { pathExists, createWriteStream, ensureDir, chmod, remove, move, createReadStream } from "fs-extra"
import { ConfigurationError, ParameterError, GardenBaseError, RuntimeError } from "../exceptions"
import { join, dirname, basename, posix } from "path"
import { hashString, exec, uuidv4, getPlatform, getArchitecture, getNativeArchitecture } from "./util"
import tar from "tar"
import { GARDEN_GLOBAL_PATH } from "../constants"
import { LogEntry } from "../logger/log-entry"
import { createHash } from "crypto"
import crossSpawn from "cross-spawn"
import { spawn } from "./util"
import { Writable } from "stream"
import got from "got/dist/source"
import { PluginToolSpec, ToolBuildSpec } from "../types/plugin/tools"
import { parse } from "url"
import AsyncLock from "async-lock"
import { PluginContext } from "../plugin-context"

const toolsPath = join(GARDEN_GLOBAL_PATH, "tools")
const lock = new AsyncLock()

export class DownloadError extends GardenBaseError {
  type = "download"
}

export interface ExecParams {
  args?: string[]
  cwd?: string
  env?: { [key: string]: string }
  log: LogEntry
  timeoutSec?: number
  input?: Buffer | string
  ignoreError?: boolean
  stdout?: Writable
  stderr?: Writable
}

export interface SpawnParams extends ExecParams {
  tty?: boolean
  rawMode?: boolean // Only used if tty = true. See also: https://nodejs.org/api/tty.html#tty_readstream_setrawmode_mode
}

export class CliWrapper {
  name: string
  protected toolPath: string

  constructor(name: string, path: string) {
    this.name = name
    this.toolPath = path
  }

  async getPath(_: LogEntry) {
    return this.toolPath
  }

  async exec({ args, cwd, env, log, timeoutSec, input, ignoreError, stdout, stderr }: ExecParams) {
    const path = await this.getPath(log)

    if (!args) {
      args = []
    }
    if (!cwd) {
      cwd = dirname(path)
    }

    log.silly(`Execing '${path} ${args.join(" ")}' in ${cwd}`)

    return exec(path, args, {
      cwd,
      timeout: timeoutSec ? timeoutSec * 1000 : undefined,
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
    return crossSpawn(path, args, { cwd, env, windowsHide: true })
  }

  /**
   * Helper for using spawn with live log streaming. Waits for the command to finish before returning.
   *
   * If an error occurs and no output has been written to stderr, we use stdout for the error message instead.
   */
  async spawnAndStreamLogs({
    args,
    cwd,
    env,
    log,
    ctx,
    errorPrefix,
  }: SpawnParams & { errorPrefix: string; ctx: PluginContext; statusLine?: LogEntry }) {
    const proc = await this.spawn({ args, cwd, env, log })

    const logStream = split2()

    let stdout: string = ""
    let stderr: string = ""

    if (proc.stderr) {
      proc.stderr.pipe(logStream)
      proc.stderr.on("data", (data) => {
        stderr += data
      })
    }

    if (proc.stdout) {
      proc.stdout.pipe(logStream)
      proc.stdout.on("data", (data) => {
        stdout += data
      })
    }

    logStream.on("data", (line: Buffer) => {
      ctx.events.emit("log", { timestamp: new Date().getTime(), data: line })
      const lineStr = line.toString()
      log.verbose(lineStr)
    })

    await new Promise<void>((resolve, reject) => {
      proc.on("error", reject)
      proc.on("close", (code) => {
        if (code === 0) {
          resolve()
        } else {
          // Some commands (e.g. the pulumi CLI) don't log anything to stderr when an error occurs. To handle that,
          // we use `stdout` for the error output instead (in case information relevant to the user is included there).
          const errOutput = stderr.length > 0 ? stderr : stdout
          reject(
            new RuntimeError(`${errorPrefix}:\n${errOutput}`, {
              stdout,
              stderr,
              code,
            })
          )
        }
      })
    })
  }

  async spawnAndWait({ args, cwd, env, log, ignoreError, rawMode, stdout, stderr, timeoutSec, tty }: SpawnParams) {
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
      timeoutSec,
      ignoreError,
      env,
      rawMode,
      stdout,
      stderr,
      tty,
    })
  }
}

export interface PluginTools {
  [key: string]: PluginTool
}

/**
 * This helper class allows you to declare a tool dependency by providing a URL to a single-file binary,
 * or an archive containing an executable, for each of our supported platforms. When executing the tool,
 * the appropriate URL for the current platform will be downloaded and cached in the user's home directory
 * (under .garden/tools/<name>/<url-hash>).
 *
 * Note: The binary or archive currently needs to be self-contained and work without further installation steps.
 */
export class PluginTool extends CliWrapper {
  type: string
  spec: PluginToolSpec
  buildSpec: ToolBuildSpec

  private versionDirname: string
  protected versionPath: string
  protected targetSubpath: string
  private chmodDone: boolean

  constructor(spec: PluginToolSpec) {
    super(spec.name, "")

    const _platform = getPlatform()
    const architecture = getArchitecture()
    const nativeArchitecture = getNativeArchitecture()

    // first look for native arch, if not found, try (potentially emulated) arch
    this.buildSpec = spec.builds.find((build) => {
      return build.platform === _platform && [architecture, nativeArchitecture].includes(build.architecture)
    })!

    if (!this.buildSpec) {
      const testedArchs = new Set(["${_platform}-${architecture}", "${_platform}-${nativeArchitecture}"])
      throw new ConfigurationError(
        `Command ${spec.name} doesn't have a spec for this platform/architecture (${[...testedArchs].join(", ")})`,
        {
          spec,
          platform,
          architecture,
          nativeArchitecture,
        }
      )
    }

    this.name = spec.name
    this.type = spec.type
    this.spec = spec
    this.toolPath = join(toolsPath, this.name)
    this.versionDirname = hashString(this.buildSpec.url, 16)
    this.versionPath = join(this.toolPath, this.versionDirname)

    this.targetSubpath = this.buildSpec.extract ? this.buildSpec.extract.targetPath : basename(this.buildSpec.url)
    this.chmodDone = false
  }

  async getPath(log: LogEntry) {
    await this.download(log)
    const path = join(this.versionPath, ...this.targetSubpath.split(posix.sep))

    if (this.spec.type === "binary") {
      // Make sure the target path is executable
      if (!this.chmodDone) {
        await chmod(path, 0o755)
        this.chmodDone = true
      }
    }

    return path
  }

  protected async download(log: LogEntry) {
    return lock.acquire(this.versionPath, async () => {
      if (await pathExists(this.versionPath)) {
        return
      }

      const tmpPath = join(this.toolPath, this.versionDirname + "." + uuidv4().substr(0, 8))
      const targetAbsPath = join(tmpPath, ...this.targetSubpath.split(posix.sep))

      const logEntry = log.info({
        status: "active",
        msg: `Fetching ${this.name}...`,
      })
      const debug = logEntry.debug(`Downloading ${this.buildSpec.url}...`)

      await ensureDir(tmpPath)

      try {
        await this.fetch(tmpPath, log)

        if (this.buildSpec.extract && !(await pathExists(targetAbsPath))) {
          throw new ConfigurationError(
            `Archive ${this.buildSpec.url} does not contain a file or directory at ${this.targetSubpath}`,
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
    const parsed = parse(this.buildSpec.url)
    const protocol = parsed.protocol

    const response =
      protocol === "file:"
        ? createReadStream(parsed.path!)
        : got.stream({
            method: "GET",
            url: this.buildSpec.url,
          })

    // compute the sha256 checksum
    const hash = createHash("sha256")
    hash.setEncoding("hex")
    response.pipe(hash)

    return new Promise<void>((resolve, reject) => {
      response.on("error", (err) => {
        log.setError(`Failed fetching ${this.buildSpec.url}`)
        reject(err)
      })

      hash.on("readable", () => {
        // validate sha256 if provided
        const sha256 = hash.read()

        // end of stream event
        if (sha256 === null) {
          return
        }

        if (this.buildSpec.sha256 && sha256 !== this.buildSpec.sha256) {
          reject(
            new DownloadError(`Invalid checksum from ${this.buildSpec.url} (got ${sha256})`, {
              name: this.name,
              spec: this.spec,
              sha256,
            })
          )
        }
      })

      if (!this.buildSpec.extract) {
        const targetExecutable = join(tmpPath, ...this.targetSubpath.split(posix.sep))
        response.pipe(createWriteStream(targetExecutable))
        response.on("end", () => resolve())
      } else {
        const format = this.buildSpec.extract.format
        let extractor: Writable

        if (format === "tar") {
          extractor = tar.x({
            C: tmpPath,
            strict: true,
          })
          extractor.on("end", () => resolve())
        } else if (format === "zip") {
          // Note: lazy-loading for startup performance
          const { Extract } = require("unzipper")
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
          log.setError(`Failed extracting ${format} archive ${this.buildSpec.url}`)
          reject(err)
        })
      }
    })
  }
}
