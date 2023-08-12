/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { GitHandler, augmentGlobs } from "./git"
import type { GetFilesParams, VcsFile } from "./vcs"
import { isDirectory, joinWithPosix, matchPath } from "../util/fs"
import { pathExists } from "fs-extra"
import { pathToCacheContext } from "../cache"

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

    const key = ["git-repo-files", path]
    let repoFiles: VcsFile[] = this.cache.get(log, key)

    if (repoFiles) {
      params.log.info(`Returning existing repo files from cache at ${path}`)
    } else {
      repoFiles = await this.lock.acquire(key.join("|"), async () => {
        params.log.info(`Scanning repository at ${path}`)
        const files = await super.getFiles({
          log,
          path: scanRoot,
          pathDescription: pathDescription || "repository",
          failOnPrompt,
          scanRoot: undefined,
        })

        this.cache.set(log, key, files, pathToCacheContext(path))

        return files
      })
    }

    const include = params.include ? await absGlobs(path, params.include) : [path, join(path, "**", "*")]
    const exclude = await absGlobs(path, params.exclude || [])

    if (scanRoot === this.garden?.projectRoot) {
      exclude.push(join(scanRoot, ".garden", "**", "*"))
    }

    const filtered = repoFiles
      .filter(({ path: p }) => !filter || filter(p))
      // Filter in two steps because path matching is expensive for large lists of files
      // So the preliminary filter can be used to first cut down the list to a more managable size
      .filter(({ path: p }) => matchPath(p, include, exclude))
    return filtered
  }
}

async function absGlobs(basePath: string, globs: string[]): Promise<string[]> {
  const augmented = await augmentGlobs(basePath, globs)
  return augmented?.map((p) => joinWithPosix(basePath, p)) || []
}
