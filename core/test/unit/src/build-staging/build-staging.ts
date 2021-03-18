/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

const nodetree = require("nodetree")
import readdir from "@jsdevtools/readdir-enhanced"
import { join, basename } from "path"
import { pathExists, createFile, realpath, readFile, ensureFile, writeFile, ensureDir } from "fs-extra"
import { expect } from "chai"
import { BuildTask } from "../../../../src/tasks/build"
import { makeTestGarden, dataDir, TestGarden, expectError } from "../../../helpers"
import { defaultConfigFilename, TempDirectory, makeTempDir, joinWithPosix } from "../../../../src/util/fs"
import { BuildStaging, SyncParams } from "../../../../src/build-staging/build-staging"
import { LogEntry } from "../../../../src/logger/log-entry"
import Bluebird from "bluebird"
import { TestGardenOpts } from "../../../../src/util/testing"

/*
  Module dependency diagram for build-dir test project

    a   b
     \ /
      d   c  e (e is a local exec module)
        \ | /
          f
 */

const projectRoot = join(dataDir, "test-projects", "build-dir")

const makeGarden = async (opts: TestGardenOpts = {}) => {
  return await makeTestGarden(projectRoot, opts)
}

async function populateDirectory(root: string, posixPaths: string[]) {
  await Bluebird.map(posixPaths, async (path) => {
    const absPath = joinWithPosix(root, path)
    await ensureFile(absPath)
    await writeFile(absPath, basename(path))
  })
}

async function listFiles(path: string) {
  return (await readdir(path, { deep: true, filter: (stats) => stats.isFile() })).sort()
}

async function assertIdentical(sourceRoot: string, targetRoot: string, posixPaths?: string[]) {
  if (!posixPaths) {
    posixPaths = await listFiles(sourceRoot)
  }

  await Bluebird.map(posixPaths, async (path) => {
    const sourcePath = joinWithPosix(sourceRoot, path)
    const targetPath = joinWithPosix(targetRoot, path)
    const sourceData = (await readFile(sourcePath)).toString()
    const targetData = (await readFile(targetPath)).toString()
    expect(sourceData).to.equal(targetData)
  })
}

describe("BuildStaging", () => {
  let garden: TestGarden
  let log: LogEntry
  let buildStaging: BuildStaging

  before(async () => {
    garden = await makeGarden()
    log = garden.log
    buildStaging = garden.buildStaging
  })

  afterEach(async () => {
    await buildStaging.clear()
  })

  async function sync(params: SyncParams) {
    return buildStaging["sync"](params)
  }

  describe("(common)", () => commonSyncTests(true))

  describe("sync", () => {
    let tmpDir: TempDirectory
    let tmpPath: string

    beforeEach(async () => {
      tmpDir = await makeTempDir()
      tmpPath = await realpath(tmpDir.path)
    })

    afterEach(async () => {
      await tmpDir?.cleanup()
    })

    it("syncs source directory to populated target directory and deletes extraneous files", async () => {
      const sourceRoot = join(tmpPath, "source")
      const targetRoot = join(tmpPath, "target")

      await ensureDir(sourceRoot)
      await ensureDir(targetRoot)
      await populateDirectory(sourceRoot, ["a", "subdir/c"])
      await populateDirectory(targetRoot, ["b", "subdir/subsubdir/d"])

      await sync({ log, sourceRoot, targetRoot, withDelete: true })

      await assertIdentical(sourceRoot, targetRoot, ["a", "subdir/c"])
      expect(await listFiles(targetRoot)).to.eql(["a", "subdir/c"])
    })

    it("throws if source relative path is absolute", async () => {
      await expectError(
        () => sync({ log, sourceRoot: tmpPath, targetRoot: tmpPath, sourceRelPath: "/foo", withDelete: false }),
        (err) => expect(err.message).to.equal("Build staging: Got absolute path for sourceRelPath")
      )
    })

    it("throws if target relative path is absolute", async () => {
      await expectError(
        () => sync({ log, sourceRoot: tmpPath, targetRoot: tmpPath, targetRelPath: "/foo", withDelete: false }),
        (err) => expect(err.message).to.equal("Build staging: Got absolute path for targetRelPath")
      )
    })

    it("throws if target relative path contains wildcards", async () => {
      await expectError(
        () => sync({ log, sourceRoot: tmpPath, targetRoot: tmpPath, targetRelPath: "foo/*", withDelete: false }),
        (err) => expect(err.message).to.equal("Build staging: Target path (foo/*) must not contain wildcards")
      )
    })

    it("throws if source root doesn't exist", async () => {
      await expectError(
        () => sync({ log, sourceRoot: "/oepfkaopwefk", targetRoot: tmpPath, withDelete: false }),
        (err) => expect(err.message).to.equal("Build staging: Source root /oepfkaopwefk must exist and be a directory")
      )
    })

    it("throws if source root is not a directory", async () => {
      const path = join(tmpPath, "a")
      await ensureFile(path)

      await expectError(
        () => sync({ log, sourceRoot: path, targetRoot: tmpPath, withDelete: false }),
        (err) => expect(err.message).to.equal(`Build staging: Source root ${path} must exist and be a directory`)
      )
    })

    it("does nothing if source path has no wildcard and cannot be found", async () => {
      await sync({ log, sourceRoot: tmpPath, targetRoot: tmpPath, sourceRelPath: "foo", withDelete: false })
      const files = await readdir(tmpPath)
      expect(files.length).to.equal(0)
    })

    it("throws if source rel path ends with slash but points to a file", async () => {
      await ensureFile(join(tmpPath, "a"))

      await expectError(
        () => sync({ log, sourceRoot: tmpPath, targetRoot: tmpPath, sourceRelPath: "a/", withDelete: false }),
        (err) => expect(err.message).to.equal(`Build staging: Expected source path ${tmpPath}/a/ to be a directory`)
      )
    })

    it("throws if target rel path ends with slash but points to a file", async () => {
      await ensureFile(join(tmpPath, "a"))

      await expectError(
        () => sync({ log, sourceRoot: tmpPath, targetRoot: tmpPath, targetRelPath: "a/", withDelete: false }),
        (err) =>
          expect(err.message).to.equal(
            `Build staging: Expected target path ${tmpPath}/a/ to not exist or be a directory`
          )
      )
    })

    it("throws if file list is specified and source+target aren't both directories", async () => {
      await ensureFile(join(tmpPath, "a"))

      await expectError(
        () =>
          sync({
            log,
            sourceRoot: tmpPath,
            targetRoot: tmpPath,
            sourceRelPath: "a",
            withDelete: false,
            files: ["b"],
          }),
        (err) =>
          expect(err.message).to.equal(
            "Build staging: Both source and target must be directories when specifying a file list"
          )
      )
    })

    it("throws if source relative path has wildcard and target path points to an existing file", async () => {
      await ensureFile(join(tmpPath, "a"))

      await expectError(
        () => sync({ log, sourceRoot: tmpPath, targetRoot: join(tmpPath, "a"), sourceRelPath: "*", withDelete: false }),
        (err) =>
          expect(err.message).to.equal(
            `Build staging: Attempting to copy multiple files from ${tmpPath} to ${tmpPath}/a, but a file exists at target path`
          )
      )
    })

    it("removes target before cloning if source is a directory, target is a file and withDelete=true", async () => {
      const sourceRoot = join(tmpPath, "source")
      const targetRoot = join(tmpPath, "target")

      await ensureDir(sourceRoot)
      await ensureFile(targetRoot)
      await populateDirectory(sourceRoot, ["a", "b", "subdir/c", "subdir/subsubdir/d"])

      await sync({ log, sourceRoot, targetRoot, withDelete: true })

      await assertIdentical(sourceRoot, targetRoot)
    })

    it("throws if source is directory, target is a file and withDelete=false", async () => {
      await ensureFile(join(tmpPath, "a"))

      await expectError(
        () => sync({ log, sourceRoot: tmpPath, targetRoot: tmpPath, targetRelPath: "a", withDelete: false }),
        (err) =>
          expect(err.message).to.equal(
            `Build staging: Attempting to copy directory from ${tmpPath} to ${tmpPath}/a, but a file exists at target path`
          )
      )
    })
  })
})

export function commonSyncTests(legacyBuildSync: boolean) {
  let garden: TestGarden
  let log: LogEntry
  let buildStaging: BuildStaging
  let tmpDir: TempDirectory
  let tmpPath: string

  before(async () => {
    garden = await makeGarden({ legacyBuildSync })
    log = garden.log
    buildStaging = garden.buildStaging
  })

  beforeEach(async () => {
    tmpDir = await makeTempDir()
    tmpPath = await realpath(tmpDir.path)
  })

  afterEach(async () => {
    await buildStaging.clear()
    await tmpDir?.cleanup()
  })

  async function sync(params: SyncParams) {
    return buildStaging["sync"](params)
  }

  it("should sync dependency products to their specified destinations", async () => {
    try {
      const graph = await garden.getConfigGraph(garden.log)
      const modules = graph.getModules()
      const tasks = modules.map(
        (module) =>
          new BuildTask({
            garden,
            graph,
            log,
            module,
            force: true,
            _guard: true,
          })
      )

      await garden.processTasks(tasks)

      const moduleD = await garden.resolveModule("module-d")
      const moduleF = await garden.resolveModule("module-f")
      const buildDirD = await buildStaging.buildPath(moduleD)
      const buildDirF = await buildStaging.buildPath(moduleF)

      // All these destinations should be populated now.
      const buildProductDestinations = [
        join(buildDirD, "a", "a.txt"),
        join(buildDirD, "b", "build", "b1.txt"),
        join(buildDirD, "b", "build_subdir", "b2.txt"),
        join(buildDirF, "d", "build", "d.txt"),
        join(buildDirF, "e", "e1.txt"),
        join(buildDirF, "e", "build", "e2.txt"),
      ]

      for (const p of buildProductDestinations) {
        expect(await pathExists(p)).to.eql(true, `${p} not found`)
      }

      // This file was not requested by module-d's garden.yml's copy directive for module-b.
      const notCopiedPath = join(buildDirD, "B", "build", "unused.txt")
      expect(await pathExists(notCopiedPath)).to.eql(false)
    } catch (e) {
      // tslint:disable-next-line: no-console
      console.log(nodetree(buildStaging.buildDirPath))
      throw e
    }
  })

  describe("buildPath", () => {
    it("should ensure the build path and return it", async () => {
      const graph = await garden.getConfigGraph(garden.log)
      const moduleA = graph.getModule("module-a")
      const buildDirA = await buildStaging.buildPath(moduleA)

      expect(await pathExists(buildDirA)).to.eql(true)
      expect(buildDirA).to.eql(join(buildStaging.buildDirPath, "module-a"))
    })

    it("should return the module path for a local exec modules", async () => {
      const graph = await garden.getConfigGraph(garden.log)
      const moduleE = graph.getModule("module-e")
      const buildDirE = await buildStaging.buildPath(moduleE)

      expect(buildDirE).to.eql(moduleE.path)
    })
  })

  it("should sync sources to the build dir", async () => {
    const graph = await garden.getConfigGraph(garden.log)
    const moduleA = graph.getModule("module-a")
    await buildStaging.syncFromSrc(moduleA, garden.log)
    const buildDirA = await buildStaging.buildPath(moduleA)

    const copiedPaths = [join(buildDirA, "some-dir", "some-file")]

    for (const p of copiedPaths) {
      expect(await pathExists(p)).to.eql(true)
    }
  })

  it("should have ensured the existence of the build dir when Garden was initialized", async () => {
    const buildDirExists = await pathExists(buildStaging.buildDirPath)
    expect(buildDirExists).to.eql(true)
  })

  it("should clear the build dir when requested", async () => {
    const nodeCount = await readdir(buildStaging.buildDirPath)
    expect(nodeCount).to.eql([])
  })

  it("should ensure that a module's build subdir exists before returning from buildPath", async () => {
    const moduleA = await garden.resolveModule("module-a")
    const buildPath = await buildStaging.buildPath(moduleA)
    expect(await pathExists(buildPath)).to.eql(true)
  })

  describe("sync", () => {
    it("should not sync sources for local exec modules", async () => {
      const graph = await garden.getConfigGraph(garden.log)
      const moduleE = graph.getModule("module-e")
      await buildStaging.syncFromSrc(moduleE, garden.log)
      // This is the dir Garden would have synced the sources into
      const buildDirF = join(buildStaging.buildDirPath, moduleE.name)

      expect(await pathExists(buildDirF)).to.eql(false)
    })

    it("should respect the file list in the module's version", async () => {
      const graph = await garden.getConfigGraph(garden.log)
      const moduleA = graph.getModule("module-a")

      moduleA.version.files = [join(moduleA.path, defaultConfigFilename)]

      await buildStaging.syncFromSrc(moduleA, garden.log)
      const buildDirA = await buildStaging.buildPath(moduleA)

      expect(await pathExists(join(buildDirA, defaultConfigFilename))).to.eql(true)
      expect(await pathExists(join(buildDirA, "some-dir", "some-file"))).to.eql(false)
    })

    it("should delete files that are not being synced from the module source directory", async () => {
      const graph = await garden.getConfigGraph(garden.log)
      const moduleA = graph.getModule("module-a")

      const buildDirA = await buildStaging.buildPath(moduleA)
      const deleteMe = join(buildDirA, "delete-me")

      await createFile(deleteMe)

      moduleA.version.files = [join(moduleA.path, defaultConfigFilename)]

      await buildStaging.syncFromSrc(moduleA, garden.log)

      expect(await pathExists(deleteMe)).to.be.false
    })

    it("should sync hidden files and directories (names starting with .)", async () => {
      const graph = await garden.getConfigGraph(garden.log)
      const module = graph.getModule("hidden-files")

      await buildStaging.syncFromSrc(module, garden.log)

      const buildDir = await buildStaging.buildPath(module)
      expect(await pathExists(join(buildDir, ".hidden-file"))).to.be.true
      expect(await pathExists(join(buildDir, ".hidden-dir", "something"))).to.be.true
    })

    it("should sync symlinks that point within the module root", async () => {
      const graph = await garden.getConfigGraph(garden.log)
      const module = graph.getModule("symlink-within-module")

      await buildStaging.syncFromSrc(module, garden.log)

      const buildDir = await buildStaging.buildPath(module)
      expect(await pathExists(join(buildDir, "symlink.txt"))).to.be.true
      expect(await pathExists(join(buildDir, "nested", "symlink.txt"))).to.be.true
    })

    it("should not sync absolute symlinks", async () => {
      const graph = await garden.getConfigGraph(garden.log)
      const module = graph.getModule("symlink-absolute")

      await buildStaging.syncFromSrc(module, garden.log)

      const buildDir = await buildStaging.buildPath(module)
      expect(await pathExists(join(buildDir, "symlink.txt"))).to.be.false
    })

    it("syncs source directory to empty target directory with no file list", async () => {
      const sourceRoot = join(tmpPath, "source")
      const targetRoot = join(tmpPath, "target")

      await ensureDir(sourceRoot)
      await ensureDir(targetRoot)
      await populateDirectory(sourceRoot, ["a", "b", "subdir/c", "subdir/subsubdir/d"])

      await sync({ log, sourceRoot, targetRoot, withDelete: false })

      await assertIdentical(sourceRoot, targetRoot)
    })

    it("syncs source directory to empty target directory with file list", async () => {
      const sourceRoot = join(tmpPath, "source")
      const targetRoot = join(tmpPath, "target")

      await ensureDir(sourceRoot)
      await ensureDir(targetRoot)
      await populateDirectory(sourceRoot, ["a", "b", "subdir/c", "subdir/subsubdir/d"])

      const files = ["a", "subdir/subsubdir/d"]
      await sync({ log, sourceRoot, targetRoot, withDelete: false, files })

      await assertIdentical(sourceRoot, targetRoot, files)
      expect(await listFiles(targetRoot)).to.eql(files)
    })

    it("syncs source directory to populated target directory with no file list", async () => {
      const sourceRoot = join(tmpPath, "source")
      const targetRoot = join(tmpPath, "target")

      await ensureDir(sourceRoot)
      await ensureDir(targetRoot)
      await populateDirectory(sourceRoot, ["a", "subdir/c"])
      await populateDirectory(targetRoot, ["b", "subdir/subsubdir/d"])

      await sync({ log, sourceRoot, targetRoot, withDelete: false })

      await assertIdentical(sourceRoot, targetRoot, ["a", "subdir/c"])
      expect(await listFiles(targetRoot)).to.eql(["a", "b", "subdir/c", "subdir/subsubdir/d"])
    })

    it("syncs source directory to populated target directory with file list", async () => {
      const sourceRoot = join(tmpPath, "source")
      const targetRoot = join(tmpPath, "target")

      await ensureDir(sourceRoot)
      await ensureDir(targetRoot)
      await populateDirectory(sourceRoot, ["a", "subdir/c"])
      await populateDirectory(targetRoot, ["b", "subdir/subsubdir/d"])

      await sync({ log, sourceRoot, targetRoot, withDelete: false, files: ["a"] })

      await assertIdentical(sourceRoot, targetRoot, ["a"])
      expect(await listFiles(targetRoot)).to.eql(["a", "b", "subdir/subsubdir/d"])
    })

    it("syncs directly if source path is a file and target doesn't exist", async () => {
      const a = join(tmpPath, "a")
      await writeFile(a, "foo")
      await sync({
        log,
        sourceRoot: tmpPath,
        sourceRelPath: "a",
        targetRoot: tmpPath,
        targetRelPath: "b",
        withDelete: false,
      })
      const data = (await readFile(join(tmpPath, "b"))).toString()
      expect(data).to.equal("foo")
    })

    it("syncs directly into target directory if source path is a file and target is a directory", async () => {
      const a = join(tmpPath, "a")
      const b = join(tmpPath, "b")
      await writeFile(a, "foo")
      await ensureDir(b)
      await sync({ log, sourceRoot: tmpPath, sourceRelPath: "a", targetRoot: b, withDelete: false })
      const data = (await readFile(join(b, "a"))).toString()
      expect(data).to.equal("foo")
    })

    it("syncs directly into target directory if source path is a file and targetRelPath ends with slash", async () => {
      const a = join(tmpPath, "a")
      const b = join(tmpPath, "b")
      await writeFile(a, "foo")
      await ensureDir(b)
      await sync({
        log,
        sourceRoot: tmpPath,
        sourceRelPath: "a",
        targetRoot: tmpPath,
        targetRelPath: "b/",
        withDelete: false,
      })
      const data = (await readFile(join(b, "a"))).toString()
      expect(data).to.equal("foo")
    })

    it("correctly handles '.' as the targetRelPath", async () => {
      const sourceRoot = join(tmpPath, "source")
      const targetRoot = join(tmpPath, "target")

      await ensureDir(sourceRoot)
      await ensureDir(targetRoot)
      await populateDirectory(sourceRoot, ["subdir/a"])

      await sync({ log, sourceRoot, sourceRelPath: "subdir", targetRoot, targetRelPath: ".", withDelete: false })

      expect(await listFiles(targetRoot)).to.eql(["subdir/a"])
    })
  })
}
