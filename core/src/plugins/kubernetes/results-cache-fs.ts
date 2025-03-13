/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type {
  CacheableAction,
  CacheableResult,
  ClearResultParams,
  LoadResultParams,
  ResultValidator,
  SchemaVersion,
  StoreResultParams,
} from "./results-cache.js"
import { AbstractResultCache } from "./results-cache.js"
import AsyncLock from "async-lock"
import fsExtra from "fs-extra"
import { join } from "path"
import writeFileAtomic from "write-file-atomic"
import { CACHE_DIR_NAME } from "../../constants.js"
import type { Log } from "../../logger/log-entry.js"
import { deline } from "../../util/string.js"
import { renderZodError } from "../../config/zod.js"
import { isErrnoException } from "../../exceptions.js"
import { RootLogger } from "../../logger/logger.js"

const { ensureDir, readFile, remove } = fsExtra

/**
 * Very simple implementation of file-system based cache
 * to be used as a fallback storage for kubernetes Run and Test results.
 *
 * It uses cache keys to name and create JSON files,
 * and stores the values in the JSON files in a configurable cache directory.
 *
 * All operations are fail-safe and no not throw any errors.
 * All operations are concurrent-safe and protected by necessary locks.
 *
 * This class holds the minimal in-memory state,
 * because each Run and Test result
 * is usually read and written only once per Garden command execution.
 */
export class SimpleFileSystemCache<T> {
  private readonly cacheDir: string
  private readonly lock: AsyncLock
  private readonly log: Log

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir
    this.lock = new AsyncLock()
    this.log = RootLogger.getInstance().createLog({ name: "fs-cache" })
  }

  private getFilePath(key: string): string {
    return join(this.cacheDir, `${key}.json`)
  }

  private async readFileContent(filePath: string): Promise<string | undefined> {
    return await this.lock.acquire(filePath, async () => {
      try {
        const buffer = await readFile(filePath)
        return buffer.toString()
      } catch (err: unknown) {
        if (!isErrnoException(err)) {
          throw err
        }

        this.log.debug(`Cannot read data from file ${filePath}; cause: ${err}`)
        return undefined
      }
    })
  }

  private async writeFileContent(filePath: string, value: T): Promise<T | undefined> {
    return await this.lock.acquire(filePath, async () => {
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
    })
  }

  private async removeFile(filePath: string): Promise<void> {
    return await this.lock.acquire(filePath, async () => {
      try {
        await remove(filePath)
      } catch (err: unknown) {
        if (!isErrnoException(err)) {
          throw err
        }

        this.log.debug(`Cannot remove file ${filePath}; cause: ${err}`)
        return undefined
      }
    })
  }

  /**
   * Returns a value associated with the {@code key},
   * or {@code undefined} if no key was found or any error occurred.
   *
   * Reads the value from the file defined in the {@code key}.
   */
  public async get(key: string): Promise<T | undefined> {
    const filePath = this.getFilePath(key)

    const rawFileContent = await this.readFileContent(filePath)
    if (rawFileContent === undefined) {
      return rawFileContent
    }

    try {
      return JSON.parse(rawFileContent)
    } catch {
      return undefined
    }
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
  public async put(key: string, value: T): Promise<T | undefined> {
    await this.lock.acquire(this.cacheDir, async () => {
      await ensureDir(this.cacheDir)
    })

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

  public async clear(): Promise<void> {
    await this.lock.acquire(this.cacheDir, async () => {
      await remove(this.cacheDir)
    })
  }
}

export function getLocalKubernetesRunResultsCacheDir(gardenDirPath: string): string {
  return join(gardenDirPath, CACHE_DIR_NAME, "local-k8s-plugin-results")
}

export class LocalResultCache<A extends CacheableAction, R extends CacheableResult> extends AbstractResultCache<A, R> {
  private readonly fsCache: SimpleFileSystemCache<R>

  constructor({
    cacheDir,
    schemaVersion,
    maxLogLength,
    resultValidator,
  }: {
    cacheDir: string
    schemaVersion: SchemaVersion
    maxLogLength: number
    resultValidator: ResultValidator<R>
  }) {
    super({ schemaVersion, maxLogLength, resultValidator })
    this.fsCache = new SimpleFileSystemCache(cacheDir)
  }

  public async clear({ ctx, action }: ClearResultParams<A>): Promise<void> {
    const key = this.cacheKey({ ctx, action })
    await this.fsCache.remove(key)
  }

  public async load({ ctx, action, log }: LoadResultParams<A>): Promise<R | undefined> {
    const key = this.cacheKey({ ctx, action })
    const cachedValue = await this.fsCache.get(key)
    if (cachedValue === undefined) {
      return cachedValue
    }

    return this.validateResult(cachedValue, log)
  }

  public async store({ ctx, action, log, result }: StoreResultParams<A, R>): Promise<R | undefined> {
    const validatedResult = this.validateResult(result, log)
    if (validatedResult === undefined) {
      return undefined
    }

    const trimmedResult = this.trimResult(validatedResult)

    const key = this.cacheKey({ ctx, action })
    await this.fsCache.put(key, trimmedResult)
    return trimmedResult
  }

  private validateResult(data: R, log: Log) {
    const result = this.resultValidator(data)
    if (result.success) {
      return result.data
    } else {
      const errorMessage = deline`
      The provided result doesn't match the expected schema.
      Here is the output: ${renderZodError(result.error)}
      `
      log.debug(errorMessage)
      return undefined
    }
  }
}
