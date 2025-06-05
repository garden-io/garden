/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { isErrnoException } from "../exceptions.js"
import type { Log } from "../logger/log-entry.js"
import { createWriteStream } from "fs"

/**
 * Zip a folder putting its content at the root of the archive
 *
 * @export
 * @param {string} src source folder
 * @param {string} dest destination path (ex. my/destination/path/filename.zip )
 * @param {Log} log logger
 * @returns {Promise}
 */
export async function zipFolder(src: string, dest: string, log: Log) {
  const { default: archiver } = await import("archiver")
  return new Promise<void>(async (resolve, reject) => {
    const output = createWriteStream(dest)
    const archiveOpts = {
      zlib: {
        level: 9,
      },
    }

    // Note: lazy-loading for startup performance
    const archive = archiver("zip", archiveOpts)

    output.on("close", () => {
      resolve()
    })

    archive.on("warning", (err) => {
      if (isErrnoException(err) && err.code === "ENOENT") {
        log.warn(err.message)
      } else {
        log.error(err)
        reject(err)
      }
    })

    archive.on("error", (err) => {
      log.error(err)
      reject(err)
    })

    archive.pipe(output)
    archive.directory(src, false)
    await archive.finalize()
  })
}
