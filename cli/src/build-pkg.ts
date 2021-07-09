/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import chalk from "chalk"
import { resolve, relative, join } from "path"
import Bluebird from "bluebird"
import { STATIC_DIR, GARDEN_CLI_ROOT, GARDEN_CORE_ROOT } from "@garden-io/core/build/src/constants"
import { remove, mkdirp, copy, writeFile } from "fs-extra"
import { exec, getPackageVersion } from "@garden-io/core/build/src/util/util"
import { randomString } from "@garden-io/core/build/src/util/string"
import { pick } from "lodash"
import minimist from "minimist"
import { createHash } from "crypto"
import { createReadStream } from "fs"

require("source-map-support").install()

const repoRoot = resolve(GARDEN_CLI_ROOT, "..")
const tmpDir = resolve(repoRoot, "tmp", "pkg")
const tmpStaticDir = resolve(tmpDir, "static")
const pkgPath = resolve(repoRoot, "cli", "node_modules", ".bin", "pkg")
const pkgFetchPath = resolve(repoRoot, "node_modules", ".bin", "pkg-fetch")
const distPath = resolve(repoRoot, "dist")
const sqliteBinFilename = "better_sqlite3.node"

// tslint:disable: no-console

interface TargetHandlerParams {
  targetName: string
  sourcePath: string
  pkgType: string
  version: string
}

interface TargetSpec {
  pkgType: string
  handler: (params: TargetHandlerParams) => Promise<void>
}

const targets: { [name: string]: TargetSpec } = {
  "macos-amd64": { pkgType: "node12-macos-x64", handler: pkgMacos },
  "linux-amd64": { pkgType: "node12-linux-x64", handler: pkgLinux },
  "windows-amd64": { pkgType: "node12-win-x64", handler: pkgWindows },
  "alpine-amd64": { pkgType: "node12-alpine-x64", handler: pkgAlpine },
}

async function buildBinaries(args: string[]) {
  const argv = minimist(args)
  const version = argv.version || getPackageVersion()
  const selected = argv._.length > 0 ? pick(targets, argv._) : targets

  console.log(chalk.cyan("Building targets: ") + Object.keys(selected).join(", "))

  // (re)-create temp dir
  console.log(chalk.cyan("Creating temp directory at " + tmpDir))
  await remove(tmpDir)
  await mkdirp(tmpDir)

  // Copy static dir, stripping out undesired files for the dist build
  console.log(chalk.cyan("Copying static directory"))
  await exec("rsync", ["-r", "-L", "--exclude=.garden", "--exclude=.git", STATIC_DIR, tmpDir])
  await exec("git", ["init"], { cwd: tmpStaticDir })

  // Copy each package to the temp dir
  console.log(chalk.cyan("Getting package info"))
  const res = (await exec("yarn", ["--json", "workspaces", "info"])).stdout
  const workspaces = JSON.parse(JSON.parse(res).data)

  console.log(chalk.cyan("Copying packages"))
  await Bluebird.map(Object.entries(workspaces), async ([name, info]: [string, any]) => {
    const sourcePath = resolve(repoRoot, info.location)
    const targetPath = resolve(tmpDir, info.location)
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

  // Edit all the packages to have them directly link any internal dependencies
  console.log(chalk.cyan("Modifying package.json files for direct installation"))
  await Bluebird.map(Object.entries(workspaces), async ([name, info]: [string, any]) => {
    const packageRoot = resolve(tmpDir, info.location)
    const packageJsonPath = resolve(packageRoot, "package.json")
    const packageJson = require(packageJsonPath)

    for (const depName of info.workspaceDependencies) {
      const depInfo = workspaces[depName]
      const targetRoot = resolve(tmpDir, depInfo.location)
      const relPath = relative(packageRoot, targetRoot)
      packageJson.dependencies[depName] = "file:" + relPath
    }

    await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2))

    console.log(chalk.green(" ✓ " + name))
  })

  // Run yarn install in the cli package
  console.log(chalk.cyan("Installing packages in @garden-io/cli package"))
  const cliPath = resolve(tmpDir, workspaces["@garden-io/cli"].location)
  await exec("yarn", ["--production"], { cwd: cliPath })

  console.log(chalk.cyan("Fetching pkg base binaries"))

  // Work around concurrency bug in pkg...
  for (const [targetName, spec] of Object.entries(selected)) {
    await exec(pkgFetchPath, spec.pkgType.split("-"))
    console.log(chalk.green(" ✓ " + targetName))
  }

  // Run pkg and pack up each platform binary
  console.log(chalk.cyan("Packaging garden binaries"))

  await Bluebird.map(Object.entries(selected), async ([targetName, spec]) => {
    await spec.handler({ targetName, sourcePath: cliPath, pkgType: spec.pkgType, version })
    console.log(chalk.green(" ✓ " + targetName))
  })

  console.log(chalk.green.bold("Done!"))
}

async function pkgMacos({ targetName, sourcePath, pkgType, version }: TargetHandlerParams) {
  console.log(` - ${targetName} -> fsevents`)
  // Copy fsevents from lib to node_modules
  await copy(resolve(GARDEN_CORE_ROOT, "lib", "fsevents"), resolve(tmpDir, "cli", "node_modules", "fsevents"))

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
  await exec("zip", ["-q", "-r", `garden-${version}-${targetName}.zip`, targetName], { cwd: distPath })
}

async function pkgAlpine({ targetName, version }: TargetHandlerParams) {
  const targetPath = resolve(distPath, targetName)
  await remove(targetPath)
  await mkdirp(targetPath)

  console.log(` - ${targetName} -> docker build`)
  const imageName = "gardendev/garden:alpine-builder"
  const containerName = "alpine-builder-" + randomString(8)
  const supportDir = resolve(repoRoot, "support")

  await copy(resolve(supportDir, ".dockerignore"), resolve(tmpDir, ".dockerignore"))

  await exec("docker", [
    "build",
    "-t",
    imageName,
    "-f",
    resolve(repoRoot, "support", "alpine-builder.Dockerfile"),
    tmpDir,
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

  console.log(` - ${targetName} -> pkg`)
  await exec(pkgPath, ["--target", pkgType, sourcePath, "--output", resolve(targetPath, binFilename)])

  console.log(` - ${targetName} -> ${sqliteBinFilename}`)
  await copy(
    resolve(GARDEN_CORE_ROOT, "lib", "better-sqlite3", `${targetName}-node-v68`, sqliteBinFilename),
    resolve(targetPath, sqliteBinFilename)
  )

  await copyStatic(targetName)
}

async function copyStatic(targetName: string) {
  const targetPath = resolve(distPath, targetName)
  console.log(` - ${targetName} -> static dir`)
  await copy(tmpStaticDir, resolve(targetPath, "static"))
}

async function tarball(targetName: string, version: string): Promise<void> {
  const filename = `garden-${version}-${targetName}.tar.gz`
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

      // tslint:disable-next-line: no-floating-promises
      writeFile(hashPath, sha256 + "\n")
        .catch(reject)
        .then(_resolve)
    })

    response.pipe(hash)
  })
}

buildBinaries(process.argv.slice(2)).catch((err) => {
  console.error(chalk.red(err.message))
  process.exit(1)
})
