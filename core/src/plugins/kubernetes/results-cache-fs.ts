/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type {
  CacheableAction,
  ClearResultParams,
  LoadResultParams,
  SchemaVersion,
  StoreResultParams,
} from "./results-cache-base.js"
import { AbstractResultCache } from "./results-cache-base.js"
import fsExtra from "fs-extra"
import { join } from "path"
import writeFileAtomic from "write-file-atomic"
import { CACHE_DIR_NAME } from "../../constants.js"
import type { Log } from "../../logger/log-entry.js"
import { isErrnoException } from "../../exceptions.js"
import { RootLogger } from "../../logger/logger.js"
import type { PluginContext } from "../../plugin-context.js"
import type { AnyZodObject, z } from "zod"
import type { JsonObject } from "type-fest"

const { ensureDir, readFile, remove } = fsExtra

/**
 * Very simple implementation of file-system based cache
 * to be used as a fallback storage for kubernetes Run and Test results.
 *
 * It uses cache keys to name and create JSON files,
 * and stores the values in the JSON files in a configurable cache directory.
 *
 * All operations are fail-safe and no not throw any errors.
 *
 * This class holds the minimal in-memory state,
 * because each Run and Test result
 * is usually read and written only once per Garden command execution.
 */
export class SimpleFileSystemCache {
  private readonly cacheDir: string
  private readonly log: Log

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir
    this.log = RootLogger.getInstance().createLog({ name: "fs-cache" })
  }

  private getFilePath(key: string): string {
    return join(this.cacheDir, `${key}.json`)
  }

  private async readFileContent(filePath: string): Promise<JsonObject | undefined> {
    let rawFileContent: string
    try {
      const buffer = await readFile(filePath)
      rawFileContent = buffer.toString()
    } catch (err: unknown) {
      if (!isErrnoException(err)) {
        throw err
      }

      this.log.debug(`Cannot read data from file ${filePath}; cause: ${err}`)
      return undefined
    }

    try {
      return JSON.parse(rawFileContent) as JsonObject
    } catch (err) {
      this.log.debug(`Cannot deserialize json from file ${filePath}; cause: ${err}`)

      this.log.debug(`Deleting corrupted file ${filePath}`)
      await this.removeFile(filePath)

      return undefined
    }
  }

  private async writeFileContent(filePath: string, value: JsonObject): Promise<JsonObject | undefined> {
    try {
      await writeFileAtomic(filePath, JSON.stringify(value), { mode: undefined })
      return value
    } catch (err: unknown) {
      if (!isErrnoException(err)) {
        throw err
      }

      this.log.debug(`Cannot write data to file ${filePath}; cause: ${err}`)
      return undefined
    }
  }

  private async removeFile(filePath: string): Promise<void> {
    try {
      await remove(filePath)
    } catch (err: unknown) {
      if (!isErrnoException(err)) {
        throw err
      }

      this.log.debug(`Cannot remove file ${filePath}; cause: ${err}`)
      return undefined
    }
  }

  /**
   * Returns a value associated with the {@code key},
   * or {@code undefined} if no key was found or any error occurred.
   *
   * Reads the value from the file defined in the {@code key}.
   */
  public async get(key: string): Promise<JsonObject | undefined> {
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
   * or {@code undefined} if any error occurred.
   */
  public async put(key: string, value: JsonObject): Promise<JsonObject | undefined> {
    await ensureDir(this.cacheDir)

    const filePath = this.getFilePath(key)
    return await this.writeFileContent(filePath, value)
  }

  /**
   * Removes a value associated with the {@code key}.
   *
   * Removes the file defined in the {@code key}.
   * Does nothing if the file was not found or any error occurred.
   */
  public async remove(key: string): Promise<void> {
    const filePath = this.getFilePath(key)
    return await this.removeFile(filePath)
  }
}

export function getLocalActionResultsCacheDir(gardenDirPath: string): string {
  return join(gardenDirPath, CACHE_DIR_NAME, "action-results")
}

export class LocalResultCache<A extends CacheableAction, ResultSchema extends AnyZodObject> extends AbstractResultCache<
  A,
  ResultSchema
> {
  private readonly fsCache: SimpleFileSystemCache
  private readonly schemaVersion: SchemaVersion

  constructor({
    cacheDir,
    schemaVersion,
    resultSchema,
  }: {
    cacheDir: string
    schemaVersion: SchemaVersion
    resultSchema: ResultSchema
  }) {
    super({ resultSchema })
    this.fsCache = new SimpleFileSystemCache(cacheDir)
    this.schemaVersion = schemaVersion
  }

  protected override cacheKey({ ctx, action }: { ctx: PluginContext; action: CacheableAction }): string {
    return `${this.schemaVersion}-${super.cacheKey({ ctx, action })}`
  }

  public async clear({ ctx, action }: ClearResultParams<A>): Promise<void> {
    const key = this.cacheKey({ ctx, action })
    await this.fsCache.remove(key)
  }

  public async load({ ctx, action, log }: LoadResultParams<A>): Promise<z.output<ResultSchema> | undefined> {
    const key = this.cacheKey({ ctx, action })
    const cachedValue = await this.fsCache.get(key)
    if (cachedValue === undefined) {
      return cachedValue
    }

    return this.validateResult(cachedValue, log)
  }

  public async store({
    ctx,
    action,
    log,
    result,
  }: StoreResultParams<A, z.input<ResultSchema>>): Promise<z.output<ResultSchema> | undefined> {
    const validatedResult = this.validateResult(result, log)
    if (validatedResult === undefined) {
      return undefined
    }

    const key = this.cacheKey({ ctx, action })
    await this.fsCache.put(key, validatedResult)
    return validatedResult
  }
}
