/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { getAbi } from "node-abi"
import { resolve, relative, join } from "path"
import { STATIC_DIR, GARDEN_CLI_ROOT, GARDEN_CORE_ROOT } from "@garden-io/core/build/src/constants.js"
import { readFile, writeFile } from "fs/promises"
import { remove, mkdirp, copy, pathExists } from "fs-extra/esm"
import { exec, getPackageVersion } from "@garden-io/core/build/src/util/util.js"
import { dedent } from "@garden-io/core/build/src/util/string.js"
import { pick } from "lodash-es"
import minimist from "minimist"
import { createHash } from "node:crypto"
import { createReadStream, createWriteStream } from "fs"
import { makeTempDir } from "@garden-io/core/build/test/helpers.js"
import * as url from "node:url"
import { Readable } from "node:stream"
import { finished } from "node:stream/promises"
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

const rustArchMap: Record<TargetSpec["arch"], string> = {
  x64: "x86_64",
  arm64: "aarch64",
}

const rustOsMap: Record<TargetSpec["os"], string> = {
  win: "pc-windows-gnu",
  alpine: "unknown-linux-musl",
  linux: "unknown-linux-gnu",
  macos: "apple-darwin",
}

function getRustTarget(spec: TargetSpec): string {
  return `${rustArchMap[spec.arch]}-${rustOsMap[spec.os]}`
}

const targets: { [name: string]: { spec: TargetSpec; handler: (p: TargetHandlerParams) => Promise<void> } } = {
  "macos-amd64": {
    spec: {
      os: "macos",
      arch: "x64",
      node: "21.1.0",
      nodeBinaryPlatform: "darwin",
      url: "https://nodejs.org/dist/v21.1.0/node-v21.1.0-darwin-x64.tar.gz",
      checksum: "6b526c08320fcf41ced0ceee7588828ea2cb07ba826af4ff82b0ec53958fd8a4",
    },
    handler: pkgMacos,
  },
  "macos-arm64": {
    spec: {
      os: "macos",
      arch: "arm64",
      node: "21.1.0",
      nodeBinaryPlatform: "darwin",
      url: "https://nodejs.org/dist/v21.1.0/node-v21.1.0-darwin-arm64.tar.gz",
      checksum: "4872463830381785b91d13a7fbb9b6f4a9c7658e10d964f6c421951cec8833ad",
    },
    handler: pkgMacos,
  },
  "linux-amd64": {
    spec: {
      os: "linux",
      arch: "x64",
      node: "21.1.0",
      nodeBinaryPlatform: "linux",
      url: "https://nodejs.org/dist/v21.1.0/node-v21.1.0-linux-x64.tar.gz",
      checksum: "b919cad4e8a5abbd7e6a4433c4f8a7cdc1a78c1e526c6c1aa4a5fcf74011ad2b",
    },
    handler: pkgLinux,
  },
  "linux-arm64": {
    spec: {
      os: "linux",
      arch: "arm64",
      node: "21.1.0",
      nodeBinaryPlatform: "linux",
      url: "https://nodejs.org/dist/v21.1.0/node-v21.1.0-linux-arm64.tar.gz",
      checksum: "5480f438703049f55f19fc3247f6aa1e8059b2f47cf08e9adfdcb7ce7aedff70",
    },
    handler: pkgLinux,
  },
  "alpine-amd64": {
    spec: {
      os: "alpine",
      arch: "x64",
      node: "21.1.0",
      nodeBinaryPlatform: "linux",
      // Alpine builds live in https://unofficial-builds.nodejs.org/download/release/
      url: "https://unofficial-builds.nodejs.org/download/release/v21.1.0/node-v21.1.0-linux-x64-musl.tar.gz",
      checksum: "e71212feaa3a54c1736e173f3aa17ba777f1f189659437c589af54742d95a1d0",
    },
    handler: pkgAlpine,
  },
  "windows-amd64": {
    spec: {
      os: "win",
      arch: "x64",
      node: "21.1.0",
      nodeBinaryPlatform: "win32",
      url: "https://nodejs.org/dist/v21.1.0/node-v21.1.0-win-x64.zip",
      checksum: "a3c838b0d00e7c2a218ceef39b4bf2c6dd6a433eb5970012fe36038904c8feef",
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

  const archiveHash = archiveStream.pipe(createHash("sha256"))

  await finished(archiveStream.pipe(createWriteStream(targetArchive)))

  await writeFile(resolve(targetDir, `${archiveName}.sha256`), archiveHash.digest("hex") + "\n")
}

async function buildBinaries(args: string[]) {
  const argv = minimist(args)
  const version = argv.version || getPackageVersion()
  const selected = argv._.length > 0 ? pick(targets, argv._) : targets

  if (Object.keys(selected).length === 0) {
    console.log(chalk.red("No matching targets."))
    console.log(`Available targets: ${Object.keys(targets).join(", ")}}`)
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
  await exec("git", ["init"], { cwd: tmpStaticDir })

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

      if (version === "edge" || version.startsWith("edge-")) {
        const gitHash = await exec("git", ["rev-parse", "--short", "HEAD"])
        packageJson.version = `${packageJson.version}-${version}-${gitHash.stdout}`
        console.log("Set package version to " + packageJson.version)
      }

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
  await exec("npm", ["run", "rollup"], { cwd: repoRoot, stdio: "inherit" })

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
        const hash = readStream.pipe(createHash("sha256"))
        await finished(readStream)
        nodeArchiveChecksum = hash.digest("hex")
      }

      if (nodeArchiveChecksum === spec.checksum) {
        console.log(chalk.green(` ✓ Using cached node ${spec.node} for ${targetName} at ${nodeArchiveFilename}`))
      } else {
        console.log(chalk.cyan(`Downloading node ${spec.node} for ${targetName} from ${spec.url}`))
        const response = await fetch(spec.url)

        if (!response.body) {
          throw new Error(`No response body for ${spec.url}`)
        }

        const body = Readable.fromWeb(response.body)

        const hash = body.pipe(createHash("sha256"))

        const writeStream = createWriteStream(nodeArchiveFilename)
        await finished(body.pipe(writeStream))

        console.log(chalk.green(` ✓ Downloaded node ${spec.node} for ${targetName}`))

        const sha256 = hash.digest("hex")

        if (sha256 !== spec.checksum) {
          throw new Error(`Checksum mismatch for ${spec.url}! Expected ${spec.checksum} but got ${sha256}`)
        }
        console.log(chalk.green(` ✓ Verified checksum for ${targetName}`))
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
        await finished(createReadStream(nodeArchiveFilename).pipe(extractStream))
      } else {
        const zip = createReadStream(nodeArchiveFilename).pipe(unzipper.Parse({ forceStream: true }))
        for await (const i of zip) {
          const entry = i as Entry
          const fileName = entry.path
          if (fileName.endsWith(`/${nodeFileName}`)) {
            await finished(entry.pipe(createWriteStream(resolve(extractionDir, nodeFileName))))
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

    // Run Garden SEA smoke tests. Windows tests run in a wine environment.
    await exec("cross", ["test", "--target", rustTarget], { cwd: gardenSeaDir, stdio: "inherit" })

    // Build the release binary
    await exec("cross", ["build", "--target", rustTarget, "--release"], { cwd: gardenSeaDir, stdio: "inherit" })

    const executableFilename = target.spec.os === "win" ? "garden.exe" : "garden"
    const executablePath = resolve(distTargetDir, executableFilename)
    await copy(resolve(gardenSeaDir, "target", rustTarget, "release", executableFilename), executablePath)
    console.log(chalk.green(` ✓ Compiled garden binary for ${targetName}`))

    await target.handler({ targetName, spec: target.spec, version })
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

  console.log(` - ${targetName} -> node-pty`)
  const abi = getAbi(process.version, "node")

  if (spec.nodeBinaryPlatform === "win32") {
    const tmpDir = await makeTempDir()
    // Seriously, this is so much easier than anything more native...
    await exec(
      "sh",
      [
        "-c",
        dedent`
          set -e
          curl -s -L https://github.com/oznu/node-pty-prebuilt-multiarch/releases/download/v0.10.1-pre.5/node-pty-prebuilt-multiarch-v0.10.1-pre.5-node-v108-win32-x64.tar.gz | tar -xzv -C .
          cp build/Release/* '${targetPath}'
        `,
      ],
      { cwd: tmpDir.path }
    )

    await tmpDir.cleanup()
  } else {
    const filename = spec.os === "alpine" ? `node.abi${abi}.musl.node` : `node.abi${abi}.node`
    const abiPath = resolve(
      GARDEN_CORE_ROOT,
      "node_modules",
      "node-pty-prebuilt-multiarch",
      "prebuilds",
      `${spec.nodeBinaryPlatform}-${spec.arch}`,
      filename
    )
    await copy(abiPath, resolve(targetPath, "pty.node"))
  }

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

  return new Promise((_resolve, reject) => {
    const hashFilename = filename + ".sha256"
    const archivePath = join(distPath, filename)
    const hashPath = join(distPath, hashFilename)

    // compute the sha256 checksum
    console.log(` - ${targetName} -> sha256 (${hashFilename})`)

    const response = createReadStream(archivePath)
    response.on("error", reject)

    const hash = createHash("sha256")
    hash.setEncoding("hex")

    response.on("end", () => {
      hash.end()
      const sha256 = hash.read()

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      writeFile(hashPath, sha256 + "\n")
        .catch(reject)
        .then(_resolve)
    })

    response.pipe(hash)
  })
}

const modulePath = url.fileURLToPath(import.meta.url)
if (process.argv[1] === modulePath) {
  buildBinaries(process.argv.slice(2)).catch((err) => {
    console.error(chalk.red(err.message))
    process.exit(1)
  })
}
