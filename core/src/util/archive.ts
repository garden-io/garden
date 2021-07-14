/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { LogEntry } from "../logger/log-entry"
import { createWriteStream } from "fs"
import archiver = require("archiver")

/**
 * Zip a folder putting its content at the root of the archive
 *
 * @export
 * @param {string} src source folder
 * @param {string} dest destination path (ex. my/destination/path/filename.zip )
 * @param {LogEntry} log logger
 * @returns {Promise}
 */
export async function zipFolder(src: string, dest: string, log: LogEntry) {
  return new Promise<void>((resolve, reject) => {
    const output = createWriteStream(dest)
    const archiveOpts = {
      zlib: {
        level: 9,
      },
    }
    const archive = archiver("zip", archiveOpts)

    output.on("close", () => {
      resolve()
    })

    archive.on("warning", (err) => {
      if (err.code === "ENOENT") {
        log.warn(err)
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
    archive.finalize()
  })
}
