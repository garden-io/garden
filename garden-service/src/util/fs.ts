/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import klaw = require("klaw")
import glob from "glob"
import _spawn from "cross-spawn"
import Bluebird from "bluebird"
import { pathExists, readFile, writeFile } from "fs-extra"
import minimatch = require("minimatch")
import { some } from "lodash"
import uuid from "uuid"
import { join, basename, win32, posix } from "path"
import { ValidationError } from "../exceptions"
import { platform } from "os"
import { VcsHandler } from "../vcs/vcs"
import { LogEntry } from "../logger/log-entry"
import { ModuleConfig } from "../config/module"
import pathIsInside from "path-is-inside"

const VALID_CONFIG_FILENAMES = ["garden.yml", "garden.yaml"]
const metadataFilename = "metadata.json"
export const defaultDotIgnoreFiles = [".gitignore", ".gardenignore"]
export const fixedExcludes = [".git", ".gitmodules", ".garden/**/*", "debug-info*/**"]

/*
  Warning: Don't make any async calls in the loop body when using this function, since this may cause
  funky concurrency behavior.
  */
export async function* scanDirectory(path: string, opts?: klaw.Options): AsyncIterableIterator<klaw.Item> {
  let done = false
  let resolver
  let rejecter

  klaw(path, opts)
    .on("data", (item) => {
      if (item.path !== path) {
        resolver(item)
      }
    })
    .on("error", (err) => {
      rejecter(err)
    })
    .on("end", () => {
      done = true
      resolver()
    })

  // a nice little trick to turn the stream into an async generator
  while (!done) {
    const promise: Promise<klaw.Item> = new Promise((resolve, reject) => {
      resolver = resolve
      rejecter = reject
    })

    yield await promise
  }
}

/**
 * Returns a list of overlapping modules.
 *
 * If a module does not set `include` or `exclude`, and another module is in its path (including
 * when the other module has the same path), the module overlaps with the other module.
 */
export interface ModuleOverlap {
  module: ModuleConfig
  overlaps: ModuleConfig[]
}

export function detectModuleOverlap(moduleConfigs: ModuleConfig[]): ModuleOverlap[] {
  let overlaps: ModuleOverlap[] = []
  for (const config of moduleConfigs) {
    const setsBuildCtx = !!config.include || !!config.exclude
    const matches = moduleConfigs
      .filter((compare) => config.name !== compare.name)
      .filter((compare) => !setsBuildCtx && pathIsInside(compare.path, config.path))
      .sort((a, b) => (a.name > b.name ? 1 : -1))

    if (matches.length > 0) {
      overlaps.push({
        module: config,
        overlaps: matches,
      })
    }
  }
  return overlaps
}

/**
 * Returns the expected full path to the Garden config filename.
 *
 * If a valid config filename is found at the given path, it returns the full path to it.
 * If no config file is found, it returns the path joined with the first value from the VALID_CONFIG_FILENAMES list.
 * (The check for whether or not a project or a module has a valid config file at all is handled elsewehere.)
 *
 * Throws an error if there are more than one valid config filenames at the given path.
 */
export async function getConfigFilePath(path: string) {
  const configFilePaths = await Bluebird.map(VALID_CONFIG_FILENAMES, async (filename) => {
    const configFilePath = join(path, filename)
    return (await pathExists(configFilePath)) ? configFilePath : undefined
  }).filter(Boolean)

  if (configFilePaths.length > 1) {
    throw new ValidationError(`Found more than one Garden config file at ${path}.`, {
      path,
      configFilenames: configFilePaths.map((filePath) => basename(filePath || "")).join(", "),
    })
  }

  return configFilePaths[0] || join(path, VALID_CONFIG_FILENAMES[0])
}

/**
 * Helper function to check whether a given filename is a valid Garden config filename
 */
export function isConfigFilename(filename: string) {
  return VALID_CONFIG_FILENAMES.includes(filename)
}

export async function getChildDirNames(parentDir: string): Promise<string[]> {
  let dirNames: string[] = []
  // Filter on hidden dirs by default. We could make the filter function a param if needed later
  const filter = (item: string) => !basename(item).startsWith(".")

  for await (const item of scanDirectory(parentDir, { depthLimit: 0, filter })) {
    if (!item || !item.stats.isDirectory()) {
      continue
    }
    dirNames.push(basename(item.path))
  }
  return dirNames
}

/**
 * Given a directory path returns an array of module paths for the project.
 *
 * @param {string} dir The directory to scan
 */
export async function findConfigPathsInPath({
  vcs,
  dir,
  include,
  exclude,
  log,
}: {
  vcs: VcsHandler
  dir: string
  include?: string[]
  exclude?: string[]
  log: LogEntry
}) {
  // TODO: we could make this lighter/faster using streaming
  const files = await vcs.getFiles({ path: dir, pathDescription: "project root", include, exclude: exclude || [], log })
  return files.map((f) => f.path).filter((f) => isConfigFilename(basename(f)))
}

/**
 * Converts a Windows-style path to a cygwin style path (e.g. C:\some\folder -> /cygdrive/c/some/folder).
 */
export function toCygwinPath(path: string) {
  const parsed = win32.parse(path)
  const drive = parsed.root.split(":")[0].toLowerCase()
  const dirs = parsed.dir.split(win32.sep).slice(1)
  const cygpath = posix.join("/cygdrive", drive, ...dirs, parsed.base)

  // make sure trailing slash is retained
  return path.endsWith(win32.sep) ? cygpath + posix.sep : cygpath
}

export function normalizeLocalRsyncPath(path: string) {
  return platform() === "win32" ? toCygwinPath(path) : path
}

/**
 * Return a list of all files in directory at `path`
 */
export async function listDirectory(path: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    glob("**/*", { cwd: path, dot: true }, (err, files) => {
      if (err) {
        reject(err)
      } else {
        resolve(files)
      }
    })
  })
}

/**
 * Given a list of `paths`, return a list of paths that match any of the given `patterns`
 */
export function matchGlobs(paths: string[], patterns: string[]): string[] {
  return paths.filter((path) => some(patterns, (pattern) => minimatch(path, pattern, { dot: true })))
}

/**
 * Check if a path passes through given include/exclude filters.
 *
 * @param path A POSIX-style path
 * @param include List of globs to match for inclusion, or undefined
 * @param exclude List of globs to match for exclusion, or undefined
 */
export function matchPath(path: string, include?: string[], exclude?: string[]) {
  return (
    (!include || matchGlobs([path], include).length === 1) && (!exclude || matchGlobs([path], exclude).length === 0)
  )
}

/**
 * Gets an ID for the current working copy, given the path to the project's `.garden` directory.
 * We do this by storing a `metadata` file in the directory with an ID. The file is created on demand and a new
 * ID is set when it is first generated.
 *
 * The implication is that removing the `.garden` directory resets the ID, so any remote data attached to the ID
 * will be orphaned. Which is usually not a big issue, but something to be mindful of.
 */
export async function getWorkingCopyId(gardenDirPath: string) {
  const metadataPath = join(gardenDirPath, metadataFilename)

  let metadata = {
    workingCopyId: uuid.v4(),
  }

  // TODO: do this in a fully concurrency-safe way
  if (await pathExists(metadataPath)) {
    const metadataContent = await readFile(metadataPath)
    metadata = JSON.parse(metadataContent.toString())
  } else {
    await writeFile(metadataPath, JSON.stringify(metadata))
  }

  return metadata.workingCopyId
}
