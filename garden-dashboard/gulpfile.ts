/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"
import { ensureDir, copy } from "fs-extra"
import { spawn } from "../support/support-util"

module.exports = (gulp) => {
  // We copy the dashboard build directory to the garden-service static directory for the development build.
  // For production builds the copy step is executed in CI.
  // TODO: Remove this and use env vars to detect if Garden is running in dev mode and serve the build
  // from the garden-dashboard directory.
  gulp.task("copy-to-static", async () => {
    const buildDir = resolve(__dirname, "build")
    const destDir = resolve(__dirname, "..", "garden-service", "static", "garden-dashboard", "build")
    await ensureDir(destDir)
    await copy(buildDir, destDir)
  })
  gulp.task("build-ci", () => spawn("./node_modules/.bin/react-scripts", ["build"], __dirname))
  gulp.task("build", gulp.series("build-ci", "copy-to-static"))
}

if (process.cwd() === __dirname) {
  module.exports(require("gulp"))
}
