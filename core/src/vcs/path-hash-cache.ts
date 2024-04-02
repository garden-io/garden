/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dirname, join } from "path"
import { CACHE_DIR_NAME } from "../constants.js"
import { readFile } from "fs/promises"
import writeFileAtomic from "write-file-atomic"
import { ensureDir, exists } from "fs-extra"
import { RuntimeError } from "../exceptions.js"

interface CacheContent {
  cachedAtCommit: string
  pathHashes: Map<string, string>
}

type PathHashCacheParams = CacheContent & {
  cacheFilePath: string
  state: CacheState
}

function getPathHashCacheFilePath(gardenDirPath: string): string {
  return join(gardenDirPath, CACHE_DIR_NAME, "pathHashes.json")
}

type CacheState = "initialized" | "stored" | "modified"

export class PathHashCache {
  private cacheFilePath: string
  private cachedAtCommit: string
  private pathHashes: Map<string, string>
  private state: CacheState
  private readonly fileMode: number

  private constructor({ cacheFilePath, cachedAtCommit, pathHashes, state }: PathHashCacheParams) {
    this.cacheFilePath = cacheFilePath
    this.cachedAtCommit = cachedAtCommit
    this.pathHashes = pathHashes
    this.state = state
    this.fileMode = 0o600
  }

  public static init(cacheFilePath: string): PathHashCache {
    return new PathHashCache({
      cacheFilePath,
      cachedAtCommit: "",
      pathHashes: new Map<string, string>(),
      state: "initialized",
    })
  }

  public static async load(cacheFilePath: string): Promise<PathHashCache> {
    const buffer = await readFile(cacheFilePath, "utf-8")
    const cacheContent = JSON.parse(buffer.toString()) as CacheContent
    return new PathHashCache({
      cacheFilePath,
      cachedAtCommit: cacheContent.cachedAtCommit,
      pathHashes: new Map<string, string>(Object.entries(cacheContent.pathHashes)),
      state: "stored",
    })
  }

  public static async forGardenProject(gardenDirPath: string): Promise<PathHashCache> {
    const cacheFilePath = getPathHashCacheFilePath(gardenDirPath)
    const cacheFileExists = await exists(cacheFilePath)
    if (cacheFileExists) {
      return await PathHashCache.load(cacheFilePath)
    }

    return PathHashCache.init(cacheFilePath)
  }

  private validateState() {
    if (this.state === "stored") {
      if (!this.cachedAtCommit) {
        throw new RuntimeError({ message: "Cannot store hash paths cache without commit hash." })
      }
    }
  }

  public getCachedAtCommit(): string {
    return this.cachedAtCommit
  }

  public async store(commitHash: string) {
    if (this.state === "stored") {
      return
    }

    this.validateState()
    this.cachedAtCommit = commitHash
    await ensureDir(dirname(this.cacheFilePath))
    const cache = {
      cachedAtCommit: this.cachedAtCommit,
      pathHashes: Object.fromEntries(this.pathHashes.entries()),
    }
    await writeFileAtomic(this.cacheFilePath, JSON.stringify(cache), { mode: this.fileMode })
    this.state = "stored"
  }

  public setPathHash(path: string, hash: string): void {
    if (this.pathHashes.get(path) === hash) {
      return
    }
    this.pathHashes.set(path, hash)
    this.state = "modified"
  }

  public deletePathHash(path: string): void {
    if (!this.pathHashes.has(path)) {
      return
    }
    this.pathHashes.delete(path)
    this.state = "modified"
  }

  public getPathHash(path: string): string | undefined {
    return this.pathHashes.get(path)
  }
}
