/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as fs from "fs"
import { Transform, TransformCallback } from "stream"
import Vinyl from "vinyl"
import PluginError from "plugin-error"
import chalk from "chalk"

interface LicenseCheckPluginOptions {
  path: string
  blocking?: boolean
  logInfo?: boolean
  logError?: boolean
}

/**
 * This plugin is a fork of https://github.com/magemello/gulp-license-check/blob/master/index.js
 * with less external dependencies as some of those have vulnerabilities.
 */

export const gulpLicenseCheck = (opts: LicenseCheckPluginOptions) => {
  const HEADER_NOT_PRESENT = "Header not present"
  const HEADER_PRESENT = "Header present"
  opts = opts || {}

  const isInfoLogActive = opts.logInfo === undefined ? true : opts.logInfo
  const isErrorLogActive = opts.logError === undefined ? true : opts.logError
  const isErrorBlocking = opts.blocking === undefined ? true : opts.blocking
  const licenseFilePath = opts.path

  let licenseFileUtf8: string[]

  return new Transform({
    objectMode: true,
    transform(file: Vinyl, encoding: string, callback: TransformCallback) {
      if (file.isNull()) {
        return callback(null, file)
      }

      try {
        if (file.isStream()) {
          checkHeaderFromStream(file, this)
        } else {
          checkHeaderFromBuffer(file, this)
        }
      } catch (error) {
        callback(new PluginError("gulp-license-check", error), null)
        return
      }

      callback(null, file)
    },
  })

  function checkHeaderFromStream(file: Vinyl, ctx: Transform) {
    const chunks: Buffer[] = []
    file.contents.on("data", (chunk: Buffer) => {
      chunks.push(chunk)
    })
    file.contents.on("end", () => {
      const data = Buffer.concat(chunks)
      const bufferFile = new Vinyl({
        path: file.path,
        contents: data,
      })
      checkHeaderFromBuffer(bufferFile, ctx)
    })
  }

  function checkHeaderFromBuffer(file: Vinyl, ctx: Transform) {
    if (isLicenseHeaderPresent(file)) {
      log(file.path, ctx)
    } else {
      error(file.path, ctx)
    }
  }

  function readCurrentFile(file: Vinyl): string[] {
    return file.contents.toString("utf8").split(/\r?\n/)
  }

  function readLicenseHeaderFile(): string[] {
    if (licenseFileUtf8) {
      return licenseFileUtf8
    }

    if (fs.existsSync(licenseFilePath)) {
      return fs.readFileSync(licenseFilePath, "utf8").split(/\r?\n/)
    }

    throw new PluginError("gulp-license-check", new Error("The license header file doesn`t exist " + licenseFilePath))
  }

  function log(filePath: string, ctx: Transform) {
    if (isInfoLogActive) {
      ctx.emit("log", {
        msg: HEADER_PRESENT,
        path: filePath,
      })
      console.log(chalk.green(HEADER_PRESENT), filePath)
    }
  }

  function error(filePath: string, ctx: Transform) {
    if (isErrorBlocking) {
      throw new PluginError(
        "gulp-license-check",
        new Error("The following file doesn`t contain the license header " + filePath)
      )
    } else {
      logError(filePath, ctx)
    }
  }

  function logError(filePath: string, ctx: Transform) {
    if (isErrorLogActive) {
      ctx.emit("log", {
        msg: HEADER_NOT_PRESENT,
        path: filePath,
      })
      console.log(chalk.red(HEADER_NOT_PRESENT), filePath)
    }
  }

  function isLicenseHeaderPresent(currentFile: Vinyl): boolean {
    if (!isFileEmpty(currentFile.contents)) {
      const currentFileUtf8 = readCurrentFile(currentFile)
      const licenseFileUtf8 = readLicenseHeaderFile()
      let skipStrict = 0

      if (currentFileUtf8[0] === '"use strict";') {
        skipStrict = 1
      }

      for (let i = skipStrict; i < licenseFileUtf8.length; i++) {
        if (currentFileUtf8[i + skipStrict] !== licenseFileUtf8[i]) {
          return false
        }
      }
    }
    return true
  }

  function isFileEmpty(fileContents: Buffer): boolean {
    return fileContents.toString("utf8").trim() === ""
  }
}
