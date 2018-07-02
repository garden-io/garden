import {
  spawn as _spawn,
  ChildProcess,
} from "child_process"
import {
  writeFileSync,
} from "fs"
import {
  ensureDir,
  pathExists,
  readFile,
  remove,
  writeFile,
} from "fs-extra"
import * as handlebars from "handlebars"
import {
  join,
  relative,
} from "path"
import { generateDocs } from "./src/docs/generate"
import { getUrlChecksum } from "./support/support-util"
import execa = require("execa")

const gulp = require("gulp")
const cached = require("gulp-cached")
const checkLicense = require("gulp-license-check")
// const debug = require("gulp-debug")
// const exec = require("gulp-exec")
const packageJson = require("./package.json")
const pegjs = require("gulp-pegjs")
const sourcemaps = require("gulp-sourcemaps")
const gulpTslint = require("gulp-tslint")
const tslint = require("tslint")
const ts = require("gulp-typescript")

const tsConfigFilename = "tsconfig.build.json"
const tsConfigPath = join(__dirname, tsConfigFilename)
const tsProject = ts.createProject(tsConfigFilename, {
  declaration: true,
})
const reporter = ts.reporter.longReporter()

const tsSources = "src/**/*.ts"
const testTsSources = "test/**/*.ts"
const pegjsSources = "src/*.pegjs"

const tmpDir = join(__dirname, "tmp")
const licenseHeaderPath = "support/license-header.txt"

const destDir = "build"

class TaskError extends Error {
  toString() {
    return this.message
  }
}

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

gulp.task("add-version-files", (cb) => {
  const gardenBinPath = join("static", "bin", "garden")
  const proc = _spawn("node", [gardenBinPath, "scan", "--output=json"])

  proc.on("error", err => cb(err))

  let output = ""
  let outputWithError = ""
  proc.stdout.on("data", d => {
    output += d
    outputWithError += d
  })
  proc.stderr.on("data", d => outputWithError += d)

  proc.on("close", () => {
    let results
    try {
      results = JSON.parse(output)
    } catch {
      const msg = "Got unexpected output from `garden scan`"
      console.error(msg + "\n" + outputWithError)
      return cb(msg)
    }

    for (const module of <any>results.result) {
      const relPath = relative(__dirname, module.path)
      const versionFilePath = join(__dirname, relPath, ".garden-version")
      writeFileSync(versionFilePath, JSON.stringify(module.version))
    }

    cb()
  })
})

gulp.task("check-licenses", () =>
  gulp.src([tsSources, pegjsSources])
    .pipe(checkLicense({
      path: licenseHeaderPath,
      blocking: true,
      logInfo: false,
      logError: true,
    })),
)

gulp.task("generate-docs", (cb) => {
  generateDocs("docs")
  cb()
})

gulp.task("mocha", (cb) =>
  spawn("node_modules/.bin/nyc", ["node_modules/.bin/mocha"], cb),
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
  _spawn("tsc", [
    "-w",
    "--pretty",
    "--declaration",
    "-p", tsConfigPath,
    "--outDir", destDir,
  ],
    { stdio: "inherit" },
  ),
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

/**
 * Updates our Homebrew tap with the current released package version. Should be run after relasing to NPM.
 */
gulp.task("update-brew", async () => {
  // clone the homebrew-garden tap repo
  const brewRepoDir = join(tmpDir, "homebrew-garden")
  if (await pathExists(brewRepoDir)) {
    await remove(brewRepoDir)
  }
  await execa("git", ["clone", "git@github.com:garden-io/homebrew-garden.git"], { cwd: tmpDir })

  // read the existing formula
  const formulaDir = join(brewRepoDir, "Formula")
  await ensureDir(formulaDir)
  const formulaPath = join(formulaDir, "garden-cli.rb")
  const existingFormula = await pathExists(formulaPath) ? (await readFile(formulaPath)).toString() : ""

  // compile the formula handlebars template
  const templatePath = join(__dirname, "support", "homebrew-formula.rb")
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
      ["push", "--tags"],
    ]) {
      await execa("git", args, { cwd: brewRepoDir })
    }
  }
})

gulp.task("watch-code", () => {
  const verify = (path) => {
    try {
      _spawn("node_modules/.bin/tsfmt", ["--verify", path], { stdio: "inherit" })
    } catch (_) { }
  }

  return gulp.watch([tsSources, testTsSources], gulp.parallel("generate-docs", "tslint", "tslint-tests"))
    .on("add", verify)
    .on("change", verify)
})

gulp.task("lint", gulp.parallel("check-licenses", "tslint", "tslint-tests", "tsfmt"))
gulp.task("build", gulp.series(
  gulp.parallel("generate-docs", "pegjs", "tsc"),
  "add-version-files",
))
gulp.task("test", gulp.parallel("build", "lint", "mocha"))
gulp.task("watch", gulp.series(
  "build",
  gulp.parallel("pegjs-watch", "tsc-watch", "watch-code"),
))
gulp.task("default", gulp.series("watch"))
