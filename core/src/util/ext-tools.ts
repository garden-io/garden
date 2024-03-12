/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import fsExtra from "fs-extra"
const { pathExists, createWriteStream, ensureDir, chmod, remove, move, createReadStream } = fsExtra
import { ConfigurationError, InternalError } from "../exceptions.js"
import { join, dirname, basename, posix } from "path"
import { getArchitecture, getPlatform, isDarwinARM } from "./arch-platform.js"
import { hashString, exec } from "./util.js"
import tar from "tar"
import { GARDEN_GLOBAL_PATH } from "../constants.js"
import type { Log } from "../logger/log-entry.js"
import { createHash } from "node:crypto"
import crossSpawn from "cross-spawn"
import { spawn } from "./util.js"
import type { Writable } from "stream"
import got from "got"
import type { PluginToolSpec, ToolBuildSpec } from "../plugin/tools.js"
import { parse } from "url"
import AsyncLock from "async-lock"
import type { PluginContext } from "../plugin-context.js"
import { LogLevel } from "../logger/logger.js"
import { uuidv4 } from "./random.js"
import { streamLogs, waitForProcess } from "./process.js"
import { pipeline } from "node:stream/promises"

const toolsPath = join(GARDEN_GLOBAL_PATH, "tools")
const lock = new AsyncLock()

export interface ExecParams {
  args?: string[]
  cwd?: string
  env?: { [key: string]: string }
  log: Log
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

  constructor({ name, path }: { name: string; path: string }) {
    this.name = name
    this.toolPath = path
  }

  async getPath(_: Log) {
    return this.toolPath
  }

  /**
   * @throws RuntimeError on EMFILE (Too many open files)
   * @throws ChildProcessError on any other error condition
   */
  async exec({ args, cwd, env, log, timeoutSec, input, ignoreError, stdout, stderr }: ExecParams) {
    const path = await this.getPath(log)

    if (!args) {
      args = []
    }
    if (!cwd) {
      cwd = dirname(path)
    }

    log.silly(() => `Execing '${path} ${args!.join(" ")}' in ${cwd}`)

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

  /**
   * @throws RuntimeError on EMFILE (Too many open files)
   * @throws ChildProcessError on any other error condition
   */
  async stdout(params: ExecParams) {
    const res = await this.exec(params)
    return res.stdout
  }

  /**
   * @throws RuntimeError on EMFILE (Too many open files)
   * @throws ChildProcessError on any other error condition
   */
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
   *
   * @throws RuntimeError
   */
  async spawnAndStreamLogs({
    args,
    cwd,
    env,
    log,
    ctx,
    errorPrefix,
  }: SpawnParams & { errorPrefix: string; ctx: PluginContext; statusLine?: Log }) {
    const proc = await this.spawn({ args, cwd, env, log })

    streamLogs({
      proc,
      name: this.name,
      ctx,
    })

    await waitForProcess({
      proc,
      errorPrefix,
    })
  }

  /**
   * @throws RuntimeError on ENOENT (command not found)
   * @throws ChildProcessError on any other error condition
   */
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

const findBuildSpec = (spec: PluginToolSpec, plat: string, arch: string) => {
  return spec.builds.find((build) => build.platform === plat && build.architecture === arch)
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
    super({ name: spec.name, path: "" })

    const platform = getPlatform()
    const architecture = getArchitecture()
    const darwinARM = isDarwinARM()

    let buildSpec: ToolBuildSpec | undefined

    if (darwinARM) {
      // first look for native arch, if not found, then try (potentially emulated) arch
      buildSpec = findBuildSpec(spec, platform, "arm64") || findBuildSpec(spec, platform, "amd64")
    } else if (platform === "alpine") {
      buildSpec = findBuildSpec(spec, "alpine", architecture) || findBuildSpec(spec, "linux", architecture)
    } else {
      buildSpec = findBuildSpec(spec, platform, architecture)!
    }

    if (!buildSpec) {
      throw new ConfigurationError({
        message: `Command ${spec.name} doesn't have a spec for this platform/architecture (${platform}-${architecture}${
          darwinARM ? "; without emulation: darwin-arm" : ""
        })`,
      })
    }

    this.buildSpec = buildSpec

    this.name = spec.name
    this.type = spec.type
    this.spec = spec
    this.toolPath = join(toolsPath, this.name)
    this.versionDirname = hashString(this.buildSpec.url, 16)
    this.versionPath = join(this.toolPath, this.versionDirname)

    this.targetSubpath = this.buildSpec.extract ? this.buildSpec.extract.targetPath : basename(this.buildSpec.url)
    this.chmodDone = false
  }

  override async getPath(log: Log) {
    return this.ensurePath(log)
  }

  async ensurePath(log: Log) {
    await this.download(log)
    const path = join(this.versionPath, ...this.targetSubpath.split(posix.sep))

    if (this.spec.type === "binary") {
      // Make sure the target path is executable
      if (!this.chmodDone) {
        await chmod(path, 0o755)
        this.chmodDone = true
      }
    }
    this.toolPath = path
    return path
  }

  protected async download(log: Log) {
    return lock.acquire(this.versionPath, async () => {
      if (await pathExists(this.versionPath)) {
        return
      }

      const tmpPath = join(this.toolPath, this.versionDirname + "." + uuidv4().substr(0, 8))
      const targetAbsPath = join(tmpPath, ...this.targetSubpath.split(posix.sep))

      const downloadLog = log.createLog().info(`Fetching ${this.name} ${this.spec.version}...`)
      const debug = downloadLog
        .createLog({
          fixLevel: LogLevel.debug,
        })
        .info(`Downloading ${this.buildSpec.url}...`)

      await ensureDir(tmpPath)

      try {
        await this.fetch(tmpPath)

        if (this.buildSpec.extract && !(await pathExists(targetAbsPath))) {
          // if this happens, it's a bug!
          throw new InternalError({
            message: `Error while downloading ${this.name}: Archive ${this.buildSpec.url} does not contain a file or directory at ${this.targetSubpath}`,
          })
        }

        await move(tmpPath, this.versionPath, { overwrite: true })
      } finally {
        // make sure tmp path is cleared after errors
        if (await pathExists(tmpPath)) {
          await remove(tmpPath)
        }
      }

      debug && debug.success("Done")
      downloadLog.success(`Fetched ${this.name} ${this.spec.version}`)
    })
  }

  protected async fetch(tmpPath: string) {
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
    const hash = response.pipe(createHash("sha256"))

    if (!this.buildSpec.extract) {
      const targetExecutable = join(tmpPath, ...this.targetSubpath.split(posix.sep))
      const writeStream = createWriteStream(targetExecutable)
      await pipeline(response, writeStream)
    } else {
      const format = this.buildSpec.extract.format
      let extractor: NodeJS.WritableStream

      if (format === "tar") {
        extractor = tar.x({
          C: tmpPath,
          strict: true,
        })
      } else if (format === "zip") {
        // Note: lazy-loading for startup performance
        const { default: unzipStream } = await import("unzip-stream")
        extractor = unzipStream.Extract({ path: tmpPath })
      } else {
        throw new InternalError({
          message: `Failed to extract ${this.name}: Invalid archive format: ${format}`,
        })
      }

      try {
        await pipeline(response, extractor)
      } catch (e) {
        throw InternalError.wrapError(e, `Failed extracting ${format} archive ${this.buildSpec.url}`)
      }
    }

    // NOTE(steffen): I expected `await finished(hash)` to do the job, but calling that crashed node without an error message for some reason.
    await new Promise((r) => hash.once("readable", r))
    const sha256 = hash.digest("hex")
    if (sha256 !== this.buildSpec.sha256) {
      // if this happens, it's a bug!
      throw new InternalError({
        message: `Failed to download ${this.name}: Invalid checksum from ${this.buildSpec.url} (expected ${this.buildSpec.sha256}, actually got ${sha256})`,
      })
    }
  }
}
