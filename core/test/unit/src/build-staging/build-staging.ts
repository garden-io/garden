/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import readdir from "@jsdevtools/readdir-enhanced"
import { join, basename } from "path"
import { pathExists, createFile, realpath, readFile, ensureFile, writeFile, ensureDir } from "fs-extra"
import { expect } from "chai"
import { makeTestGarden, TestGarden, expectError, getDataDir } from "../../../helpers"
import { defaultConfigFilename, TempDirectory, makeTempDir, joinWithPosix } from "../../../../src/util/fs"
import { BuildStaging, SyncParams } from "../../../../src/build-staging/build-staging"
import { Log } from "../../../../src/logger/log-entry"
import { TestGardenOpts } from "../../../../src/util/testing"
import { BuildStagingRsync, minRsyncVersion } from "../../../../src/build-staging/rsync"
import { BuildTask } from "../../../../src/tasks/build"
import { ConfigGraph } from "../../../../src/graph/config-graph"
import { BuildAction } from "../../../../src/actions/build"
import { DOCS_BASE_URL } from "../../../../src/constants"

// TODO-G2: rename test cases to match the new graph model semantics

/*
  Module dependency diagram for build-dir test project

    a   b
     \ /
      d   c  e (e is a local exec module)
        \ | /
          f
 */

const projectRoot = getDataDir("test-projects", "build-dir")

const makeGarden = async (opts: TestGardenOpts = {}) => {
  return await makeTestGarden(projectRoot, { ...opts, noTempDir: true })
}

async function populateDirectory(root: string, posixPaths: string[]) {
  await Promise.all(
    posixPaths.map(async (path) => {
      const absPath = joinWithPosix(root, path)
      await ensureFile(absPath)
      await writeFile(absPath, basename(path))
    })
  )
}

async function listFiles(path: string) {
  return (await readdir(path, { deep: true, filter: (stats) => stats.isFile() })).sort()
}

async function assertIdentical(sourceRoot: string, targetRoot: string, posixPaths?: string[]) {
  if (!posixPaths) {
    posixPaths = await listFiles(sourceRoot)
  }

  await Promise.all(
    posixPaths.map(async (path) => {
      const sourcePath = joinWithPosix(sourceRoot, path)
      const targetPath = joinWithPosix(targetRoot, path)
      const sourceData = (await readFile(sourcePath)).toString()
      const targetData = (await readFile(targetPath)).toString()
      expect(sourceData).to.equal(targetData)
    })
  )
}

describe("BuildStaging", () => {
  let garden: TestGarden
  let log: Log
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
        { contains: "Build staging: Got absolute path for sourceRelPath" }
      )
    })

    it("throws if target relative path is absolute", async () => {
      await expectError(
        () => sync({ log, sourceRoot: tmpPath, targetRoot: tmpPath, targetRelPath: "/foo", withDelete: false }),
        { contains: "Build staging: Got absolute path for targetRelPath" }
      )
    })

    it("throws if target relative path contains wildcards", async () => {
      await expectError(
        () => sync({ log, sourceRoot: tmpPath, targetRoot: tmpPath, targetRelPath: "foo/*", withDelete: false }),
        { contains: "Build staging: Target path (foo/*) must not contain wildcards" }
      )
    })

    it("throws if source root doesn't exist", async () => {
      await expectError(() => sync({ log, sourceRoot: "/oepfkaopwefk", targetRoot: tmpPath, withDelete: false }), {
        contains: "Build staging: Source root /oepfkaopwefk must exist and be a directory",
      })
    })

    it("throws if source root is not a directory", async () => {
      const path = join(tmpPath, "a")
      await ensureFile(path)

      await expectError(() => sync({ log, sourceRoot: path, targetRoot: tmpPath, withDelete: false }), {
        contains: `Build staging: Source root ${path} must exist and be a directory`,
      })
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
        { contains: `Build staging: Expected source path ${tmpPath}/a/ to be a directory` }
      )
    })

    it("throws if target rel path ends with slash but points to a file", async () => {
      await ensureFile(join(tmpPath, "a"))

      await expectError(
        () => sync({ log, sourceRoot: tmpPath, targetRoot: tmpPath, targetRelPath: "a/", withDelete: false }),
        { contains: `Build staging: Expected target path ${tmpPath}/a/ to not exist or be a directory` }
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
        { contains: "Build staging: Both source and target must be directories when specifying a file list" }
      )
    })

    it("throws if source relative path has wildcard and target path points to an existing file", async () => {
      await ensureFile(join(tmpPath, "a"))

      await expectError(
        () => sync({ log, sourceRoot: tmpPath, targetRoot: join(tmpPath, "a"), sourceRelPath: "*", withDelete: false }),
        {
          contains: `Build staging: Attempting to copy multiple files from ${tmpPath} to ${tmpPath}/a, but a file exists at target path`,
        }
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
        {
          contains: `Build staging: Attempting to copy directory from ${tmpPath} to ${tmpPath}/a, but a file exists at target path`,
        }
      )
    })
  })
})

describe("BuildStagingRsync", () => {
  let garden: TestGarden

  before(async () => {
    garden = await makeGarden({ legacyBuildSync: true })
  })

  afterEach(async () => {
    await garden.buildStaging.clear()
  })

  it("should have ensured the existence of the build dir when Garden was initialized", async () => {
    const buildDirExists = await pathExists(garden.buildStaging.buildDirPath)
    expect(buildDirExists).to.eql(true)
  })

  describe("(common)", () => commonSyncTests(false))

  describe("sync", () => {
    let buildStaging: BuildStagingRsync
    let graph: ConfigGraph
    let action: BuildAction

    beforeEach(async () => {
      buildStaging = new BuildStagingRsync(garden.projectRoot, garden.gardenDirPath)
      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      action = graph.getBuild("module-a")
    })

    it("should not sync symlinks that point outside the module root", async () => {
      const actionWithSymlink = graph.getBuild("symlink-outside-module")

      await garden.buildStaging.syncFromSrc({ action: actionWithSymlink, log: garden.log })

      const buildDir = garden.buildStaging.getBuildPath(actionWithSymlink.getConfig())
      expect(await pathExists(join(buildDir, "symlink.txt"))).to.be.false
    })

    it("should throw if rsync is not on PATH", async () => {
      const orgPath = process.env.PATH

      try {
        process.env.PATH = ""
        await expectError(() => buildStaging.syncFromSrc({ action, log: garden.log }), {
          contains: [
            "Could not find rsync binary",
            "Please make sure rsync (version 3.1.0 or later) is installed and on your PATH.",
          ],
        })
      } finally {
        process.env.PATH = orgPath
      }
    })

    it(`should work with rsync v${minRsyncVersion}`, async () => {
      buildStaging.setRsyncPath(getDataDir("dummy-rsync", "min-version", "rsync"))
      await buildStaging.validate()
    })

    it("should work with rsync v3.2.3", async () => {
      buildStaging.setRsyncPath(getDataDir("dummy-rsync", "new-version", "rsync"))
      await buildStaging.validate()
    })

    it("should throw if rsync is too old", async () => {
      buildStaging.setRsyncPath(getDataDir("dummy-rsync", "old-version", "rsync"))
      await expectError(() => buildStaging.syncFromSrc({ action, log: garden.log }), {
        contains: [
          "found rsync binary but the version is too old",
          "please make sure rsync",
          `more about garden installation and requirements can be found in our documentation at ${DOCS_BASE_URL}/getting-started/installation`,
        ],
      })
    })

    it("should throw if rsync returns invalid version", async () => {
      buildStaging.setRsyncPath(getDataDir("dummy-rsync", "invalid", "rsync"))
      await expectError(() => buildStaging.syncFromSrc({ action, log: garden.log }), {
        contains: [
          "could not detect rsync binary version in the version command",
          "please make sure rsync",
          `more about garden installation and requirements can be found in our documentation at ${DOCS_BASE_URL}/getting-started/installation`,
        ],
      })
    })
  })
})

function commonSyncTests(legacyBuildSync: boolean) {
  let garden: TestGarden
  let log: Log
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
    const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const buildActions = graph.getBuilds()
    const buildTasks = buildActions.map(
      (action) =>
        new BuildTask({
          garden,
          log,
          graph,
          action,
          force: true,
          forceBuild: false,
        })
    )

    await garden.processTasks({ tasks: buildTasks })

    const buildActionD = graph.getBuild("module-d")
    const buildActionF = graph.getBuild("module-f")
    const buildDirD = buildStaging.getBuildPath(buildActionD.getConfig())
    const buildDirF = buildStaging.getBuildPath(buildActionF.getConfig())

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
  })

  describe("ensureBuildPath", () => {
    it("should ensure the build path and return it", async () => {
      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const buildActionA = graph.getBuild("module-a")
      const buildDirA = await buildStaging.ensureBuildPath(buildActionA.getConfig())

      expect(await pathExists(buildDirA)).to.eql(true)
      expect(buildDirA).to.eql(join(buildStaging.buildDirPath, "module-a"))
    })

    it("should return the module path for a local exec modules", async () => {
      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const buildActionE = graph.getBuild("module-e")
      const buildDirE = await buildStaging.ensureBuildPath(buildActionE.getConfig())

      expect(buildDirE).to.eql(buildActionE.getBuildPath())
    })
  })

  it("should sync sources to the build dir", async () => {
    const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const buildActionA = graph.getBuild("module-a")
    await buildStaging.syncFromSrc({ action: buildActionA, log: garden.log })
    const buildDirA = buildStaging.getBuildPath(buildActionA.getConfig())

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
    const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const buildActionA = graph.getBuild("module-a")
    const buildPath = await buildStaging.ensureBuildPath(buildActionA.getConfig())
    expect(await pathExists(buildPath)).to.eql(true)
  })

  describe("sync", () => {
    it("should not sync sources for local exec modules", async () => {
      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const buildActionE = graph.getBuild("module-e")
      await buildStaging.syncFromSrc({ action: buildActionE, log: garden.log })
      // This is the dir Garden would have synced the sources into
      const buildDirF = join(buildStaging.buildDirPath, buildActionE.name)

      expect(await pathExists(buildDirF)).to.eql(false)
    })

    it("should respect the file list in the module's version", async () => {
      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const buildActionA = graph.getBuild("module-a")

      buildActionA.getFullVersion().files = [{
        relativePath: defaultConfigFilename,
        absolutePath: join(buildActionA.basePath(), defaultConfigFilename),
        source: "vcs",
      }]


      await buildStaging.syncFromSrc({ action: buildActionA, log: garden.log })
      const buildDirA = buildStaging.getBuildPath(buildActionA.getConfig())

      expect(await pathExists(join(buildDirA, defaultConfigFilename))).to.eql(true)
      expect(await pathExists(join(buildDirA, "some-dir", "some-file"))).to.eql(false)
    })

    it("should delete files that are not being synced from the module source directory", async () => {
      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const buildActionA = graph.getBuild("module-a")

      const buildDirA = await buildStaging.ensureBuildPath(buildActionA.getConfig())
      const deleteMe = join(buildDirA, "delete-me")

      await createFile(deleteMe)

      buildActionA.getFullVersion().files = [{
        relativePath: defaultConfigFilename,
        absolutePath: join(buildActionA.basePath(), defaultConfigFilename),
        source: "vcs",
      }]

      await buildStaging.syncFromSrc({ action: buildActionA, log: garden.log })

      expect(await pathExists(deleteMe)).to.be.false
    })

    it("should sync hidden files and directories (names starting with .)", async () => {
      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const buildAction = graph.getBuild("hidden-files")

      await buildStaging.syncFromSrc({ action: buildAction, log: garden.log })

      const buildDir = buildStaging.getBuildPath(buildAction.getConfig())
      expect(await pathExists(join(buildDir, ".hidden-file"))).to.be.true
      expect(await pathExists(join(buildDir, ".hidden-dir", "something"))).to.be.true
    })

    it("should sync symlinks that point within the module root", async () => {
      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const buildAction = graph.getBuild("symlink-within-module")

      await buildStaging.syncFromSrc({ action: buildAction, log: garden.log })

      const buildDir = buildStaging.getBuildPath(buildAction.getConfig())
      expect(await pathExists(join(buildDir, "symlink.txt"))).to.be.true
      expect(await pathExists(join(buildDir, "nested", "symlink.txt"))).to.be.true
    })

    it("should not sync absolute symlinks", async () => {
      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const buildAction = graph.getBuild("symlink-absolute")

      await buildStaging.syncFromSrc({ action: buildAction, log: garden.log })

      const buildDir = buildStaging.getBuildPath(buildAction.getConfig())
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

    it("correctly handles special characters in the file name, withDelete true", async () => {
      const specialFilenames = ["[id].vue", "*foo", "bla?"]
      const a = join(tmpPath, "a")
      const b = join(tmpPath, "b")
      await ensureDir(a)
      for (const filename of specialFilenames) {
        await writeFile(join(a, filename), "foo")
      }
      await ensureDir(b)
      await sync({
        log,
        sourceRoot: tmpPath,
        sourceRelPath: "a/",
        files: specialFilenames,
        targetRoot: b,
        withDelete: true,
      })
      for (const filename of specialFilenames) {
        const data = (await readFile(join(b, filename))).toString()
        expect(data).to.equal("foo")
      }
    })

    it("correctly handles special characters in the file name, withDelete false", async () => {
      const specialFilenames = ["[id].vue", "*foo", "bla?"]
      const a = join(tmpPath, "a")
      const b = join(tmpPath, "b")
      await ensureDir(a)
      for (const filename of specialFilenames) {
        await writeFile(join(a, filename), "foo")
      }
      await ensureDir(b)
      await sync({
        log,
        sourceRoot: tmpPath,
        sourceRelPath: "a/",
        files: specialFilenames,
        targetRoot: b,
        withDelete: false,
      })
      for (const filename of specialFilenames) {
        const data = (await readFile(join(b, filename))).toString()
        expect(data).to.equal("foo")
      }
    })
  })
}
