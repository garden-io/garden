/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

const nodetree = require("nodetree")
import { join } from "path"
import { pathExists, readdir, createFile } from "fs-extra"
import { expect } from "chai"
import { BuildTask } from "../../../src/tasks/build"
import { makeTestGarden, dataDir, expectError, getDataDir, TestGarden } from "../../helpers"
import { getConfigFilePath } from "../../../src/util/fs"
import { BuildDir } from "../../../src/build-dir"

/*
  Module dependency diagram for build-dir test project

    a   b
     \ /
      d   c  e (e is a local exec module)
        \ | /
          f
 */

const projectRoot = join(dataDir, "test-projects", "build-dir")

const makeGarden = async () => {
  return await makeTestGarden(projectRoot)
}

describe("BuildDir", () => {
  let garden: TestGarden

  before(async () => {
    garden = await makeGarden()
  })

  afterEach(async () => {
    await garden.buildDir.clear()
  })

  it("should have ensured the existence of the build dir when Garden was initialized", async () => {
    const buildDirExists = await pathExists(garden.buildDir.buildDirPath)
    expect(buildDirExists).to.eql(true)
  })

  it("should clear the build dir when requested", async () => {
    const nodeCount = await readdir(garden.buildDir.buildDirPath)
    expect(nodeCount).to.eql([])
  })

  it("should ensure that a module's build subdir exists before returning from buildPath", async () => {
    const moduleA = await garden.resolveModule("module-a")
    const buildPath = await garden.buildDir.buildPath(moduleA)
    expect(await pathExists(buildPath)).to.eql(true)
  })

  it("should throw if rsync is not on PATH", async () => {
    const orgPath = process.env.PATH

    try {
      process.env.PATH = ""
      await expectError(
        () => BuildDir.factory(garden.projectRoot, garden.gardenDirPath),
        (err) =>
          expect(err.message).to.equal(
            "Could not find rsync binary. Please make sure rsync (version 3.1.0 or later) is installed " +
              "and on your PATH."
          )
      )
    } finally {
      process.env.PATH = orgPath
    }
  })

  it("should throw if rsync is too old", async () => {
    const orgPath = process.env.PATH

    try {
      process.env.PATH = getDataDir("dummy-rsync", "old-version")
      await expectError(
        () => BuildDir.factory(garden.projectRoot, garden.gardenDirPath),
        (err) =>
          expect(err.message).to.equal(
            "Found rsync binary but the version is too old (2.1.2). Please install version 3.1.0 or later."
          )
      )
    } finally {
      process.env.PATH = orgPath
    }
  })

  it("should throw if rsync returns invalid version", async () => {
    const orgPath = process.env.PATH

    try {
      process.env.PATH = getDataDir("dummy-rsync", "invalid")
      await expectError(
        () => BuildDir.factory(garden.projectRoot, garden.gardenDirPath),
        (err) =>
          expect(err.message).to.equal(
            "Could not detect rsync version. Please make sure rsync version 3.1.0 or later is installed " +
              "and on your PATH."
          )
      )
    } finally {
      process.env.PATH = orgPath
    }
  })

  describe("syncFromSrc", () => {
    it("should sync sources to the build dir", async () => {
      const graph = await garden.getConfigGraph(garden.log)
      const moduleA = graph.getModule("module-a")
      await garden.buildDir.syncFromSrc(moduleA, garden.log)
      const buildDirA = await garden.buildDir.buildPath(moduleA)

      const copiedPaths = [join(buildDirA, "some-dir", "some-file")]

      for (const p of copiedPaths) {
        expect(await pathExists(p)).to.eql(true)
      }
    })

    it("should not sync sources for local exec modules", async () => {
      const graph = await garden.getConfigGraph(garden.log)
      const moduleE = graph.getModule("module-e")
      await garden.buildDir.syncFromSrc(moduleE, garden.log)
      // This is the dir Garden would have synced the sources into
      const buildDirF = join(garden.buildDir.buildDirPath, moduleE.name)

      expect(await pathExists(buildDirF)).to.eql(false)
    })

    it("should respect the file list in the module's version", async () => {
      const graph = await garden.getConfigGraph(garden.log)
      const moduleA = graph.getModule("module-a")

      moduleA.version.files = [await getConfigFilePath(moduleA.path)]

      await garden.buildDir.syncFromSrc(moduleA, garden.log)
      const buildDirA = await garden.buildDir.buildPath(moduleA)

      expect(await pathExists(await getConfigFilePath(buildDirA))).to.eql(true)
      expect(await pathExists(join(buildDirA, "some-dir", "some-file"))).to.eql(false)
    })

    it("should delete files that are not being synced from the module source directory", async () => {
      const graph = await garden.getConfigGraph(garden.log)
      const moduleA = graph.getModule("module-a")

      const buildDirA = await garden.buildDir.buildPath(moduleA)
      const deleteMe = join(buildDirA, "delete-me")

      await createFile(deleteMe)

      moduleA.version.files = [await getConfigFilePath(moduleA.path)]

      await garden.buildDir.syncFromSrc(moduleA, garden.log)

      expect(await pathExists(deleteMe)).to.be.false
    })

    it("should sync hidden files and directories (names starting with .)", async () => {
      const graph = await garden.getConfigGraph(garden.log)
      const module = graph.getModule("hidden-files")

      await garden.buildDir.syncFromSrc(module, garden.log)

      const buildDir = await garden.buildDir.buildPath(module)
      expect(await pathExists(join(buildDir, ".hidden-file"))).to.be.true
      expect(await pathExists(join(buildDir, ".hidden-dir", "something"))).to.be.true
    })

    it("should sync symlinks that point within the module root", async () => {
      const graph = await garden.getConfigGraph(garden.log)
      const module = graph.getModule("symlink-within-module")

      await garden.buildDir.syncFromSrc(module, garden.log)

      const buildDir = await garden.buildDir.buildPath(module)
      expect(await pathExists(join(buildDir, "symlink.txt"))).to.be.true
      expect(await pathExists(join(buildDir, "nested", "symlink.txt"))).to.be.true
    })

    it("should not sync symlinks that point outside the module root", async () => {
      const graph = await garden.getConfigGraph(garden.log)
      const module = graph.getModule("symlink-outside-module")

      await garden.buildDir.syncFromSrc(module, garden.log)

      const buildDir = await garden.buildDir.buildPath(module)
      expect(await pathExists(join(buildDir, "symlink.txt"))).to.be.false
    })

    it("should not sync absolute symlinks", async () => {
      const graph = await garden.getConfigGraph(garden.log)
      const module = graph.getModule("symlink-absolute")

      await garden.buildDir.syncFromSrc(module, garden.log)

      const buildDir = await garden.buildDir.buildPath(module)
      expect(await pathExists(join(buildDir, "symlink.txt"))).to.be.false
    })
  })

  it("should sync dependency products to their specified destinations", async () => {
    const log = garden.log

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
      const buildDirD = await garden.buildDir.buildPath(moduleD)
      const buildDirF = await garden.buildDir.buildPath(moduleF)

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
      console.log(nodetree(garden.buildDir.buildDirPath))
      throw e
    }
  })

  describe("buildPath", () => {
    it("should ensure the build path and return it", async () => {
      const graph = await garden.getConfigGraph(garden.log)
      const moduleA = graph.getModule("module-a")
      const buildDirA = await garden.buildDir.buildPath(moduleA)

      expect(await pathExists(buildDirA)).to.eql(true)
      expect(buildDirA).to.eql(join(garden.buildDir.buildDirPath, "module-a"))
    })

    it("should return the module path for a local exec modules", async () => {
      const graph = await garden.getConfigGraph(garden.log)
      const moduleE = graph.getModule("module-e")
      const buildDirE = await garden.buildDir.buildPath(moduleE)

      expect(buildDirE).to.eql(moduleE.path)
    })
  })
})
