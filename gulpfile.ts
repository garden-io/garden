/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

const gulp = require("gulp")
const checkLicense = require("gulp-license-check")

const tsSources = ["garden-service/src/**/*.ts"]
const pegjsSources = "src/*.pegjs"

const licenseHeaderPath = "support/license-header.txt"

process.env.FORCE_COLOR = "true"

gulp.task("check-licenses", () =>
  gulp.src([...tsSources, pegjsSources])
    .pipe(checkLicense({
      path: licenseHeaderPath,
      blocking: true,
      logInfo: false,
      logError: true,
    })),
)
