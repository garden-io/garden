/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"
import execa from "execa"
import { writeFile, readFile, ensureDir, pathExists, remove } from "fs-extra"
import { getUrlChecksum } from "./support/support-util"
import handlebars from "handlebars"
import { find } from "lodash"

const Octokit = require("@octokit/rest")
const gulp = require("gulp")
const checkLicense = require("gulp-license-check")

const tsSources = ["garden-service/src/**/*.ts", "dashboard/src/**/*.ts*"]
const pegjsSources = "garden-service/src/*.pegjs"
const licenseHeaderPath = "support/license-header.txt"
const tmpDir = resolve(__dirname, "tmp")

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
