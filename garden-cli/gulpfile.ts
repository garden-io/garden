/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { spawn } from "../support/support-util"

const sources = join(__dirname, "**", "*.go")

module.exports = (gulp) => {
  gulp.task("build", () => spawn("go", ["build", "-o", join("build", "garden")], __dirname))
  gulp.task("watch", () => gulp.watch([sources], gulp.parallel("build")))
}

if (process.cwd() === __dirname) {
  module.exports(require("gulp"))
}
