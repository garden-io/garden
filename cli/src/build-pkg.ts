/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { join, relative, resolve } from "path"
import { GARDEN_CLI_ROOT, GARDEN_CORE_ROOT, STATIC_DIR } from "@garden-io/core/build/src/constants.js"
import { readFile, writeFile } from "fs/promises"
import { copy, mkdirp, pathExists, remove } from "fs-extra/esm"
import { exec, getPackageVersion } from "@garden-io/core/build/src/util/util.js"
import { pick } from "lodash-es"
import minimist from "minimist"
import { createHash } from "node:crypto"
import { createReadStream, createWriteStream } from "fs"
import * as url from "node:url"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import type { Entry } from "unzipper"
import unzipper from "unzipper"

// Temporary workaround for NodeJS / DOM type conflict
// See https://github.com/DefinitelyTyped/DefinitelyTyped/issues/60924
import { fetch } from "undici"

import tar from "tar"

const repoRoot = resolve(GARDEN_CLI_ROOT, "..")
const gardenSeaDir = resolve(repoRoot, "garden-sea")
const distTmpDir = resolve(gardenSeaDir, "tmp")
const sourceTmpDir = resolve(distTmpDir, "source")
const rollupTmpDir = resolve(distTmpDir, "rollup")
const tmpStaticDir = resolve(distTmpDir, "static")
const nodeTmpDir = resolve(distTmpDir, "node")
const nativeModuleTmpDir = resolve(distTmpDir, "native")
const distPath = resolve(repoRoot, "dist")

/* eslint-disable no-console */

interface TargetHandlerParams {
  spec: TargetSpec
  targetName: string
  version: string
}

interface TargetSpec {
  node: `${number}.${number}.${number}`
  os: "macos" | "linux" | "alpine" | "win"
  arch: "x64" | "arm64"
  nodeBinaryPlatform: "darwin" | "linux" | "win32"
  url: string
  checksum: string
}

const rustTargetMap: Record<`${TargetSpec["os"]}/${TargetSpec["arch"]}`, string | undefined> = {
  "win/arm64": undefined,
  "win/x64": "x86_64-pc-windows-gnu",
  "alpine/arm64": "aarch64-unknown-linux-musl",
  "alpine/x64": "x86_64-unknown-linux-musl",
  "linux/arm64": "aarch64-unknown-linux-gnu",
  "linux/x64": "x86_64-unknown-linux-gnu",
  "macos/arm64": "aarch64-apple-darwin",
  "macos/x64": "x86_64-apple-darwin",
}

function getRustTarget(spec: TargetSpec): string {
  const targetSpec = `${spec.os}/${spec.arch}`
  const target = rustTargetMap[targetSpec]
  if (!target) {
    throw new Error(`Target ${targetSpec} is unsupported / missing rustTargetMap declaration.`)
  }
  return target
}

export const nodeVersion = "22.17.0"
export const nodeTargets: {
  [name: string]: { spec: TargetSpec; handler: (p: TargetHandlerParams) => Promise<void> }
} = {
  "macos-amd64": {
    spec: {
      os: "macos",
      arch: "x64",
      node: nodeVersion,
      nodeBinaryPlatform: "darwin",
      url: `https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}-darwin-x64.tar.gz`,
      checksum: "c39c8ec3cdadedfcc75de0cb3305df95ae2aecebc5db8d68a9b67bd74616d2ad",
    },
    handler: pkgMacos,
  },
  "macos-arm64": {
    spec: {
      os: "macos",
      arch: "arm64",
      node: nodeVersion,
      nodeBinaryPlatform: "darwin",
      url: `https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}-darwin-arm64.tar.gz`,
      checksum: "615dda58b5fb41fad2be43940b6398ca56554cbe05800953afadc724729cb09e",
    },
    handler: pkgMacos,
  },
  "linux-amd64": {
    spec: {
      os: "linux",
      arch: "x64",
      node: nodeVersion,
      nodeBinaryPlatform: "linux",
      url: `https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}-linux-x64.tar.gz`,
      checksum: "0fa01328a0f3d10800623f7107fbcd654a60ec178fab1ef5b9779e94e0419e1a",
    },
    handler: pkgLinux,
  },
  "linux-arm64": {
    spec: {
      os: "linux",
      arch: "arm64",
      node: nodeVersion,
      nodeBinaryPlatform: "linux",
      url: `https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}-linux-arm64.tar.gz`,
      checksum: "3e99df8b01b27dc8b334a2a30d1cd500442b3b0877d217b308fd61a9ccfc33d4",
    },
    handler: pkgLinux,
  },
  "alpine-amd64": {
    spec: {
      os: "alpine",
      arch: "x64",
      node: nodeVersion,
      nodeBinaryPlatform: "linux",
      // Alpine builds live in https://unofficial-builds.nodejs.org/download/release/
      url: `https://unofficial-builds.nodejs.org/download/release/v${nodeVersion}/node-v${nodeVersion}-linux-x64-musl.tar.gz`,
      checksum: "b7e6d8279f654e741f9cd9f199d5091d74492df0bd2f2e70f6bc0cb6e3369e7f",
    },
    handler: pkgAlpine,
  },
  "windows-amd64": {
    spec: {
      os: "win",
      arch: "x64",
      node: nodeVersion,
      nodeBinaryPlatform: "win32",
      url: `https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}-win-x64.zip`,
      checksum: "721ab118a3aac8584348b132767eadf51379e0616f0db802cc1e66d7f0d98f85",
    },
    handler: pkgWindows,
  },
}

/**
 * This function defines the filename format for release packages.
 *
 * The format SHOULD NOT be changed since other tools we use depend on it, unless you absolutely know what you're doing.
 */
function composePackageFilename(version: string, targetName: string, extension: string): string {
  return `garden-${version}-${targetName}.${extension}`
}

export function getZipFilename(version: string, targetName: string): string {
  return composePackageFilename(version, targetName, "zip")
}

export function getTarballFilename(version: string, targetName: string): string {
  return composePackageFilename(version, targetName, "tar.gz")
}

export type NPMWorkspaceQueryResult = {
  name: string
  location: string
  dependencies: Record<string, string>
}

type ZipAndHashOptions = {
  targetDir: string
  archiveName: string
  cwd: string
  fileNames: string[]
  prefix?: string
}

async function zipAndHash({ targetDir, archiveName, cwd, prefix, fileNames }: ZipAndHashOptions) {
  const targetArchive = resolve(targetDir, `${archiveName}.tar.gz`)
  const archiveStream = tar.c(
    {
      gzip: true,
      prefix,
      C: cwd,
      strict: true,
      portable: true,
    },
    fileNames
  )

  const sha256 = archiveStream.pipe(createHash("sha256"))

  await pipeline(archiveStream, createWriteStream(targetArchive))

  // NOTE(steffen): I expected `await finished(sha256)` to do the job, but calling that crashed node without an error message for some reason.
  await new Promise((r) => sha256.once("readable", r))

  await writeFile(resolve(targetDir, `${archiveName}.sha256`), sha256.digest("hex") + "\n")
}

async function buildBinaries(args: string[]) {
  const argv = minimist(args)

  // The string that the `garden version` command outputs
  let versionInBinary: string

  // The string in our release tarball/zip filenames
  let versionInFilename: string

  if (argv.version && (argv.version === "edge" || argv.version.startsWith("edge-"))) {
    const gitHash = await exec("git", ["rev-parse", "--short", "HEAD"])
    versionInBinary = `${getPackageVersion()}-${argv.version}-${gitHash.stdout}`
    versionInFilename = argv.version
  } else if (argv.version) {
    console.log(`Cannot set Garden to version ${argv.version}. Please update the package.json files instead.`)
    process.exit(1)
  } else {
    versionInBinary = getPackageVersion()
    versionInFilename = versionInBinary
  }

  let cargoCommand = "cargo"

  if (argv.cargocommand) {
    cargoCommand = argv.cargocommand
  }

  const selected = argv._.length > 0 ? pick(nodeTargets, argv._) : nodeTargets

  if (Object.keys(selected).length === 0) {
    console.log(chalk.red("No matching targets."))
    console.log(`Available targets: ${Object.keys(nodeTargets).join(", ")}}`)
    process.exit(1)
  }

  console.log(chalk.cyan("Building targets: ") + Object.keys(selected).join(", "))

  console.log(chalk.cyan("Creating temp source directory at " + sourceTmpDir))
  await remove(sourceTmpDir)
  await mkdirp(sourceTmpDir)

  console.log(chalk.cyan("Creating temp node binary directory at " + nodeTmpDir))
  await mkdirp(nodeTmpDir)

  console.log(chalk.cyan("Creating static directory at " + tmpStaticDir))
  await remove(tmpStaticDir)

  // Copy static dir, stripping out undesired files for the dist build
  console.log(chalk.cyan("Copying static directory"))
  await exec("rsync", ["-r", "-L", "--exclude=.garden", "--exclude=.git", STATIC_DIR, distTmpDir])

  // Copy each package to the temp dir
  console.log(chalk.cyan("Getting package info"))
  const res = (await exec("npm", ["query", ".workspace"])).stdout
  const workspaces: NPMWorkspaceQueryResult[] = JSON.parse(res)

  console.log(chalk.cyan("Copying packages"))
  await Promise.all(
    workspaces.map(async ({ name, location }: { name: string; location: string }) => {
      const sourcePath = resolve(repoRoot, location)
      const targetPath = resolve(sourceTmpDir, location)
      await remove(targetPath)
      await mkdirp(targetPath)
      await exec("rsync", [
        "-r",
        "-L",
        "--exclude=node_modules",
        "--exclude=tmp",
        "--exclude=test",
        sourcePath,
        resolve(targetPath, ".."),
      ])

      console.log(chalk.green(" ✓ " + name))
    })
  )

  // Edit all the packages to have them directly link any internal dependencies
  console.log(chalk.cyan("Modifying package.json files for direct installation"))
  await Promise.all(
    workspaces.map(async ({ name, location, dependencies }) => {
      const packageRoot = resolve(sourceTmpDir, location)
      const packageJsonPath = resolve(packageRoot, "package.json")
      const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8"))

      const workspaceDependencies = Object.keys(dependencies).filter((dependencyName) => {
        return workspaces.some((p) => p.name === dependencyName)
      })
      for (const depName of workspaceDependencies) {
        const depInfo = workspaces.find((p) => p.name === depName)
        if (!depInfo) {
          throw new Error("Could not find workspace info for " + depName)
        }
        const targetRoot = resolve(sourceTmpDir, depInfo.location)
        const relPath = relative(packageRoot, targetRoot)
        packageJson.dependencies[depName] = "file:" + relPath
      }

      packageJson.version = versionInBinary
      console.log(`Updated version to ${packageJson.version} in ${packageJsonPath}`)

      await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2))

      console.log(chalk.green(" ✓ " + name))
    })
  )

  // Run npm install in the cli package
  await copy(resolve(repoRoot, "package.json"), resolve(sourceTmpDir, "package.json"))
  await copy(resolve(repoRoot, "package-lock.json"), resolve(sourceTmpDir, "package-lock.json"))
  // The `.npmrc` config ensures that we're not hoisting any dependencies
  await copy(resolve(repoRoot, ".npmrc"), resolve(sourceTmpDir, ".npmrc"))

  console.log("Installing all packages in workspaces")
  await exec("npm", ["install", "--omit=dev"], { cwd: sourceTmpDir, stdio: "inherit" })

  // This is not being installed on non mac systems
  // We need it to always be present though, and it should just not load if on another platform
  await copy(resolve(GARDEN_CORE_ROOT, "lib", "fsevents"), resolve(sourceTmpDir, "core", "node_modules", "fsevents"))

  console.log(chalk.cyan("Bundling source code"))

  await remove(rollupTmpDir)
  await exec("npm", ["run", "rollup"], {
    cwd: repoRoot,
    stdio: "inherit",
    // We have to pass the garden version explicitly to rollup due to an issue with the json() plugin loading the wrong package.json files
    environment: { GARDEN_CORE_VERSION: versionInBinary },
  })

  await zipAndHash({
    archiveName: "source",
    cwd: distTmpDir,
    targetDir: distTmpDir,
    fileNames: ["rollup"],
  })

  console.log(chalk.green(" ✓ Bundled source code"))

  // Dowload selected node binaries
  await Promise.all(
    Object.entries(selected).map(async ([targetName, { spec }]) => {
      const extractionDir = resolve(nodeTmpDir, targetName)

      // We know it's just those two file types, so we can hardcode this
      // If we switch to other types, this needs adapting.
      // Why aren't we just using `path.extname`?
      // Because it doesn't do double endings like `.tar.gz`.
      // Having generic code for that is still more than twice as much as this comment block and the ternary below.
      const fileEnding = spec.url.endsWith("tar.gz") ? ".tar.gz" : ".zip"

      const nodeArchiveFilename = resolve(nodeTmpDir, `${targetName}${fileEnding}`)

      let nodeArchiveChecksum: string | undefined
      if (await pathExists(nodeArchiveFilename)) {
        const readStream = createReadStream(nodeArchiveFilename)
        const hash = createHash("sha256")
        await pipeline(readStream, hash)
        nodeArchiveChecksum = hash.digest("hex")
      }

      if (nodeArchiveChecksum === spec.checksum) {
        console.log(chalk.green(` ✓ Using cached node ${spec.node} for ${targetName} at ${nodeArchiveFilename}`))
      } else {
        console.log(chalk.cyan(`Downloading node ${spec.node} for ${targetName} from ${spec.url}`))
        await downloadFromWeb({ url: spec.url, checksum: spec.checksum, targetPath: nodeArchiveFilename })
        console.log(chalk.green(` ✓ Downloaded node ${spec.node} and verified checksum for ${targetName}`))
      }

      console.log(chalk.cyan(`Extracting node ${spec.node} for ${targetName}`))
      await mkdirp(extractionDir)
      const nodeFileName = spec.os === "win" ? "node.exe" : "node"
      if (fileEnding === ".tar.gz") {
        const extractStream = tar.x({
          C: extractionDir,
          // The tarball has first a toplevel directory,
          // then a /bin subdirectory, then the actual files.
          // We only want the flat `node` binary within the directory.
          // The stripping happens after the filter so it works fine
          strip: 2,
          filter: (path) => {
            return path.endsWith(`/bin/${nodeFileName}`)
          },
        })
        await pipeline(createReadStream(nodeArchiveFilename), extractStream)
      } else {
        const zip = createReadStream(nodeArchiveFilename).pipe(unzipper.Parse({ forceStream: true }))
        for await (const i of zip) {
          const entry = i as Entry
          const fileName = entry.path
          if (fileName.endsWith(`/${nodeFileName}`)) {
            await pipeline(entry, createWriteStream(resolve(extractionDir, nodeFileName)))
          } else {
            entry.autodrain()
          }
        }
      }

      console.log(chalk.green(` ✓ Extracted node ${spec.node} for ${targetName}`))

      console.log(chalk.cyan(`Bundling node ${spec.node} for ${targetName}`))

      await zipAndHash({
        targetDir: extractionDir,
        archiveName: "node",
        cwd: extractionDir,
        fileNames: [nodeFileName],
        prefix: "bin",
      })

      console.log(chalk.green(` ✓ Bundled node ${spec.node} for ${targetName}`))
    })
  )

  console.log(chalk.cyan("Packaging garden binaries"))

  await Promise.all(
    Object.entries(selected).map(async ([targetName, target]) => {
      await pkgCommon({
        targetName,
        spec: target.spec,
      })
    })
  )

  // cross does not support running all compilations in parallel.
  for (const [targetName, target] of Object.entries(selected)) {
    const distTargetDir = resolve(distPath, targetName)

    console.log(chalk.cyan("Cleaning " + distTargetDir))
    await remove(distTargetDir)

    console.log(chalk.cyan("Compiling garden binary for " + targetName))
    const rustTarget = getRustTarget(target.spec)

    // Run Garden SEA smoke tests, except when on Windows.
    //
    // The Windows binary is still built and tested on actual Windows in the test-windows CircleCI job.
    //
    // I tried to get the Wine-based dist tests for the Windows build to work, but ended up giving up (faced lots of
    // errors to due with 32 vs 64 bit binary formats, missing DLLs etc. which I spent too much time chasing down).
    // The brittleness and baroque nature of that Wine-based flow also made me want to eliminate it from our pipeline
    // (since I could see it causing further instabilities down the road even if we fixed things as they are now).
    // - THS
    const skipTests = cargoCommand === "cross" && target.spec.os === "win"
    if (!skipTests) {
      await exec(cargoCommand, ["test", "--target", rustTarget], { cwd: gardenSeaDir, stdio: "inherit" })
    } else {
      console.log(
        chalk.yellow(
          "Skipping dist tests for Windows (the Wine-based runtime test environment for Windows was causing us trouble)"
        )
      )
      console.log(
        chalk.yellow(
          "In CI, the Windows executable will be tested on an actual Windows runner in the test-windows job."
        )
      )
    }

    // Build the release binary
    await exec(cargoCommand, ["build", "--target", rustTarget, "--release"], { cwd: gardenSeaDir, stdio: "inherit" })

    const executableFilename = target.spec.os === "win" ? "garden.exe" : "garden"
    const executablePath = resolve(distTargetDir, executableFilename)
    await copy(resolve(gardenSeaDir, "target", rustTarget, "release", executableFilename), executablePath)
    console.log(chalk.green(` ✓ Compiled garden binary for ${targetName}`))

    await target.handler({ targetName, spec: target.spec, version: versionInFilename })
    console.log(chalk.green(" ✓ " + targetName))
  }

  console.log(chalk.green.bold("Done!"))
}

async function pkgMacos({ targetName, version }: TargetHandlerParams) {
  const executablePath = resolve(distPath, targetName, "garden")
  try {
    await exec("codesign", ["-f", "--sign", "-", executablePath])
  } catch {
    await exec("ldid", ["-Cadhoc", "-S", executablePath])
  }

  await tarball(targetName, version)
}

async function pkgLinux({ targetName, version }: TargetHandlerParams) {
  await tarball(targetName, version)
}

async function pkgWindows({ targetName, version }: TargetHandlerParams) {
  console.log(` - ${targetName} -> zip`)
  const filename = getZipFilename(version, targetName)
  await exec("zip", ["-q", "-r", filename, targetName], { cwd: distPath })
}

async function pkgAlpine({ targetName, version }: TargetHandlerParams) {
  await tarball(targetName, version)
}

async function pkgCommon({ targetName, spec }: { targetName: string; spec: TargetSpec }) {
  const targetPath = resolve(nativeModuleTmpDir, targetName)
  await remove(targetPath)
  await mkdirp(targetPath)

  if (spec.os === "macos") {
    await copy(resolve(GARDEN_CORE_ROOT, "lib", "fsevents", "fsevents.node"), resolve(targetPath, "fsevents.node"))
  }

  await zipAndHash({
    targetDir: distTmpDir,
    archiveName: `${targetName}-native`,
    cwd: targetPath,
    fileNames: ["."],
    prefix: "native",
  })

  await zipAndHash({
    targetDir: distTmpDir,
    archiveName: "static",
    cwd: distTmpDir,
    fileNames: ["static"],
  })
}

async function tarball(targetName: string, version: string): Promise<void> {
  const filename = getTarballFilename(version, targetName)
  console.log(` - ${targetName} -> tar (${filename})`)

  await exec("tar", ["-czf", filename, targetName], { cwd: distPath })

  const hashFilename = filename + ".sha256"
  const archivePath = join(distPath, filename)
  const hashPath = join(distPath, hashFilename)

  // compute the sha256 checksum
  console.log(` - ${targetName} -> sha256 (${hashFilename})`)

  const readStream = createReadStream(archivePath)
  const hash = createHash("sha256")
  hash.setEncoding("hex")

  await pipeline(readStream, hash)

  const sha256 = hash.read()
  await writeFile(hashPath, sha256 + "\n")
}

const modulePath = url.fileURLToPath(import.meta.url)
if (process.argv[1] === modulePath) {
  buildBinaries(process.argv.slice(2)).catch((err) => {
    console.error(chalk.red(err.message))
    process.exit(1)
  })
}

async function downloadFromWeb({
  url: downloadUrl,
  targetPath,
  checksum,
}: {
  url: string
  targetPath: string
  checksum: string
}) {
  const response = await fetch(downloadUrl)

  if (!response.body) {
    throw new Error(`No response body for ${downloadUrl}`)
  }

  const body = Readable.fromWeb(response.body)

  const sha256 = body.pipe(createHash("sha256"))

  const writeStream = createWriteStream(targetPath)
  await pipeline(body, writeStream)

  // NOTE(steffen): I expected `await finished(sha256)` to do the job, but calling that crashed node without an error message for some reason.
  await new Promise((r) => sha256.once("readable", r))

  const digest = sha256.digest("hex")

  if (digest !== checksum) {
    throw new Error(`Checksum mismatch for ${downloadUrl}! Expected ${checksum} but got ${digest}`)
  }
}
