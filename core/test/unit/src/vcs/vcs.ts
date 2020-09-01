/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  VcsHandler,
  TreeVersions,
  TreeVersion,
  getVersionString,
  writeTreeVersionFile,
  readTreeVersionFile,
} from "../../../../src/vcs/vcs"
import { projectRootA, makeTestGardenA, makeTestGarden, getDataDir, TestGarden } from "../../../helpers"
import { expect } from "chai"
import { cloneDeep } from "lodash"
import { ModuleConfig } from "../../../../src/config/module"
import { GitHandler } from "../../../../src/vcs/git"
import { resolve, join } from "path"
import td from "testdouble"
import tmp from "tmp-promise"
import { realpath, readFile, writeFile } from "fs-extra"
import { GARDEN_VERSIONFILE_NAME } from "../../../../src/constants"
import { defaultDotIgnoreFiles } from "../../../../src/util/fs"
import { LogEntry } from "../../../../src/logger/log-entry"
import { findByName } from "../../../../src/util/util"

class TestVcsHandler extends VcsHandler {
  name = "test"
  private testVersions: TreeVersions = {}

  async getRepoRoot() {
    return "/foo"
  }

  async getFiles() {
    return []
  }

  async getOriginName() {
    return undefined
  }

  async getTreeVersion(log: LogEntry, projectName: string, moduleConfig: ModuleConfig) {
    return this.testVersions[moduleConfig.path] || super.getTreeVersion(log, projectName, moduleConfig)
  }

  setTestVersion(path: string, version: TreeVersion) {
    this.testVersions[path] = version
  }

  async ensureRemoteSource(): Promise<string> {
    return ""
  }

  async updateRemoteSource() {
    return
  }
}

describe("VcsHandler", () => {
  let handlerA: TestVcsHandler
  let gardenA: TestGarden

  // note: module-a has a version file with this content
  const versionA = {
    contentHash: "1234567890",
    files: [],
  }

  beforeEach(async () => {
    handlerA = new TestVcsHandler(projectRootA, defaultDotIgnoreFiles)
    gardenA = await makeTestGardenA()
  })

  describe("getTreeVersion", () => {
    it("should sort the list of files in the returned version", async () => {
      const getFiles = td.replace(handlerA, "getFiles")
      const moduleConfig = await gardenA.resolveModule("module-a")
      td.when(
        getFiles({
          log: gardenA.log,
          path: moduleConfig.path,
          include: undefined,
          exclude: undefined,
          pathDescription: "module root",
        })
      ).thenResolve([
        { path: "c", hash: "c" },
        { path: "b", hash: "b" },
        { path: "d", hash: "d" },
      ])
      const version = await handlerA.getTreeVersion(gardenA.log, gardenA.projectName, moduleConfig)
      expect(version.files).to.eql(["b", "c", "d"])
    })

    it("should not include the module config file in the file list", async () => {
      const getFiles = td.replace(handlerA, "getFiles")
      const moduleConfig = await gardenA.resolveModule("module-a")
      td.when(
        getFiles({
          log: gardenA.log,
          path: moduleConfig.path,
          include: undefined,
          exclude: undefined,
          pathDescription: "module root",
        })
      ).thenResolve([
        { path: moduleConfig.configPath, hash: "c" },
        { path: "b", hash: "b" },
        { path: "d", hash: "d" },
      ])
      const version = await handlerA.getTreeVersion(gardenA.log, gardenA.projectName, moduleConfig)
      expect(version.files).to.eql(["b", "d"])
    })

    it("should respect the include field, if specified", async () => {
      const projectRoot = getDataDir("test-projects", "include-exclude")
      const garden = await makeTestGarden(projectRoot)
      const moduleConfig = await garden.resolveModule("module-a")
      const handler = new GitHandler(garden.gardenDirPath, garden.dotIgnoreFiles)

      const version = await handler.getTreeVersion(gardenA.log, gardenA.projectName, moduleConfig)

      expect(version.files).to.eql([
        resolve(moduleConfig.path, "somedir/yes.txt"),
        resolve(moduleConfig.path, "yes.txt"),
      ])
    })

    it("should respect the exclude field, if specified", async () => {
      const projectRoot = getDataDir("test-projects", "include-exclude")
      const garden = await makeTestGarden(projectRoot)
      const moduleConfig = await garden.resolveModule("module-b")
      const handler = new GitHandler(garden.gardenDirPath, garden.dotIgnoreFiles)

      const version = await handler.getTreeVersion(garden.log, garden.projectName, moduleConfig)

      expect(version.files).to.eql([resolve(moduleConfig.path, "yes.txt")])
    })

    it("should respect both include and exclude fields, if specified", async () => {
      const projectRoot = getDataDir("test-projects", "include-exclude")
      const garden = await makeTestGarden(projectRoot)
      const moduleConfig = await garden.resolveModule("module-c")
      const handler = new GitHandler(garden.gardenDirPath, garden.dotIgnoreFiles)

      const version = await handler.getTreeVersion(garden.log, garden.projectName, moduleConfig)

      expect(version.files).to.eql([resolve(moduleConfig.path, "yes.txt")])
    })

    it("should not be affected by changes to the module's garden.yml that don't affect the module config", async () => {
      const projectRoot = getDataDir("test-projects", "multiple-module-config")
      const garden = await makeTestGarden(projectRoot)
      const moduleConfigA1 = await garden.resolveModule("module-a1")
      const configPath = moduleConfigA1.configPath!
      const orgConfig = await readFile(configPath)

      try {
        const version1 = await garden.vcs.getTreeVersion(garden.log, garden.projectName, moduleConfigA1)
        await writeFile(configPath, orgConfig + "\n---")
        const version2 = await garden.vcs.getTreeVersion(garden.log, garden.projectName, moduleConfigA1)
        expect(version1).to.eql(version2)
      } finally {
        await writeFile(configPath, orgConfig)
      }
    })
  })

  describe("resolveTreeVersion", () => {
    it("should return the version from a version file if it exists", async () => {
      const moduleConfig = await gardenA.resolveModule("module-a")
      const result = await handlerA.resolveTreeVersion(gardenA.log, gardenA.projectName, moduleConfig)

      expect(result).to.eql({
        contentHash: "1234567890",
        files: [],
      })
    })

    it("should call getTreeVersion if there is no version file", async () => {
      const moduleConfig = await gardenA.resolveModule("module-b")

      const version = {
        contentHash: "qwerty",
        files: [],
      }
      handlerA.setTestVersion(moduleConfig.path, version)

      const result = await handlerA.resolveTreeVersion(gardenA.log, gardenA.projectName, moduleConfig)
      expect(result).to.eql(version)
    })
  })

  describe("getVersionString", () => {
    it("should return a different version for a module when a variable used by it changes", async () => {
      const templateGarden = await makeTestGarden(getDataDir("test-project-variable-versioning"))
      const before = await templateGarden.resolveModule("module-a")

      templateGarden.variables["echo-string"] = "something-else"

      const after = await templateGarden.resolveModule("module-a")

      expect(getVersionString(before, [])).to.not.eql(getVersionString(after, []))
    })

    it("should return the same version for a module when a variable not used by it changes", async () => {
      const templateGarden = await makeTestGarden(getDataDir("test-project-variable-versioning"))
      const before = await templateGarden.resolveModule("module-a")

      templateGarden.variables["bla"] = "ble"

      const after = await templateGarden.resolveModule("module-a")

      expect(getVersionString(before, [])).to.eql(getVersionString(after, []))
    })
  })

  context("internal helpers", () => {
    const namedVersionA = {
      name: "module-a",
      contentHash: "qwerty",
      files: [],
    }

    const namedVersionB = {
      name: "module-b",
      contentHash: "qwerty",
      files: [],
    }

    const namedVersionC = {
      name: "module-c",
      contentHash: "qwerty",
      files: [],
    }

    const namedVersions = [namedVersionA, namedVersionB, namedVersionC]

    describe("hashVersions", () => {
      it("is stable with respect to key order in moduleConfig", async () => {
        const originalConfig = await gardenA.resolveModule("module-a")
        const stirredConfig = cloneDeep(originalConfig)
        delete stirredConfig.name
        stirredConfig.name = originalConfig.name

        expect(getVersionString(originalConfig, namedVersions)).to.eql(getVersionString(stirredConfig, namedVersions))
      })

      it("is stable with respect to named version order", async () => {
        const config = await gardenA.resolveModule("module-a")

        expect(getVersionString(config, [namedVersionA, namedVersionB, namedVersionC])).to.eql(
          getVersionString(config, [namedVersionB, namedVersionA, namedVersionC])
        )
      })

      it("should be stable between runtimes", async () => {
        const projectRoot = getDataDir("test-projects", "fixed-version-hashes-1")

        // fixed-version-hashes-1 expects this var to be set
        process.env.MODULE_A_TEST_ENV_VAR = "foo"

        const garden = await makeTestGarden(projectRoot)
        const module = await garden.resolveModule("module-a")

        const fixedVersionString = "v-4b68c1fda7"
        expect(module.version.versionString).to.eql(fixedVersionString)

        delete process.env.TEST_ENV_VAR
      })
    })
  })

  describe("resolveVersion", () => {
    it("should return module version if there are no dependencies", async () => {
      const module = await gardenA.resolveModule("module-a")
      const result = await handlerA.resolveVersion(gardenA.log, gardenA.projectName, module, [])

      expect(result).to.eql({
        versionString: getVersionString(module, [{ ...versionA, name: "module-a" }]),
        dependencyVersions: {},
        files: [],
      })
    })

    it("should hash together the version of the module and all dependencies", async () => {
      const moduleConfigs = await gardenA["resolveModules"]({
        log: gardenA.log,
      })

      const moduleA = findByName(moduleConfigs, "module-a")!
      const moduleB = findByName(moduleConfigs, "module-b")!
      const moduleC = findByName(moduleConfigs, "module-c")!

      const versionStringB = "qwerty"
      const versionB = {
        contentHash: versionStringB,
        files: [],
      }
      handlerA.setTestVersion(moduleB.path, versionB)

      const versionStringC = "asdfgh"
      const versionC = {
        contentHash: versionStringC,
        files: [],
      }
      handlerA.setTestVersion(moduleC.path, versionC)

      expect(await handlerA.resolveVersion(gardenA.log, gardenA.projectName, moduleC, [moduleA, moduleB])).to.eql({
        versionString: getVersionString(moduleC, [
          { ...versionA, name: "module-a" },
          { ...versionB, name: "module-b" },
          { ...versionC, name: "module-c" },
        ]),
        dependencyVersions: {
          "module-a": versionA,
          "module-b": versionB,
        },
        files: [],
      })
    })

    it("should not include module's garden.yml in version file list", async () => {
      const moduleConfig = await gardenA.resolveModule("module-a")
      const version = await handlerA.resolveVersion(gardenA.log, gardenA.projectName, moduleConfig, [])
      expect(version.files).to.not.include(moduleConfig.configPath!)
    })

    it("should be affected by changes to the module's config", async () => {
      const moduleConfig = await gardenA.resolveModule("module-a")
      const version1 = await handlerA.resolveVersion(gardenA.log, gardenA.projectName, moduleConfig, [])
      moduleConfig.name = "foo"
      const version2 = await handlerA.resolveVersion(gardenA.log, gardenA.projectName, moduleConfig, [])
      expect(version1).to.not.eql(version2)
    })

    it("should not be affected by changes to the module's garden.yml that don't affect the module config", async () => {
      const projectRoot = getDataDir("test-projects", "multiple-module-config")
      const garden = await makeTestGarden(projectRoot)
      const moduleConfigA1 = await garden.resolveModule("module-a1")
      const configPath = moduleConfigA1.configPath!
      const orgConfig = await readFile(configPath)

      try {
        const version1 = await garden.vcs.resolveVersion(garden.log, garden.projectName, moduleConfigA1, [])
        await writeFile(configPath, orgConfig + "\n---")
        const version2 = await garden.vcs.resolveVersion(garden.log, garden.projectName, moduleConfigA1, [])
        expect(version1).to.eql(version2)
      } finally {
        await writeFile(configPath, orgConfig)
      }
    })
  })
})

describe("writeTreeVersionFile", () => {
  let tmpDir: tmp.DirectoryResult
  let tmpPath: string

  beforeEach(async () => {
    tmpDir = await tmp.dir({ unsafeCleanup: true })
    tmpPath = await realpath(tmpDir.path)
  })

  afterEach(async () => {
    await tmpDir.cleanup()
  })

  describe("writeVersionFile", () => {
    it("should write relative paths for files", async () => {
      await writeTreeVersionFile(tmpPath, {
        contentHash: "foo",
        files: [join(tmpPath, "some", "file")],
      })
      expect(await readTreeVersionFile(join(tmpPath, GARDEN_VERSIONFILE_NAME))).to.eql({
        contentHash: "foo",
        files: ["some/file"],
      })
    })

    it("should handle relative paths in input", async () => {
      await writeTreeVersionFile(tmpPath, {
        contentHash: "foo",
        files: ["some/file"],
      })
      expect(await readTreeVersionFile(join(tmpPath, GARDEN_VERSIONFILE_NAME))).to.eql({
        contentHash: "foo",
        files: ["some/file"],
      })
    })

    it("should normalize Windows-style paths to POSIX-style", async () => {
      await writeTreeVersionFile(tmpPath, {
        contentHash: "foo",
        files: [`some\\file`],
      })
      expect(await readTreeVersionFile(join(tmpPath, GARDEN_VERSIONFILE_NAME))).to.eql({
        contentHash: "foo",
        files: ["some/file"],
      })
    })
  })
})
