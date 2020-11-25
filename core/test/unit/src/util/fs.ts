/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { join } from "path"
import { getDataDir, makeTestGardenA, makeTestGarden } from "../../../helpers"
import {
  scanDirectory,
  toCygwinPath,
  getChildDirNames,
  isConfigFilename,
  getWorkingCopyId,
  findConfigPathsInPath,
  detectModuleOverlap,
  joinWithPosix,
} from "../../../../src/util/fs"
import { withDir } from "tmp-promise"
import { ModuleConfig } from "../../../../src/config/module"

describe("util", () => {
  describe("detectModuleOverlap", () => {
    const projectRoot = join("/", "user", "code")
    const gardenDirPath = join(projectRoot, ".garden")

    it("should detect if modules have the same root", () => {
      const moduleA = {
        name: "module-a",
        path: join(projectRoot, "foo"),
      } as ModuleConfig
      const moduleB = {
        name: "module-b",
        path: join(projectRoot, "foo"),
      } as ModuleConfig
      const moduleC = {
        name: "module-c",
        path: join(projectRoot, "foo"),
      } as ModuleConfig
      const moduleD = {
        name: "module-d",
        path: join(projectRoot, "bas"),
      } as ModuleConfig
      expect(
        detectModuleOverlap({ projectRoot, gardenDirPath, moduleConfigs: [moduleA, moduleB, moduleC, moduleD] })
      ).to.eql([
        {
          module: moduleA,
          overlaps: [moduleB, moduleC],
        },
        {
          module: moduleB,
          overlaps: [moduleA, moduleC],
        },
        {
          module: moduleC,
          overlaps: [moduleA, moduleB],
        },
      ])
    })
    it("should detect if a module has another module in its path", () => {
      const moduleA = {
        name: "module-a",
        path: join(projectRoot, "foo"),
      } as ModuleConfig
      const moduleB = {
        name: "module-b",
        path: join(projectRoot, "foo", "bar"),
      } as ModuleConfig
      const moduleC = {
        name: "module-c",
        path: join(projectRoot, "foo", "bar", "bas"),
      } as ModuleConfig
      const moduleD = {
        name: "module-d",
        path: join(projectRoot, "bas", "bar", "bas"),
      } as ModuleConfig
      expect(
        detectModuleOverlap({ projectRoot, gardenDirPath, moduleConfigs: [moduleA, moduleB, moduleC, moduleD] })
      ).to.eql([
        {
          module: moduleA,
          overlaps: [moduleB, moduleC],
        },
        {
          module: moduleB,
          overlaps: [moduleC],
        },
      ])
    })

    context("same root", () => {
      it("should ignore modules that set includes", () => {
        const moduleA = {
          name: "module-a",
          path: join(projectRoot, "foo"),
          include: [""],
        } as ModuleConfig
        const moduleB = {
          name: "module-b",
          path: join(projectRoot, "foo"),
        } as ModuleConfig
        expect(detectModuleOverlap({ projectRoot, gardenDirPath, moduleConfigs: [moduleA, moduleB] })).to.eql([
          {
            module: moduleB,
            overlaps: [moduleA],
          },
        ])
      })
      it("should ignore modules that set excludes", () => {
        const moduleA = {
          name: "module-a",
          path: join(projectRoot, "foo"),
          exclude: [""],
        } as ModuleConfig
        const moduleB = {
          name: "module-b",
          path: join(projectRoot, "foo"),
        } as ModuleConfig
        expect(detectModuleOverlap({ projectRoot, gardenDirPath, moduleConfigs: [moduleA, moduleB] })).to.eql([
          {
            module: moduleB,
            overlaps: [moduleA],
          },
        ])
      })
    })

    context("nested modules", () => {
      it("should ignore modules that set includes", () => {
        const moduleA = {
          name: "module-a",
          path: join(projectRoot, "foo"),
          include: [""],
        } as ModuleConfig
        const moduleB = {
          name: "module-b",
          path: join(projectRoot, "foo", "bar"),
        } as ModuleConfig
        expect(detectModuleOverlap({ projectRoot, gardenDirPath, moduleConfigs: [moduleA, moduleB] })).to.be.empty
      })

      it("should ignore modules that set excludes", () => {
        const moduleA = {
          name: "module-a",
          path: join(projectRoot, "foo"),
          exclude: [""],
        } as ModuleConfig
        const moduleB = {
          name: "module-b",
          path: join(projectRoot, "foo", "bar"),
        } as ModuleConfig
        expect(detectModuleOverlap({ projectRoot, gardenDirPath, moduleConfigs: [moduleA, moduleB] })).to.be.empty
      })

      it("should detect overlaps if only nested module has includes/excludes", () => {
        const moduleA1 = {
          name: "module-a",
          path: join(projectRoot, "foo"),
        } as ModuleConfig
        const moduleB1 = {
          name: "module-b",
          path: join(projectRoot, "foo", "bar"),
          include: [""],
        } as ModuleConfig
        const moduleA2 = {
          name: "module-a",
          path: join(projectRoot, "foo"),
        } as ModuleConfig
        const moduleB2 = {
          name: "module-b",
          path: join(projectRoot, "foo", "bar"),
          exclude: [""],
        } as ModuleConfig
        expect(detectModuleOverlap({ projectRoot, gardenDirPath, moduleConfigs: [moduleA1, moduleB1] })).to.eql([
          {
            module: moduleA1,
            overlaps: [moduleB1],
          },
        ])
        expect(detectModuleOverlap({ projectRoot, gardenDirPath, moduleConfigs: [moduleA2, moduleB2] })).to.eql([
          {
            module: moduleA2,
            overlaps: [moduleB2],
          },
        ])
      })

      it("should not consider remote source modules to overlap with module in project root", () => {
        const remoteModule = {
          name: "remote-module",
          path: join(gardenDirPath, "sources", "foo", "bar"),
        } as ModuleConfig

        const moduleFoo = {
          name: "module-foo",
          path: join(projectRoot, "foo"),
          include: [""],
        } as ModuleConfig

        expect(detectModuleOverlap({ projectRoot, gardenDirPath, moduleConfigs: [moduleFoo, remoteModule] })).to.eql([])
      })
    })
  })

  describe("scanDirectory", () => {
    it("should iterate through all files in a directory", async () => {
      const testPath = getDataDir("scanDirectory")
      let count = 0

      const expectedPaths = ["1", "2", "3", "subdir", "subdir/4"].map((f) => join(testPath, f))

      for await (const item of scanDirectory(testPath)) {
        expect(expectedPaths).to.include(item.path)
        count++
      }

      expect(count).to.eq(5)
    })

    it("should filter files based on filter function", async () => {
      const testPath = getDataDir("scanDirectory")
      const filterFunc = (item) => !item.includes("scanDirectory/subdir")
      const expectedPaths = ["1", "2", "3"].map((f) => join(testPath, f))

      let count = 0

      for await (const item of scanDirectory(testPath, {
        filter: filterFunc,
      })) {
        expect(expectedPaths).to.include(item.path)
        count++
      }

      expect(count).to.eq(3)
    })
  })

  describe("getChildDirNames", () => {
    it("should return the names of all none hidden directories in the parent directory", async () => {
      const testPath = getDataDir("get-child-dir-names")
      expect(await getChildDirNames(testPath)).to.eql(["a", "b"])
    })
  })

  describe("toCygwinPath", () => {
    it("should convert a win32 path to a cygwin path", () => {
      const path = "C:\\some\\path"
      expect(toCygwinPath(path)).to.equal("/cygdrive/c/some/path")
    })

    it("should retain a trailing slash", () => {
      const path = "C:\\some\\path\\"
      expect(toCygwinPath(path)).to.equal("/cygdrive/c/some/path/")
    })
  })

  describe("isConfigFilename", () => {
    it("should return true if the name of the file is garden.yaml", async () => {
      expect(isConfigFilename("garden.yaml")).to.be.true
    })
    it("should return true if the name of the file is garden.yml", async () => {
      expect(isConfigFilename("garden.yml")).to.be.true
    })
    it("should return false otherwise", async () => {
      const badNames = ["agarden.yml", "garden.ymla", "garden.yaaml", "garden.ml"]
      for (const name of badNames) {
        expect(isConfigFilename(name)).to.be.false
      }
    })
  })

  describe("getWorkingCopyId", () => {
    it("should generate and return a new ID for an empty directory", async () => {
      return withDir(
        async (dir) => {
          const id = await getWorkingCopyId(dir.path)
          expect(id).to.be.string
        },
        { unsafeCleanup: true }
      )
    })

    it("should return the same ID after generating for the first time", async () => {
      return withDir(
        async (dir) => {
          const idA = await getWorkingCopyId(dir.path)
          const idB = await getWorkingCopyId(dir.path)

          expect(idA).to.equal(idB)
        },
        { unsafeCleanup: true }
      )
    })
  })

  describe("findConfigPathsInPath", () => {
    it("should recursively find all garden configs in a directory", async () => {
      const garden = await makeTestGardenA()
      const files = await findConfigPathsInPath({
        vcs: garden.vcs,
        dir: garden.projectRoot,
        log: garden.log,
      })
      expect(files).to.eql([
        join(garden.projectRoot, "garden.yml"),
        join(garden.projectRoot, "module-a", "garden.yml"),
        join(garden.projectRoot, "module-b", "garden.yml"),
        join(garden.projectRoot, "module-c", "garden.yml"),
      ])
    })

    it("should find custom-named garden configs", async () => {
      const garden = await makeTestGarden(getDataDir("test-projects", "custom-config-names"))
      const files = await findConfigPathsInPath({
        vcs: garden.vcs,
        dir: garden.projectRoot,
        log: garden.log,
      })
      expect(files).to.eql([
        join(garden.projectRoot, "module-a", "garden.yml"),
        join(garden.projectRoot, "module-b", "module-b.garden.yaml"),
        join(garden.projectRoot, "project.garden.yml"),
        join(garden.projectRoot, "workflows.garden.yml"),
      ])
    })

    it("should respect the include option, if specified", async () => {
      const garden = await makeTestGardenA()
      const include = ["module-a/**/*"]
      const files = await findConfigPathsInPath({
        vcs: garden.vcs,
        dir: garden.projectRoot,
        log: garden.log,
        include,
      })
      expect(files).to.eql([join(garden.projectRoot, "module-a", "garden.yml")])
    })

    it("should respect the exclude option, if specified", async () => {
      const garden = await makeTestGardenA()
      const exclude = ["module-a/**/*"]
      const files = await findConfigPathsInPath({
        vcs: garden.vcs,
        dir: garden.projectRoot,
        log: garden.log,
        exclude,
      })
      expect(files).to.eql([
        join(garden.projectRoot, "garden.yml"),
        join(garden.projectRoot, "module-b", "garden.yml"),
        join(garden.projectRoot, "module-c", "garden.yml"),
      ])
    })

    it("should respect the include and exclude options, if both are specified", async () => {
      const garden = await makeTestGardenA()
      const include = ["module*/**/*"]
      const exclude = ["module-a/**/*"]
      const files = await findConfigPathsInPath({
        vcs: garden.vcs,
        dir: garden.projectRoot,
        log: garden.log,
        include,
        exclude,
      })
      expect(files).to.eql([
        join(garden.projectRoot, "module-b", "garden.yml"),
        join(garden.projectRoot, "module-c", "garden.yml"),
      ])
    })
  })

  describe("joinWithPosix", () => {
    it("should join a POSIX path to another path", () => {
      expect(joinWithPosix("/tmp", "a/b")).to.equal("/tmp/a/b")
    })
  })
})
