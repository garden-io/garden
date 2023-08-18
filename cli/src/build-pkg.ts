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
import { STATIC_DIR, GARDEN_CLI_ROOT, GARDEN_CORE_ROOT } from "@garden-io/core/build/src/constants"
import { remove, mkdirp, copy, writeFile } from "fs-extra"
import { exec, getPackageVersion, sleep } from "@garden-io/core/build/src/util/util"
import { dedent, randomString } from "@garden-io/core/build/src/util/string"
import { pick } from "lodash"
import minimist from "minimist"
import { createHash } from "crypto"
import { createReadStream } from "fs"
import { makeTempDir } from "@garden-io/core/build/test/helpers"

require("source-map-support").install()

const repoRoot = resolve(GARDEN_CLI_ROOT, "..")
const tmpDirPath = resolve(repoRoot, "tmp", "pkg")
const tmpStaticDir = resolve(tmpDirPath, "static")
const pkgPath = resolve(repoRoot, "cli", "node_modules", ".bin", "pkg")
const distPath = resolve(repoRoot, "dist")

// Allow larger heap size than default
const nodeOptions = ["max-old-space-size=4096", "max-semi-space-size=64"]

/* eslint-disable no-console */

interface TargetHandlerParams {
  targetName: string
  sourcePath: string
  pkgType: string
  version: string
}

interface TargetSpec {
  pkgType: string
  nodeBinaryPlatform: string
  handler: (params: TargetHandlerParams) => Promise<void>
}

const targets: { [name: string]: TargetSpec } = {
  "macos-amd64": { pkgType: "node18-macos-x64", handler: pkgMacos, nodeBinaryPlatform: "darwin" },
  "macos-arm64": { pkgType: "node18-macos-arm64", handler: pkgMacos, nodeBinaryPlatform: "darwin" },
  "linux-amd64": { pkgType: "node18-linux-x64", handler: pkgLinux, nodeBinaryPlatform: "linux" },
  "linux-arm64": { pkgType: "node18-linux-arm64", handler: pkgLinux, nodeBinaryPlatform: "linux" },
  "windows-amd64": { pkgType: "node18-win-x64", handler: pkgWindows, nodeBinaryPlatform: "win32" },
  "alpine-amd64": { pkgType: "node18-alpine-x64", handler: pkgAlpine, nodeBinaryPlatform: "linuxmusl" },
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

async function buildBinaries(args: string[]) {
  const argv = minimist(args)
  const version = argv.version || getPackageVersion()
  const selected = argv._.length > 0 ? pick(targets, argv._) : targets

  console.log(chalk.cyan("Building targets: ") + Object.keys(selected).join(", "))

  // (re)-create temp dir
  console.log(chalk.cyan("Creating temp directory at " + tmpDirPath))
  await remove(tmpDirPath)
  await mkdirp(tmpDirPath)

  // Copy static dir, stripping out undesired files for the dist build
  console.log(chalk.cyan("Copying static directory"))
  await exec("rsync", ["-r", "-L", "--exclude=.garden", "--exclude=.git", STATIC_DIR, tmpDirPath])
  await exec("git", ["init"], { cwd: tmpStaticDir })

  // Copy each package to the temp dir
  console.log(chalk.cyan("Getting package info"))
  const res = (await exec("yarn", ["--json", "workspaces", "info"])).stdout
  const workspaces = JSON.parse(JSON.parse(res).data)

  console.log(chalk.cyan("Copying packages"))
  await Promise.all(
    Object.entries(workspaces).map(async ([name, info]: [string, any]) => {
      const sourcePath = resolve(repoRoot, info.location)
      const targetPath = resolve(tmpDirPath, info.location)
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
    Object.entries(workspaces).map(async ([name, info]: [string, any]) => {
      const packageRoot = resolve(tmpDirPath, info.location)
      const packageJsonPath = resolve(packageRoot, "package.json")
      const packageJson = require(packageJsonPath)

      for (const depName of info.workspaceDependencies) {
        const depInfo = workspaces[depName]
        const targetRoot = resolve(tmpDirPath, depInfo.location)
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

  // Run yarn install in the cli package
  console.log(chalk.cyan("Installing packages in @garden-io/cli package"))
  const cliPath = resolve(tmpDirPath, workspaces["@garden-io/cli"].location)
  await exec("yarn", ["--production"], { cwd: cliPath })

  // Run pkg and pack up each platform binary
  console.log(chalk.cyan("Packaging garden binaries"))

  await Promise.all(
    Object.entries(selected).map(async ([targetName, spec]) => {
      await spec.handler({ targetName, sourcePath: cliPath, pkgType: spec.pkgType, version })
      await sleep(5000) // Work around concurrency bug in pkg...
      console.log(chalk.green(" ✓ " + targetName))
    })
  )

  console.log(chalk.green.bold("Done!"))
}

let fsEventsCopied: Promise<void> | undefined = undefined
async function pkgMacos({ targetName, sourcePath, pkgType, version }: TargetHandlerParams) {
  console.log(` - ${targetName} -> fsevents`)
  // Copy fsevents from lib to node_modules
  // This might happen concurrently for multiple targets
  // so we only do it once and then wait for that process to complete
  if (!fsEventsCopied) {
    fsEventsCopied = copy(
      resolve(GARDEN_CORE_ROOT, "lib", "fsevents"),
      resolve(tmpDirPath, "cli", "node_modules", "fsevents")
    )
  }
  await fsEventsCopied

  await pkgCommon({
    sourcePath,
    targetName,
    pkgType,
    binFilename: "garden",
  })

  console.log(` - ${targetName} -> fsevents.node`)
  await copy(
    resolve(GARDEN_CORE_ROOT, "lib", "fsevents", "fsevents.node"),
    resolve(distPath, targetName, "fsevents.node")
  )

  await tarball(targetName, version)
}

async function pkgLinux({ targetName, sourcePath, pkgType, version }: TargetHandlerParams) {
  await pkgCommon({
    sourcePath,
    targetName,
    pkgType,
    binFilename: "garden",
  })
  await tarball(targetName, version)
}

async function pkgWindows({ targetName, sourcePath, pkgType, version }: TargetHandlerParams) {
  await pkgCommon({
    sourcePath,
    targetName,
    pkgType,
    binFilename: "garden.exe",
  })

  console.log(` - ${targetName} -> zip`)
  const filename = getZipFilename(version, targetName)
  await exec("zip", ["-q", "-r", filename, targetName], { cwd: distPath })
}

async function pkgAlpine({ targetName, version }: TargetHandlerParams) {
  const targetPath = resolve(distPath, targetName)
  await remove(targetPath)
  await mkdirp(targetPath)

  console.log(` - ${targetName} -> docker build`)
  const imageName = "garden-alpine-builder"
  const containerName = "alpine-builder-" + randomString(8)
  const supportDir = resolve(repoRoot, "support")

  await copy(resolve(supportDir, ".dockerignore"), resolve(tmpDirPath, ".dockerignore"))

  await exec("docker", [
    "build",
    "--platform",
    "linux/amd64",
    "-t",
    imageName,
    "-f",
    resolve(repoRoot, "support", "alpine-builder.Dockerfile"),
    tmpDirPath,
  ])

  try {
    console.log(` - ${targetName} -> docker create`)
    await exec("docker", ["create", "-it", "--name", containerName, imageName, "sh"])

    console.log(` - ${targetName} -> docker copy`)
    await exec("docker", ["cp", `${containerName}:/garden/.`, targetPath])
  } finally {
    await exec("docker", ["rm", "-f", containerName])
  }

  await tarball(targetName, version)
}

async function pkgCommon({
  sourcePath,
  targetName,
  pkgType,
  binFilename,
}: {
  sourcePath: string
  targetName: string
  pkgType: string
  binFilename: string
}) {
  const targetPath = resolve(distPath, targetName)
  await remove(targetPath)
  await mkdirp(targetPath)

  const pkgFetchTmpDir = resolve(repoRoot, "tmp", "pkg-fetch", targetName)
  await mkdirp(pkgFetchTmpDir)

  console.log(` - ${targetName} -> node-pty`)
  const abi = getAbi(process.version, "node")
  // TODO: make arch configurable
  const { nodeBinaryPlatform } = targets[targetName]

  if (nodeBinaryPlatform === "win32") {
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
    const filename = nodeBinaryPlatform === "linuxmusl" ? `node.abi${abi}.musl.node` : `node.abi${abi}.node`
    const abiPath = resolve(
      repoRoot,
      "node_modules",
      "node-pty-prebuilt-multiarch",
      "prebuilds",
      `${nodeBinaryPlatform}-x64`,
      filename
    )
    await copy(abiPath, resolve(targetPath, "pty.node"))
  }

  console.log(` - ${targetName} -> pkg`)
  await exec(
    pkgPath,
    [
      "--target",
      pkgType,
      sourcePath,
      "--compress",
      "Brotli",
      // We do not need to compile to bytecode and obfuscate the source
      "--public",
      "--public-packages",
      "*",
      // We include all native binaries required manually
      "--no-native-build",
      "--options",
      nodeOptions.join(","),
      "--output",
      resolve(targetPath, binFilename),
    ],
    { env: { PKG_CACHE_PATH: pkgFetchTmpDir } }
  )

  console.log(` - ${targetName} -> static`)
  await copyStatic(targetName)
}

async function copyStatic(targetName: string) {
  const targetPath = resolve(distPath, targetName)
  console.log(` - ${targetName} -> static dir`)
  await copy(tmpStaticDir, resolve(targetPath, "static"))
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

if (require.main === module) {
  buildBinaries(process.argv.slice(2)).catch((err) => {
    console.error(chalk.red(err.message))
    process.exit(1)
  })
}
