/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

const { resolve, join } = require("path")

const gulp = require("gulp")
const pegjs = require("gulp-pegjs")

const pegjsSources = resolve(__dirname, "src", "template-string", "*.pegjs")
const destDir = resolve(__dirname, "build")

gulp.task("pegjs", () =>
  gulp.src(pegjsSources)
    .pipe(pegjs({ format: "commonjs" }))
    .pipe(gulp.dest(join(destDir, "src", "template-string"))),
)

gulp.task("pegjs-watch", () =>
  gulp.watch(pegjsSources, gulp.series(["pegjs"])),
)
