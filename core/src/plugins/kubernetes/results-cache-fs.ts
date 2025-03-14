/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { CacheStorage, SchemaVersion } from "./results-cache-base.js"
import { CacheStorageError } from "./results-cache-base.js"
import fsExtra from "fs-extra"
import { join } from "path"
import writeFileAtomic from "write-file-atomic"
import { CACHE_DIR_NAME } from "../../constants.js"
import type { Log } from "../../logger/log-entry.js"
import { isErrnoException } from "../../exceptions.js"
import { RootLogger } from "../../logger/logger.js"
import type { JsonObject } from "type-fest"

const { ensureDir, readFile, remove } = fsExtra

class LocalFileSystemCacheError extends CacheStorageError {
  override type = "local-fs-cache-storage"
}

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
export class SimpleLocalFileSystemCacheStorage implements CacheStorage {
  private readonly cacheDir: string
  private readonly schemaVersion: SchemaVersion
  private readonly log: Log

  constructor(cacheDir: string, schemaVersion: SchemaVersion) {
    this.cacheDir = cacheDir
    this.schemaVersion = schemaVersion
    this.log = RootLogger.getInstance().createLog({ name: "fs-cache" })
  }

  private getFilePath(key: string): string {
    return join(this.cacheDir, `${this.schemaVersion}-${key}.json`)
  }

  private async readFileContent(filePath: string): Promise<JsonObject> {
    let rawFileContent: string
    try {
      this.log.silly(`Reading data from file ${filePath}`)
      const buffer = await readFile(filePath)
      rawFileContent = buffer.toString()
    } catch (err: unknown) {
      if (!isErrnoException(err)) {
        throw err
      }

      const errorMsg = `Cannot read data from file ${filePath}; cause: ${err}`
      throw new LocalFileSystemCacheError({ message: errorMsg })
    }

    try {
      return JSON.parse(rawFileContent) as JsonObject
    } catch (err) {
      const errorMsg = `Cannot deserialize json from file ${filePath}; cause: ${err}`

      this.log.debug(`Deleting corrupted file ${filePath}`)
      await this.removeFile(filePath)

      throw new LocalFileSystemCacheError({ message: errorMsg })
    }
  }

  private async writeFileContent(filePath: string, value: JsonObject): Promise<JsonObject> {
    try {
      this.log.silly(`Writing data to file ${filePath}`)
      await writeFileAtomic(filePath, JSON.stringify(value), { mode: undefined })
      return value
    } catch (err: unknown) {
      if (!isErrnoException(err)) {
        throw err
      }

      const errorMsg = `Cannot write data to file ${filePath}; cause: ${err}`
      throw new LocalFileSystemCacheError({ message: errorMsg })
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

      const errorMsg = `Cannot remove file ${filePath}; cause: ${err}`
      throw new LocalFileSystemCacheError({ message: errorMsg })
    }
  }

  /**
   * Returns a value associated with the {@code key},
   * or throws a {@link LocalFileSystemCacheError} if no key was found or any error occurred.
   *
   * Reads the value from the file defined in the {@code key}.
   */
  public async get(key: string): Promise<JsonObject> {
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
  public async put(key: string, value: JsonObject): Promise<JsonObject> {
    await ensureDir(this.cacheDir)

    const filePath = this.getFilePath(key)
    return await this.writeFileContent(filePath, value)
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
