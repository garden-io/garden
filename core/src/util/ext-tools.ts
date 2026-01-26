/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import fsExtra from "fs-extra"
import { InternalError, RuntimeError } from "../exceptions.js"
import { basename, dirname, join, posix } from "path"
import { getArchitecture, getPlatform, isDarwinARM } from "./arch-platform.js"
import { exec, hashString, prepareClearTextEnv, spawn } from "./util.js"
import tar from "tar"
import { GARDEN_GLOBAL_PATH } from "../constants.js"
import type { Log } from "../logger/log-entry.js"
import { createHash } from "node:crypto"
import crossSpawn from "cross-spawn"
import type { Writable } from "stream"
import got from "got"
import type { PluginToolSpec, ToolBuildSpec } from "../plugin/tools.js"
import { parse } from "url"
import AsyncLock from "async-lock"
import type { PluginContext } from "../plugin-context.js"
import { LogLevel } from "../logger/logger.js"
import { uuidv4 } from "./random.js"
import { pipeline } from "node:stream/promises"
import type { MaybeSecret } from "./secrets.js"
import split2 from "split2"
import which from "which"
import { titleize } from "./string.js"

const { pathExists, createWriteStream, ensureDir, chmod, remove, move, createReadStream } = fsExtra

const toolsPath = join(GARDEN_GLOBAL_PATH, "tools")
const lock = new AsyncLock()

export interface ExecParams {
  args?: string[]
  cwd?: string
  env?: Record<string, MaybeSecret | undefined>
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

export abstract class CliWrapper {
  public readonly name: string
  protected abstract readonly toolPath: string

  constructor({ name }: { name: string }) {
    this.name = name
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
      environment: env,
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
    return crossSpawn(path, args, { cwd, env: prepareClearTextEnv(env), windowsHide: true })
  }

  /**
   * Helper for using exec with live log streaming. Waits for the command to finish before returning.
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
  }: SpawnParams & { errorPrefix: string; ctx: PluginContext; statusLine?: Log }) {
    const logEventContext = {
      origin: this.name,
      level: "verbose" as const,
    }

    const logStream = split2()
    logStream.on("data", (line: Buffer) => {
      const logLine = line.toString()
      ctx.events.emit("log", { timestamp: new Date().toISOString(), msg: logLine, ...logEventContext })
    })

    return await this.spawnAndWait({ args, cwd, env, log, stdout: logStream, stderr: logStream })
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
      log,
    })
  }
}

/**
 * A wrapper around the CLI tool that can be found globally on the PATH (i.e. the one that shows up when
 * you run `which <tool>` in a terminal).
 */
export class GlobalCliWrapper extends CliWrapper {
  constructor({ name }: { name: string }) {
    super({ name })
  }

  protected get toolPath() {
    return this.name
  }

  override async getPath(_: Log) {
    try {
      return await which(this.name)
    } catch (e) {
      throw new RuntimeError({
        message: `${titleize(this.name)} version is set to null, and ${this.name} CLI could not be found on PATH`,
      })
    }
  }
}

/**
 * A wrapper around the CLI tool that can be found at `pathToBinary`. This lets the user specify an absolute path
 * to the binary they want to use (which offers more control than just using the global one on PATH when none of the
 * bundled versions are suitable).
 */
export class CliWrapperFromPath extends CliWrapper {
  private readonly pathToBinary: string

  constructor({ name, pathToBinary }: { name: string; pathToBinary: string }) {
    super({ name })
    this.pathToBinary = pathToBinary
  }

  get toolPath() {
    return this.pathToBinary
  }

  override async getPath(_: Log) {
    try {
      return await which(this.pathToBinary)
    } catch (e) {
      throw new RuntimeError({
        message: `${titleize(this.name)} binary not found at path: ${this.pathToBinary}`,
      })
    }
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
  public readonly type: string
  public readonly spec: PluginToolSpec

  private readonly rootDir: string
  private chmodDone: boolean

  constructor(spec: PluginToolSpec) {
    super({ name: spec.name })

    this.rootDir = join(toolsPath, spec.name)
    this.type = spec.type
    this.spec = spec
    this.chmodDone = false
  }

  override async getPath(log: Log) {
    return this.ensurePath(log)
  }

  /**
   * The full path to the executable tool binary itself.
   */
  protected override get toolPath() {
    return join(this.versionPath, this.targetSubpath)
  }

  /**
   * The name of the root directory for this tool version
   */
  private get versionDirname() {
    return hashString(this.buildSpec.url, 16)
  }

  /**
   * The full path to the root directory for this tool version
   */
  protected get versionPath() {
    return join(this.rootDir, this.versionDirname)
  }

  /**
   * The path to the tool binary relative to `versionPath`
   */
  private get targetSubpath() {
    const posixPath = this.buildSpec.extract ? this.buildSpec.extract.targetPath : basename(this.buildSpec.url)

    // return path with platform-specific path separators (i.e. '\' on windows)
    return join(...posixPath.split(posix.sep))
  }

  /**
   * Lazily find build spec; This means that we only throw in case of missing spec for current platform if the tool is actually used.
   */
  private _buildSpec: ToolBuildSpec | undefined
  private get buildSpec(): ToolBuildSpec {
    if (this._buildSpec) {
      return this._buildSpec
    }

    const spec = this.spec

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
      // if there's no build spec for the platform, that's a bug and the plugin should be aware of that and/or provide tools for all platforms.
      throw new InternalError({
        message: `Command ${spec.name} doesn't have a spec for this platform/architecture (${platform}-${architecture}${
          darwinARM ? "; without emulation: darwin-arm" : ""
        })`,
      })
    }

    this._buildSpec = buildSpec

    return buildSpec
  }

  async ensurePath(log: Log) {
    await this.download(log)

    if (this.spec.type === "binary") {
      // Make sure the target path is executable
      if (!this.chmodDone) {
        await chmod(this.toolPath, 0o755)
        this.chmodDone = true
      }
    }
    return this.toolPath
  }

  protected async download(log: Log) {
    return lock.acquire(this.versionPath, async () => {
      if (await pathExists(this.versionPath)) {
        return
      }

      const tmpPath = join(this.versionPath + "." + uuidv4().substr(0, 8))
      const targetAbsPath = join(tmpPath, this.targetSubpath)

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
            message: `Error while downloading ${this.name}: Archive ${this.buildSpec.url} does not contain a file or directory at ${targetAbsPath}`,
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
      const targetExecutable = join(tmpPath, this.targetSubpath)
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
