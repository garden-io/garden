/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { AbstractGitHandler, augmentGlobs } from "./git.js"
import { GitSubTreeHandler } from "./git-sub-tree.js"
import type {
  BaseIncludeExcludeFiles,
  GetFilesParams,
  IncludeExcludeFilesHandler,
  VcsFile,
  VcsHandlerParams,
} from "./vcs.js"
import { isDirectory, matchPath } from "../util/fs.js"
import fsExtra from "fs-extra"
import { pathToCacheContext } from "../cache.js"
import { FileTree } from "./file-tree.js"
import { normalize, sep } from "path"
import { stableStringify } from "../util/string.js"
import { hashString } from "../util/util.js"
import { Profile } from "../util/profiling.js"
import { realpath } from "fs/promises"

const { pathExists } = fsExtra

type ScanRepoParams = Pick<GetFilesParams, "log" | "path" | "pathDescription" | "failOnPrompt" | "hashUntrackedFiles">

interface GitRepoGetFilesParams extends GetFilesParams {
  scanFromProjectRoot: boolean
}

interface GitRepoIncludeExcludeFiles extends BaseIncludeExcludeFiles {
  augmentedIncludes: string[]
  augmentedExcludes: string[]
}

const getIncludeExcludeFiles: IncludeExcludeFilesHandler<GitRepoGetFilesParams, GitRepoIncludeExcludeFiles> = async (
  params
) => {
  const { include, path, scanFromProjectRoot } = params

  // Make sure action config is not mutated.
  let exclude = !params.exclude ? [] : [...params.exclude]

  // Do the same normalization of the excluded paths like in "subtree" scanning mode.
  // This might be redundant because the non-normalized paths will be handled by `augmentGlobs` below.
  // But this brings no harm and makes the implementation more clear.
  exclude = exclude.map(normalize)

  // We allow just passing a path like `foo` as include and exclude params
  // Those need to be converted to globs, but we don't want to touch existing globs
  const augmentedIncludes = include ? await augmentGlobs(path, include) : ["**/*"]
  const augmentedExcludes = await augmentGlobs(path, exclude || [])
  if (scanFromProjectRoot) {
    augmentedExcludes.push("**/.garden/**/*")
  }

  return { include, exclude, augmentedIncludes, augmentedExcludes }
}

export function getHashedFilterParams({
  filter,
  augmentedIncludes,
  augmentedExcludes,
}: {
  filter: ((path: string) => boolean) | undefined
  augmentedIncludes: string[]
  augmentedExcludes: string[]
}) {
  return hashString(
    stableStringify({
      filter: filter ? filter.toString() : undefined, // We hash the source code of the filter function if provided.
      augmentedIncludes: augmentedIncludes.sort(),
      augmentedExcludes: augmentedExcludes.sort(),
    })
  )
}

@Profile()
export class GitRepoHandler extends AbstractGitHandler {
  private readonly gitHandlerDelegate: GitSubTreeHandler
  override readonly name = "git-repo"

  constructor(params: VcsHandlerParams) {
    super(params)
    this.gitHandlerDelegate = new GitSubTreeHandler(params)
  }

  /**
   * This has the same signature as the `GitSubTreeHandler` class method but instead of scanning the individual directory
   * path directly, we scan the entire enclosing git repository, cache that file list and then filter down to the
   * sub-path. This results in far fewer git process calls but in turn collects more data in memory.
   */
  override async getFiles(params: GetFilesParams): Promise<VcsFile[]> {
    const { log, pathDescription, path: rawPath } = params

    if (!(await pathExists(rawPath))) {
      log.warn(`${pathDescription} ${rawPath} could not be found.`)
      return []
    }

    if (!(await isDirectory(rawPath))) {
      log.warn(`Path ${rawPath} is not a directory.`)
      return []
    }

    /*
    Here we need to evaluate real FS paths and use those in the downstream function calls.
    This is necessary because we use cache that uses paths as parts of the keys.

    If the input path starts with a symlink (e.g. `/var/...` with a symlink `/var -> /private/var`),
    then the git repo root will be evaluated as a real path in the `getRepoRoot()` method,
    and the variable `filesAtPath` declared below would be resolved as an empty array.

    So, we rebuild the params to have all paths resolved to their real values,
    and use these values in all further function calls to ensure cache consistency.
     */
    const normalizedParams: GetFilesParams = {
      ...params,
      path: await realpath(params.path),
      scanRoot: params.scanRoot === undefined ? undefined : await realpath(params.scanRoot),
    }

    const { path, filter, failOnPrompt = false } = normalizedParams

    let scanRoot = normalizedParams.scanRoot || path

    if (!normalizedParams.scanRoot && normalizedParams.pathDescription !== "submodule") {
      scanRoot = await this.getRepoRoot(log, path, failOnPrompt)
    }

    const scanFromProjectRoot = scanRoot === this.projectRoot
    const { augmentedExcludes, augmentedIncludes } = await getIncludeExcludeFiles({
      ...normalizedParams,
      scanFromProjectRoot,
    })

    const hashedFilterParams = getHashedFilterParams({
      filter,
      augmentedIncludes,
      augmentedExcludes,
    })
    const filteredFilesCacheKey = ["git-repo-files", path, hashedFilterParams]

    const cached = this.cache.get(log, filteredFilesCacheKey) as VcsFile[] | undefined
    if (cached) {
      this.profiler.inc("VcsHandler.TreeCache.hits")
      return cached
    }

    if (normalizedParams.include && normalizedParams.include.length === 0) {
      // No need to proceed, nothing should be included
      return []
    }

    const fileTree = await this.scanRepo({
      log,
      path: scanRoot,
      pathDescription: pathDescription || "repository",
      failOnPrompt,
      hashUntrackedFiles: params.hashUntrackedFiles,
    })

    const filesAtPath = fileTree.getFilesAtPath(path)

    log.debug(
      `Found ${filesAtPath.length} files in path ${path}, filtering by ${augmentedIncludes.length} include and ${augmentedExcludes.length} exclude globs`
    )
    log.debug(() => `Include globs: ${augmentedIncludes.join(", ")}`)
    log.debug(() =>
      augmentedExcludes.length > 0 ? `Exclude globs: ${augmentedExcludes.join(", ")}` : "No exclude globs"
    )

    const filtered = this.filterPaths({
      files: filesAtPath,
      path,
      augmentedIncludes,
      augmentedExcludes,
      filter,
    })
    log.debug(`Found ${filtered.length} files in path ${path} after glob matching`)
    this.cache.set(log, filteredFilesCacheKey, filtered, pathToCacheContext(path))
    this.profiler.inc("VcsHandler.TreeCache.misses")

    return filtered
  }

  private filterPaths({
    files,
    path,
    augmentedIncludes,
    augmentedExcludes,
    filter,
  }: {
    files: VcsFile[]
    path: string
    augmentedIncludes: string[]
    augmentedExcludes: string[]
    filter: GetFilesParams["filter"]
  }): VcsFile[] {
    return files.filter(({ path: p }) => {
      if (filter && !filter(p)) {
        return false
      }
      // We remove the subpath from the file path before matching
      // so that the globs can be relative to the module path
      // Previously we prepended the module path to the globs
      // but that caused issues with the glob matching on windows due to backslashes
      const relativePath = p.replace(`${path}${sep}`, "")
      return matchPath(relativePath, augmentedIncludes, augmentedExcludes)
    })
  }

  /**
   * Scans the given repo root and caches the list of files in the tree cache.
   * Uses an async lock to ensure a repo root is only scanned once.
   *
   * Delegates to {@link GitSubTreeHandler.getFiles}.
   */
  private async scanRepo(params: ScanRepoParams): Promise<FileTree> {
    const { log, path } = params

    const key = ["git-repo-files", path]
    let existing = this.cache.get(log, key) as FileTree | undefined

    if (existing) {
      params.log.silly(() => `Found cached repository match at ${path}`)
      this.profiler.inc("VcsHandler.TreeCache.hits")
      return existing
    }

    return this.lock.acquire(key.join("|"), async () => {
      existing = this.cache.get(log, key)

      if (existing) {
        log.silly(() => `Found cached repository match at ${path}`)
        this.profiler.inc("VcsHandler.TreeCache.hits")
        return existing
      }

      log.silly(() => `Scanning repository at ${path}`)
      const files = await this.gitHandlerDelegate.getFiles({ ...params, scanRoot: undefined })

      const fileTree = FileTree.fromFiles(files)

      this.cache.set(log, key, fileTree, pathToCacheContext(path))
      this.profiler.inc("VcsHandler.TreeCache.misses")

      return fileTree
    })
  }
}
