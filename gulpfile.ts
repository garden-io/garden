/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join, resolve } from "path"
import * as execa from "execa"
import { writeFile, readFile, ensureDir, pathExists, remove } from "fs-extra"
import { getUrlChecksum } from "./support/support-util"
import * as handlebars from "handlebars"
import { isString, clone, extend } from "lodash"

const gulp = require("gulp")
const checkLicense = require("gulp-license-check")

const tsSources = ["garden-service/src/**/*.ts"]
const pegjsSources = "src/*.pegjs"
const licenseHeaderPath = "support/license-header.txt"
const modulePaths = ["garden-cli", "garden-service"]
const tmpDir = resolve(__dirname, "tmp")

process.env.FORCE_COLOR = "true"

// import all tasks from nested modules and put a prefix on their name (e.g. "build" -> "garden-service:build")
modulePaths.forEach(m => {
  // override gulp methods to automatically prefix task names
  const prefix = (name) => `${m}:${name}`
  const wrapTask = (nameOrFunction) => isString(nameOrFunction) ? prefix(nameOrFunction) : nameOrFunction

  const gulpfilePath = join(__dirname, m, "gulpfile.ts")
  const tasks = require(gulpfilePath)

  const _gulp = clone(gulp)
  extend(_gulp, {
    ...gulp,
    task: (name, ...args) => gulp.task.bind(gulp)(prefix(name), ...args),
    series: (...args) => gulp.series.bind(gulp)(...args.map(wrapTask)),
    parallel: (...args) => gulp.parallel.bind(gulp)(...args.map(wrapTask)),
    watch: (sources, t) => gulp.watch.bind(gulp)(sources, wrapTask(t)),
  })
  tasks(_gulp)
})

gulp.task("build", gulp.parallel("garden-cli:build", "garden-service:build"))
gulp.task("generate-docs", gulp.parallel("garden-service:generate-docs"))
gulp.task("test", gulp.parallel("garden-service:test"))
gulp.task("watch", gulp.parallel("garden-cli:watch", "garden-service:watch"))

gulp.task("check-licenses", () =>
  gulp.src([...tsSources, pegjsSources])
    .pipe(checkLicense({
      path: licenseHeaderPath,
      blocking: true,
      logInfo: false,
      logError: true,
    })),
)

/**
 * Updates our Homebrew tap with the current released package version. Should be run after relasing to NPM.
 */
gulp.task("update-brew", async () => {
  // clone the homebrew-garden tap repo
  const packageJson = require(join(__dirname, "garden-service", "/package.json"))

  await ensureDir(tmpDir)
  const brewRepoDir = resolve(tmpDir, "homebrew-garden")
  if (await pathExists(brewRepoDir)) {
    await remove(brewRepoDir)
  }
  await execa("git", ["clone", "git@github.com:garden-io/homebrew-garden.git"], { cwd: tmpDir })

  // read the existing formula
  const formulaDir = resolve(brewRepoDir, "Formula")
  await ensureDir(formulaDir)
  const formulaPath = resolve(formulaDir, "garden-cli.rb")
  const existingFormula = await pathExists(formulaPath) ? (await readFile(formulaPath)).toString() : ""

  // compile the formula handlebars template
  const templatePath = resolve(__dirname, "support", "homebrew-formula.rb")
  const templateString = (await readFile(templatePath)).toString()
  const template = handlebars.compile(templateString)

  // get the metadata from npm
  const metadataJson = await execa.stdout("npm", ["view", "garden-cli", "--json"])
  const metadata = JSON.parse(metadataJson)
  const version = metadata["dist-tags"].latest
  const tarballUrl = metadata.dist.tarball
  const sha256 = metadata.dist.shasum.length === 64
    ? metadata.dist.shasum
    : await getUrlChecksum(tarballUrl, "sha256")

  const formula = template({
    version,
    homepage: metadata.homepage || packageJson.homepage,
    description: metadata.description,
    tarballUrl,
    sha256,
  })

  if (formula === existingFormula) {
    console.log("No changes to formula")
  } else {
    await writeFile(formulaPath, formula)

    // check if the formula is OK
    await execa("brew", ["audit", formulaPath])

    for (const args of [
      ["add", formulaPath],
      ["commit", "-m", `update to ${version}`],
      ["tag", version],
      ["push"],
      ["push", "--tags"],
    ]) {
      await execa("git", args, { cwd: brewRepoDir })
    }
  }
})
