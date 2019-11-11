/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { readFile } from "fs-extra"
import { LogEntry } from "../logger/log-entry"

/**
 * @param type task | test
 * @param name name of the task or test
 * @param version the version of the module that the task/test belongs to
 */
export function getArtifactKey(type: "task" | "test", name: string, version: string) {
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
  log: LogEntry
}) {
  const metadataPath = join(artifactsPath, `.metadata.${key}.json`)
  let files: string[] = []
  try {
    const metadata = await readFile(metadataPath)
    try {
      files = JSON.parse(metadata.toString()).files || []
    } catch (err) {
      log.debug(`Failed parsing artifact metadata file: ${err.message}`)
    }
  } catch (err) {
    log.debug(`Failed reading metadata file: ${err.message}`)
  }
  return files
}
