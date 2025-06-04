/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CacheStorage, ResultContainer, SchemaVersion } from "./results-cache-base.js"
import { CacheStorageError } from "./results-cache-base.js"
import fsExtra, { pathExists } from "fs-extra"
import { join } from "path"
import writeFileAtomic from "write-file-atomic"
import { CACHE_DIR_NAME } from "../../constants.js"
import type { Log } from "../../logger/log-entry.js"
import type { GardenErrorParams, NodeJSErrnoException } from "../../exceptions.js"
import { isErrnoException } from "../../exceptions.js"
import { RootLogger } from "../../logger/logger.js"
import type { JsonObject } from "type-fest"
import { listDirectory } from "../../util/fs.js"
import moment from "moment/moment.js"
import { lstat } from "fs/promises"

const { ensureDir, readFile, remove } = fsExtra

type LocalFileSystemCacheErrorParams = {
  message: string
  cause: NodeJSErrnoException | SyntaxError
}

class LocalFileSystemCacheError extends CacheStorageError {
  override readonly type = "local-fs-cache-storage"
  override readonly cause: NodeJSErrnoException | SyntaxError

  constructor(params: GardenErrorParams & LocalFileSystemCacheErrorParams) {
    super(params)
    this.cause = params.cause
  }

  override describe(): string {
    return `${this.message}; cause: ${this.cause}`
  }
}

export const FILESYSTEM_CACHE_EXPIRY_DAYS = 7

/**
 * Very simple implementation of file-system based cache
 * to be used as a fallback storage for kubernetes Run and Test results.
 *
 * It uses cache keys to name and create JSON files,
 * and stores the values in the JSON files in a configurable cache directory.
 *
 * This class holds the minimal in-memory state,
 * because each Run and Test result
 * is usually read and written only once per Garden command execution.
 */
export class SimpleLocalFileSystemCacheStorage<ResultShape> implements CacheStorage<ResultShape> {
  private readonly cacheDir: string
  private readonly schemaVersion: SchemaVersion
  private readonly cacheExpiryDays: number
  private readonly log: Log

  constructor({
    cacheDir,
    schemaVersion,
    cacheExpiryDays,
  }: {
    cacheDir: string
    schemaVersion: SchemaVersion
    cacheExpiryDays: number
  }) {
    this.cacheDir = cacheDir
    this.schemaVersion = schemaVersion
    this.cacheExpiryDays = cacheExpiryDays
    this.log = RootLogger.getInstance().createLog({ name: "garden-local-cache" })
  }

  name() {
    return "Local Cache"
  }

  private getFilePath(key: string): string {
    return join(this.cacheDir, `${this.schemaVersion}-${key}.json`)
  }

  private async readFileContent(filePath: string): Promise<ResultContainer<JsonObject>> {
    let rawFileContent: string
    try {
      this.log.silly(`Reading data from file ${filePath}`)
      const buffer = await readFile(filePath)
      rawFileContent = buffer.toString()
    } catch (err: unknown) {
      if (!isErrnoException(err)) {
        throw err
      }

      if (err.code === "ENOENT") {
        this.log.debug(`No cached result found at ${filePath}`)
        return { found: false, notFoundReason: "Not found." }
      }

      throw new LocalFileSystemCacheError({
        message: `Cannot read cache data from file ${filePath}`,
        code: err.code,
        cause: err,
      })
    }

    try {
      const result = JSON.parse(rawFileContent) as JsonObject
      return { found: true, result }
    } catch (err) {
      if (!(err instanceof SyntaxError)) {
        throw err
      }

      this.log.debug(`Deleting corrupted cache data file ${filePath}`)
      await this.removeFile(filePath)

      throw new LocalFileSystemCacheError({
        message: `Cannot deserialize JSON from cache data file ${filePath}`,
        cause: err,
      })
    }
  }

  private async writeFileContent(filePath: string, value: ResultShape): Promise<ResultShape> {
    try {
      this.log.silly(`Writing data to file ${filePath}`)
      await writeFileAtomic(filePath, JSON.stringify(value), { mode: undefined })
      return value
    } catch (err: unknown) {
      if (!isErrnoException(err)) {
        throw err
      }

      throw new LocalFileSystemCacheError({
        message: `Cannot write data to file ${filePath}`,
        code: err.code,
        cause: err,
      })
    }
  }

  private async removeFile(filePath: string): Promise<void> {
    try {
      this.log.silly(`Removing file ${filePath}`)
      await remove(filePath)
    } catch (err: unknown) {
      if (!isErrnoException(err)) {
        throw err
      }

      throw new LocalFileSystemCacheError({
        message: `Cannot remove cache data file ${filePath}`,
        code: err.code,
        cause: err,
      })
    }
  }

  public async invalidate(): Promise<void> {
    if (!(await pathExists(this.cacheDir))) {
      return
    }

    const filenames = await listDirectory(this.cacheDir, { recursive: false })
    for (const filename of filenames) {
      try {
        const cachedFile = join(this.cacheDir, filename)
        const stat = await lstat(cachedFile)
        // If the file is older than `cacheExpiryDays` days, delete it
        if (moment(stat.birthtime).add(this.cacheExpiryDays, "days").isBefore(moment())) {
          this.log.debug(`cache data file ${filename} is older than ${this.cacheExpiryDays} days, deleting...`)
          await remove(cachedFile)
        }
      } catch (err) {
        if (!isErrnoException(err)) {
          throw err
        }

        this.log.debug(`Could not invalidate cache entry for file ${filename}; cause: ${err}`)
      }
    }
  }

  /**
   * Returns a value associated with the {@code key},
   * or throws a {@link LocalFileSystemCacheError} if no key was found or any error occurred.
   *
   * Reads the value from the file defined in the {@code key}.
   */
  public async get(key: string): Promise<ResultContainer<JsonObject>> {
    const filePath = this.getFilePath(key)
    return await this.readFileContent(filePath)
  }

  /**
   * Stores the value associated with the {@code key}.
   *
   * Stringifies the value and writes in to the file defined in the {@code key}.
   * Ensures the existence of the cache directory.
   *
   * Returns the value back if it was written successfully,
   * or throws a {@link LocalFileSystemCacheError} otherwise.
   */
  public async put(key: string, value: ResultShape): Promise<ResultShape> {
    await ensureDir(this.cacheDir)

    const filePath = this.getFilePath(key)
    const storedValue = await this.writeFileContent(filePath, value)
    if (storedValue === undefined) {
      return storedValue
    }
    return value
  }

  /**
   * Removes a value associated with the {@code key}.
   *
   * Removes the file defined in the {@code key}.
   * Throws a {@link LocalFileSystemCacheError} if any error occurred.
   */
  public async remove(key: string): Promise<void> {
    const filePath = this.getFilePath(key)
    return await this.removeFile(filePath)
  }
}

export function getLocalActionResultsCacheDir(gardenDirPath: string): string {
  return join(gardenDirPath, CACHE_DIR_NAME, "action-results")
}
