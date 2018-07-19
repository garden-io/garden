import { join } from "path"
import { spawn } from "./support/support-util"

const gulp = require("gulp")
const cached = require("gulp-cached")
const checkLicense = require("gulp-license-check")
const gulpTslint = require("gulp-tslint")
const tslint = require("tslint")

const tsConfigFilename = "tsconfig.build.json"
const tsConfigPath = join(__dirname, tsConfigFilename)

const tsSources = "src/**/*.ts"
const testTsSources = "test/**/*.ts"
const pegjsSources = "src/*.pegjs"

const licenseHeaderPath = "support/license-header.txt"

process.env.FORCE_COLOR = "true"

gulp.task("check-licenses", () =>
  gulp.src([tsSources, pegjsSources])
    .pipe(checkLicense({
      path: licenseHeaderPath,
      blocking: true,
      logInfo: false,
      logError: true,
    })),
)

gulp.task("tsfmt", (cb) => {
  spawn("node_modules/.bin/tsfmt", ["--verify"], cb)
})

gulp.task("tslint", () =>
  gulp.src(tsSources)
    .pipe(cached("tslint"))
    .pipe(gulpTslint({
      program: tslint.Linter.createProgram(tsConfigPath),
      formatter: "verbose",
    }))
    .pipe(gulpTslint.report()),
)

gulp.task("tslint-tests", () =>
  gulp.src(testTsSources)
    .pipe(cached("tslint-tests"))
    .pipe(gulpTslint({
      formatter: "verbose",
    }))
    .pipe(gulpTslint.report()),
)

gulp.task("lint", gulp.parallel("check-licenses", "tslint", "tslint-tests", "tsfmt"))
