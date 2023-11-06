/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { GitHandler, augmentGlobs } from "./git.js"
import type { GetFilesParams, VcsFile } from "./vcs.js"
import { isDirectory, joinWithPosix, matchPath } from "../util/fs.js"
import fsExtra from "fs-extra"
const { pathExists } = fsExtra
import { pathToCacheContext } from "../cache.js"
import { FileTree } from "./file-tree.js"

type ScanRepoParams = Pick<GetFilesParams, "log" | "path" | "pathDescription" | "failOnPrompt">

export class GitRepoHandler extends GitHandler {
  override name = "git-repo"

  /**
   * This has the same signature as the GitHandler super class method but instead of scanning the individual directory
   * path directly, we scan the entire enclosing git repository, cache that file list and then filter down to the
   * sub-path. This results in far fewer git process calls but in turn collects more data in memory.
   */
  override async getFiles(params: GetFilesParams): Promise<VcsFile[]> {
    const { log, path, pathDescription, filter, failOnPrompt = false } = params

    if (params.include && params.include.length === 0) {
      // No need to proceed, nothing should be included
      return []
    }

    if (!(await pathExists(path))) {
      log.warn(`${pathDescription} ${path} could not be found.`)
      return []
    }

    if (!(await isDirectory(path))) {
      log.warn(`Path ${path} is not a directory.`)
      return []
    }

    let scanRoot = params.scanRoot || path

    if (!params.scanRoot && params.pathDescription !== "submodule") {
      scanRoot = await this.getRepoRoot(log, path, failOnPrompt)
    }

    const fileTree = await this.scanRepo({
      log,
      path: scanRoot,
      pathDescription: pathDescription || "repository",
      failOnPrompt,
    })

    const moduleFiles = fileTree.getFilesAtPath(path)

    const include = params.include ? await absGlobs(path, params.include) : [path, join(path, "**", "*")]
    const exclude = await absGlobs(path, params.exclude || [])

    if (scanRoot === this.garden?.projectRoot) {
      exclude.push(join(scanRoot, ".garden", "**", "*"))
    }

    log.debug(
      `Found ${moduleFiles.length} files in module path, filtering by ${include.length} include and ${exclude.length} exclude globs`
    )
    log.silly(`Include globs: ${include.join(", ")}`)
    log.silly(exclude.length > 0 ? `Exclude globs: ${exclude.join(", ")}` : "No exclude globs")

    const filtered = moduleFiles.filter(({ path: p }) => (!filter || filter(p)) && matchPath(p, include, exclude))

    log.debug(`Found ${filtered.length} files in module path after glob matching`)

    return filtered
  }

  /**
   * Scans the given repo root and caches the list of files in the tree cache.
   * Uses an async lock to ensure a repo root is only scanned once.
   */
  async scanRepo(params: ScanRepoParams): Promise<FileTree> {
    const { log, path } = params

    const key = ["git-repo-files", path]
    let existing = this.cache.get(log, key) as FileTree

    if (existing) {
      params.log.silly(`Found cached repository match at ${path}`)
      return existing
    }

    return this.lock.acquire(key.join("|"), async () => {
      existing = this.cache.get(log, key)

      if (existing) {
        params.log.silly(`Found cached repository match at ${path}`)
        return existing
      }

      params.log.info(`Scanning repository at ${path}`)
      const files = await super.getFiles({ ...params, scanRoot: undefined })

      const fileTree = FileTree.fromFiles(files)

      this.cache.set(log, key, fileTree, pathToCacheContext(path))

      return fileTree
    })
  }
}

async function absGlobs(basePath: string, globs: string[]): Promise<string[]> {
  const augmented = await augmentGlobs(basePath, globs)
  return augmented?.map((p) => joinWithPosix(basePath, p)) || []
}
