/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join, relative } from "path"
import fsExtra from "fs-extra"
const { readFile, writeFile } = fsExtra
import type { Log } from "../logger/log-entry.js"
import type { Garden } from "../garden.js"
import { styles } from "../logger/styles.js"

const maxArtifactLogLines = 5 // max number of artifacts to list in console after run+test runs

/**
 * @param type task | test
 * @param name name of the task or test
 * @param version the version of the module that the task/test belongs to
 */
export function getArtifactKey(type: "run" | "test", name: string, version: string) {
  return `${type}.${name}.${version}`
}

/**
 * Returns the file list from the artifact metadata file (under `.garden/artifacts/.metadata.<key>.json)
 * for the given artifact key.
 *
 * Returns an empty array if the metadata file is not found or if we can't parse it.
 */
export async function getArtifactFileList({
  artifactsPath,
  key,
  log,
}: {
  artifactsPath: string
  key: string
  log: Log
}) {
  const metadataPath = join(artifactsPath, `.metadata.${key}.json`)
  let files: string[] = []
  try {
    const metadata = await readFile(metadataPath)
    try {
      files = JSON.parse(metadata.toString()).files || []
    } catch (err) {
      log.debug(`Failed parsing artifact metadata file: ${err}`)
    }
  } catch (err) {
    log.debug(`Failed reading metadata file: ${err}`)
  }
  return files
}

/**
 * Copies the artifacts exported by a plugin handler to the user's artifact directory.
 *
 * @param log LogEntry
 * @param artifactsPath the temporary directory path given to the plugin handler
 */
export async function copyArtifacts({
  garden,
  log,
  artifactsPath,
  key,
}: {
  garden: Garden
  log: Log
  artifactsPath: string
  key: string
}) {
  let files: string[] = []

  // Note: lazy-loading for startup performance
  const { default: cpy } = await import("cpy")

  try {
    files = await cpy("./**/*", garden.artifactsPath, { cwd: artifactsPath })
  } catch (err) {
    if (!(err instanceof Error)) {
      throw err
    }
    // Ignore error thrown when the directory is empty
    if (err.name !== "CpyError" || !err.message.includes("the file doesn't exist")) {
      throw err
    }
  }

  const count = files.length

  if (count > 0) {
    // Log the exported artifact paths (but don't spam the console)
    if (count > maxArtifactLogLines) {
      files = files.slice(0, maxArtifactLogLines)
    }
    for (const file of files) {
      log.info(styles.primary(`→ Artifact: ${relative(garden.projectRoot, file)}`))
    }
    if (count > maxArtifactLogLines) {
      log.info(styles.primary(`→ Artifact: … plus ${count - maxArtifactLogLines} more files`))
    }
  }

  // Write list of files to a metadata file
  const metadataPath = join(garden.artifactsPath, `.metadata.${key}.json`)
  const metadata = {
    key,
    files: files.sort(),
  }
  await writeFile(metadataPath, JSON.stringify(metadata))

  return files
}
