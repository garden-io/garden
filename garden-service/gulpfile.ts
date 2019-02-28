/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  spawn as _spawn,
} from "child_process"
import { resolve, join } from "path"
import { spawn } from "../support/support-util"

const pegjs = require("gulp-pegjs")
const sourcemaps = require("gulp-sourcemaps")
const ts = require("gulp-typescript")

const tsConfigFilename = "tsconfig.build.json"
const tsConfigPath = resolve(__dirname, tsConfigFilename)
const tsProject = ts.createProject(tsConfigPath, {
  declaration: true,
})

const pegjsSources = resolve(__dirname, "src", "*.pegjs")

const destDir = resolve(__dirname, "build")
const binDir = resolve(__dirname, "bin")

module.exports = (gulp) => {
  gulp.task("add-version-files", () => spawn(join(binDir, "add-version-files.ts"), []))

  gulp.task("build-container", () => spawn("docker", ["build", "-t", "gardenengine/garden-service:latest", __dirname]))

  gulp.task("generate-docs", () => spawn(join(binDir, "generate-docs.ts"), []))

  gulp.task("pegjs", () =>
    gulp.src(pegjsSources)
      .pipe(pegjs({ format: "commonjs" }))
      .pipe(gulp.dest(destDir)),
  )

  gulp.task("tsc", () =>
    tsProject.src()
      .pipe(sourcemaps.init())
      .pipe(tsProject(ts.reporter.fullReporter(true)))
      .pipe(sourcemaps.write())
      .pipe(gulp.dest(destDir)),
  )

  gulp.task("build", gulp.series(
    gulp.parallel("add-version-files", "generate-docs", "pegjs", "tsc"),
    "build-container",
  ))

  gulp.task("build-ci", gulp.parallel(
    "add-version-files", "generate-docs", "pegjs", "tsc",
  ))
}

if (process.cwd() === __dirname) {
  module.exports(require("gulp"))
}
