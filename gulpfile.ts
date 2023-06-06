/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { gulpLicenseCheck } from "./scripts/gulp-license-check-plugin"

const gulp = require("gulp")
const sources = ["core/src/**/*.ts", "core/test/**/*.ts", "core/src/**/*.pegjs", "plugins/**/*.ts", "sdk/**/*.ts"]
const licenseHeaderPath = "support/license-header-js.txt"

process.env.FORCE_COLOR = "true"

gulp.task("check-licenses", () =>
  gulp.src(sources, { ignore: ["**/*.d.ts", "**/node_modules/**/*", "core/src/lib/**/*"] }).pipe(
    gulpLicenseCheck({
      path: licenseHeaderPath,
      blocking: true,
      logInfo: true,
      logError: true,
    })
  )
)
