/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  spawn as _spawn,
  ChildProcess,
} from "child_process"
import {
  ensureDir,
  pathExists,
  readFile,
  remove,
  writeFile,
} from "fs-extra"
import * as handlebars from "handlebars"
import { resolve } from "path"
import { generateDocs } from "./src/docs/generate"
import { getUrlChecksum } from "../support/support-util"
import * as Bluebird from "bluebird"
import { GitHandler } from "./src/vcs/git"
import { Garden } from "./src/garden"
import { Logger } from "./src/logger/logger"
import { LogLevel } from "./src/logger/log-node"
import execa = require("execa")

const gulp = require("gulp")
const cached = require("gulp-cached")
const packageJson = require("./package.json")
const pegjs = require("gulp-pegjs")
const sourcemaps = require("gulp-sourcemaps")
const gulpTslint = require("gulp-tslint")
const tslint = require("tslint")
const ts = require("gulp-typescript")

const tsConfigFilename = "tsconfig.build.json"
const tsConfigPath = resolve(__dirname, tsConfigFilename)
const tsProject = ts.createProject(tsConfigFilename, {
  declaration: true,
})
const reporter = ts.reporter.longReporter()

const tsSources = resolve(__dirname, "src", "**", "*.ts")
const testTsSources = resolve(__dirname, "test", "**", "*.ts")
const pegjsSources = resolve(__dirname, "src", "*.pegjs")

const tmpDir = resolve(__dirname, "..", "tmp")

const binPath = (name: string) => resolve(__dirname, "node_modules", ".bin", name)

const destDir = "build"

const children: ChildProcess[] = []

process.env.FORCE_COLOR = "true"
process.env.TS_NODE_CACHE = "0"

function spawn(cmd, args, cb) {
  const child = _spawn(cmd, args, { stdio: "pipe", shell: true, env: process.env })
  children.push(child)

  const output: string[] = []
  child.stdout.on("data", (data) => output.push(data.toString()))
  child.stderr.on("data", (data) => output.push(data.toString()))

  child.on("exit", (code) => {
    if (code !== 0) {
      console.log(output.join(""))
      die()
    }
    cb()
  })

  return child
}

function die() {
  for (const child of children) {
    !child.killed && child.kill()
  }
  process.exit(1)
}

process.on("SIGINT", die)
process.on("SIGTERM", die)

// make sure logger is initialized
try {
  Logger.initialize({ level: LogLevel.info })
} catch (_) { }

gulp.task("add-version-files", async () => {
  const staticPath = resolve(__dirname, "static")
  const garden = await Garden.factory(staticPath)

  const modules = await garden.getModules()

  return Bluebird.map(modules, async (module) => {
    const path = module.path
    const versionFilePath = resolve(path, ".garden-version")

    const vcsHandler = new GitHandler(path)
    const treeVersion = await vcsHandler.getTreeVersion(path)

    await writeFile(versionFilePath, JSON.stringify(treeVersion, null, 4) + "\n")
  })
})

gulp.task("generate-docs", (cb) => {
  generateDocs(resolve(__dirname, "..", "docs"))
  cb()
})

gulp.task("mocha", (cb) =>
  spawn(binPath("nyc"), [binPath("mocha")], cb),
)

gulp.task("pegjs", () =>
  gulp.src(pegjsSources)
    .pipe(pegjs({ format: "commonjs" }))
    .pipe(gulp.dest(destDir)),
)

gulp.task("pegjs-watch", () =>
  gulp.watch(pegjsSources, gulp.parallel("pegjs")),
)

gulp.task("tsc", () =>
  tsProject.src()
    .pipe(sourcemaps.init())
    .pipe(tsProject(reporter))
    .on("error", die)
    .pipe(sourcemaps.write())
    .pipe(gulp.dest(destDir)),
)

gulp.task("tsc-watch", () =>
  _spawn(binPath("tsc"), [
    "-w",
    "--pretty",
    "--declaration",
    "-p", tsConfigPath,
    "--outDir", destDir,
    "--preserveWatchOutput",
  ],
    { stdio: "inherit" },
  ),
)

gulp.task("tsfmt", (cb) => {
  spawn(binPath("tsfmt"), ["--verify"], cb)
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

/**
 * Updates our Homebrew tap with the current released package version. Should be run after relasing to NPM.
 */
gulp.task("update-brew", async () => {
  // clone the homebrew-garden tap repo
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
  const sha256 = metadata.dist.shasum.length === 64 ? metadata.dist.shasum : await getUrlChecksum(tarballUrl, "sha256")

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

gulp.task("watch-code", () => {
  const verify = (path) => {
    try {
      _spawn(binPath("tsfmt"), ["--verify", path], { stdio: "inherit" })
    } catch (_) { }
  }

  return gulp.watch([tsSources, testTsSources], gulp.parallel("generate-docs", "tslint", "tslint-tests"))
    .on("add", verify)
    .on("change", verify)
})

gulp.task("build", gulp.parallel("add-version-files", "generate-docs", "pegjs", "tsc"))
gulp.task("test", gulp.parallel("build", "mocha"))
gulp.task("watch", gulp.series(
  "build",
  gulp.parallel("pegjs-watch", "tsc-watch", "watch-code"),
))
gulp.task("default", gulp.series("watch"))
