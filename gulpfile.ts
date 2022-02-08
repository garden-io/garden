/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

const gulp = require("gulp")
const checkLicense = require("gulp-license-check")

const sources = [
  "core/src/**/*.ts",
  "core/test/**/*.ts",
  "core/src/**/*.pegjs",
  "dashboard/src/**/*.ts*",
  "dashboard/src/**/*.scss",
  "plugins/**/*.ts",
  "sdk/**/*.ts",
]
const licenseHeaderPath = "support/license-header-js.txt"

process.env.FORCE_COLOR = "true"

gulp.task("check-licenses", () =>
  gulp.src(sources, { ignore: ["**/*.d.ts", "**/node_modules/**/*", "core/src/lib/**/*"] })
    .pipe(checkLicense({
      path: licenseHeaderPath,
      blocking: true,
      logInfo: false,
      logError: true,
    })),
)
