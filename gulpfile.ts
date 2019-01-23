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
import { isString, clone, extend, find } from "lodash"

const Octokit = require("@octokit/rest")
const gulp = require("gulp")
const checkLicense = require("gulp-license-check")

const tsSources = ["garden-service/src/**/*.ts", "dashboard/src/**/*.ts*"]
const pegjsSources = "garden-service/src/*.pegjs"
const licenseHeaderPath = "support/license-header.txt"
const modulePaths = ["garden-cli", "garden-service", "garden-sync", "dashboard"]
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

gulp.task("build", gulp.parallel(
  "garden-cli:build",
  "garden-service:build",
  "garden-sync:build-container",
  "dashboard:build",
))
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
  console.log("Pulling the homebrew repo")
  await ensureDir(tmpDir)
  const brewRepoDir = resolve(tmpDir, "homebrew-garden")
  if (await pathExists(brewRepoDir)) {
    await remove(brewRepoDir)
  }
  await execa("git", ["clone", "git@github.com:garden-io/homebrew-garden.git"], { cwd: tmpDir })

  // read the existing formula
  console.log("Reading currently published formula")
  const formulaDir = resolve(brewRepoDir, "Formula")
  await ensureDir(formulaDir)

  // compile the formula handlebars template
  const templatePath = resolve(__dirname, "support", "homebrew-formula.rb")
  const templateString = (await readFile(templatePath)).toString()
  const template = handlebars.compile(templateString)

  // get the metadata from GitHub
  console.log("Preparing formula")
  const octokit = new Octokit()
  const repoName = "garden-io/garden"

  // note: this excludes pre-releases
  const latestRelease = await octokit.request(`GET /repos/${repoName}/releases/latest`)

  const version = latestRelease.data.tag_name.slice(1)
  const releaseId = latestRelease.data.id

  const assets = await octokit.request(`GET /repos/${repoName}/releases/${releaseId}/assets`)

  const tarballUrl = find(assets.data, a => a.name.includes("macos")).browser_download_url
  const sha256 = await getUrlChecksum(tarballUrl, "sha256")

  const formula = template({
    version,
    homepage: "https://garden.io",
    // using a hard-coded description here because Homebrew limits to 80 characters
    description: "Development engine for Kubernetes",
    tarballUrl,
    sha256,
  })

  const formulaPath = resolve(formulaDir, "garden-cli.rb")
  const existingFormula = await pathExists(formulaPath) ? (await readFile(formulaPath)).toString() : ""

  if (formula === existingFormula) {
    console.log("No changes to formula")
  } else {
    console.log("Writing new formula to " + formulaPath)
    await writeFile(formulaPath, formula)

    // check if the formula is OK
    console.log("Auditing formula")
    await execa("brew", ["audit", formulaPath])

    console.log("Pushing to git")
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
