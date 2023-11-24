/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { augmentGlobs, GitHandler } from "./git.js"
import type { BaseIncludeExcludeFiles, GetFilesParams, IncludeExcludeFilesHandler, VcsFile } from "./vcs.js"
import { isDirectory, matchPath } from "../util/fs.js"
import fsExtra from "fs-extra"
import { pathToCacheContext } from "../cache.js"
import { FileTree } from "./file-tree.js"
import { sep } from "path"

const { pathExists } = fsExtra

type ScanRepoParams = Pick<GetFilesParams, "log" | "path" | "pathDescription" | "failOnPrompt">

interface GitRepoGetFilesParams extends GetFilesParams {
  scanFromProjectRoot: boolean
}

interface GitRepoIncludeExcludeFiles extends BaseIncludeExcludeFiles {
  augmentedIncludes: string[]
}

const getIncludeExcludeFiles: IncludeExcludeFilesHandler<GitRepoGetFilesParams, GitRepoIncludeExcludeFiles> = async (
  params
) => {
  const { include, path, scanFromProjectRoot } = params
  let { exclude } = params

  if (!exclude) {
    exclude = []
  }

  // We allow just passing a path like `foo` as include and exclude params
  // Those need to be converted to globs, but we don't want to touch existing globs
  const augmentedIncludes = include ? await augmentGlobs(path, include) : ["**/*"]
  const augmentedExcludes = await augmentGlobs(path, exclude || [])
  if (scanFromProjectRoot) {
    augmentedExcludes.push("**/.garden/**/*")
  }

  return { include, exclude, augmentedIncludes, augmentedExcludes }
}

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

    const scanFromProjectRoot = scanRoot === this.garden?.projectRoot
    const { augmentedExcludes, augmentedIncludes } = await getIncludeExcludeFiles({ ...params, scanFromProjectRoot })

    log.debug(
      `Found ${moduleFiles.length} files in module path, filtering by ${augmentedIncludes.length} include and ${augmentedExcludes.length} exclude globs`
    )
    log.silly(() => `Include globs: ${augmentedIncludes.join(", ")}`)
    log.silly(() =>
      augmentedExcludes.length > 0 ? `Exclude globs: ${augmentedExcludes.join(", ")}` : "No exclude globs"
    )

    const filtered = moduleFiles.filter(({ path: p }) => {
      if (filter && !filter(p)) {
        return false
      }
      // We remove the subpath from the file path before matching
      // so that the globs can be relative to the module path
      // Previously we prepended the module path to the globs
      // but that caused issues with the glob matching on windows due to backslashes
      const relativePath = p.replace(`${path}${sep}`, "")
      log.silly(() => `Checking if ${relativePath} matches include/exclude globs`)
      return matchPath(relativePath, augmentedIncludes, augmentedExcludes)
    })

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
      params.log.silly(() => `Found cached repository match at ${path}`)
      return existing
    }

    return this.lock.acquire(key.join("|"), async () => {
      existing = this.cache.get(log, key)

      if (existing) {
        log.silly(() => `Found cached repository match at ${path}`)
        return existing
      }

      log.silly(() => `Scanning repository at ${path}`)
      const files = await super.getFiles({ ...params, scanRoot: undefined })

      const fileTree = FileTree.fromFiles(files)

      this.cache.set(log, key, fileTree, pathToCacheContext(path))

      return fileTree
    })
  }
}
