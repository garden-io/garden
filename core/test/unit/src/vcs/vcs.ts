/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import {
  VcsHandler,
  TreeVersions,
  TreeVersion,
  getModuleVersionString,
  writeTreeVersionFile,
  readTreeVersionFile,
  GetFilesParams,
  VcsFile,
  getModuleTreeCacheKey,
  hashModuleVersion,
  ModuleVersions,
  ModuleVersion,
  NamedModuleVersion,
  NamedTreeVersion,
} from "../../../../src/vcs/vcs"
import { makeTestGardenA, makeTestGarden, getDataDir, TestGarden, defaultModuleConfig } from "../../../helpers"
import { expect } from "chai"
import { cloneDeep } from "lodash"
import { ModuleConfig } from "../../../../src/config/module"
import { GitHandler } from "../../../../src/vcs/git"
import { resolve, join } from "path"
import td from "testdouble"
import tmp from "tmp-promise"
import { realpath, readFile, writeFile } from "fs-extra"
import { DEFAULT_API_VERSION, GARDEN_VERSIONFILE_NAME } from "../../../../src/constants"
import { defaultDotIgnoreFiles, fixedProjectExcludes } from "../../../../src/util/fs"
import { LogEntry } from "../../../../src/logger/log-entry"
import { findByName } from "../../../../src/util/util"

class TestVcsHandler extends VcsHandler {
  name = "test"
  private testTreeVersions: TreeVersions = {}
  private testModuleVersions: ModuleVersions = {}

  async getRepoRoot() {
    return "/foo"
  }

  async getFiles(_: GetFilesParams): Promise<VcsFile[]> {
    return []
  }

  async getPathInfo() {
    return {
      branch: "main",
      commitHash: "acbdefg",
      originUrl: "git@github.com:garden-io/foo.git",
    }
  }

  async getTreeVersion(log: LogEntry, projectName: string, moduleConfig: ModuleConfig) {
    return this.testTreeVersions[moduleConfig.path] || super.getTreeVersion(log, projectName, moduleConfig)
  }

  setTestTreeVersion(path: string, version: TreeVersion) {
    this.testTreeVersions[path] = version
  }

  setTestModuleVersion(path: string, version: TreeVersion) {
    this.testTreeVersions[path] = version
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
  const treeVersionA: TreeVersion = {
    contentHash: "1234567890",
    files: [],
  }

  beforeEach(async () => {
    gardenA = await makeTestGardenA()
    handlerA = new TestVcsHandler(
      gardenA.projectRoot,
      join(gardenA.projectRoot, ".garden"),
      defaultDotIgnoreFiles,
      gardenA.cache
    )
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
      const handler = new GitHandler(garden.projectRoot, garden.gardenDirPath, garden.dotIgnoreFiles, garden.cache)

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
      const handler = new GitHandler(garden.projectRoot, garden.gardenDirPath, garden.dotIgnoreFiles, garden.cache)

      const version = await handler.getTreeVersion(garden.log, garden.projectName, moduleConfig)

      expect(version.files).to.eql([resolve(moduleConfig.path, "yes.txt")])
    })

    it("should respect both include and exclude fields, if specified", async () => {
      const projectRoot = getDataDir("test-projects", "include-exclude")
      const garden = await makeTestGarden(projectRoot)
      const moduleConfig = await garden.resolveModule("module-c")
      const handler = new GitHandler(garden.projectRoot, garden.gardenDirPath, garden.dotIgnoreFiles, garden.cache)

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

    it("should apply project-level excludes if module's path is same as root and no include is set", async () => {
      td.replace(handlerA, "getFiles", async ({ exclude }: GetFilesParams) => {
        expect(exclude).to.eql(fixedProjectExcludes)
        return [{ path: "foo", hash: "abcdef" }]
      })
      const moduleConfig = await gardenA.resolveModule("module-a")
      moduleConfig.path = gardenA.projectRoot
      const result = await handlerA.getTreeVersion(gardenA.log, gardenA.projectName, moduleConfig)
      expect(result.files).to.eql(["foo"])
    })

    it("should not apply project-level excludes if module's path is same as root but include is set", async () => {
      td.replace(handlerA, "getFiles", async ({ exclude }: GetFilesParams) => {
        expect(exclude).to.be.undefined
        return [{ path: "foo", hash: "abcdef" }]
      })
      const moduleConfig = await gardenA.resolveModule("module-a")
      moduleConfig.path = gardenA.projectRoot
      moduleConfig.include = ["foo"]
      const result = await handlerA.getTreeVersion(gardenA.log, gardenA.projectName, moduleConfig)
      expect(result.files).to.eql(["foo"])
    })

    it("should not call getFiles is include: [] is set on the module", async () => {
      td.replace(handlerA, "getFiles", async () => {
        throw new Error("Nope!")
      })
      const moduleConfig = await gardenA.resolveModule("module-a")
      moduleConfig.include = []
      await handlerA.getTreeVersion(gardenA.log, gardenA.projectName, moduleConfig)
    })

    it("should get a cached tree version if available", async () => {
      const moduleConfig = await gardenA.resolveModule("module-a")
      const cacheKey = getModuleTreeCacheKey(moduleConfig)

      const cachedResult = { contentHash: "abcdef", files: ["foo"] }
      handlerA["cache"].set(gardenA.log, cacheKey, cachedResult, ["foo", "bar"])

      const result = await handlerA.getTreeVersion(gardenA.log, gardenA.projectName, moduleConfig)
      expect(result).to.eql(cachedResult)
    })

    it("should cache the resolved version", async () => {
      const moduleConfig = await gardenA.resolveModule("module-a")
      const cacheKey = getModuleTreeCacheKey(moduleConfig)

      const result = await handlerA.getTreeVersion(gardenA.log, gardenA.projectName, moduleConfig)
      const cachedResult = handlerA["cache"].get(gardenA.log, cacheKey)

      expect(result).to.eql(cachedResult)
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
      handlerA.setTestTreeVersion(moduleConfig.path, version)

      const result = await handlerA.resolveTreeVersion(gardenA.log, gardenA.projectName, moduleConfig)
      expect(result).to.eql(version)
    })
  })

  describe("resolveModuleVersion", () => {
    beforeEach(() => {
      gardenA.clearCaches()
    })

    it("should return module version if there are no dependencies", async () => {
      const module = await gardenA.resolveModule("module-a")
      gardenA.vcs = handlerA
      const result = await gardenA.resolveModuleVersion(gardenA.log, module, [])

      expect(result).to.eql({
        versionString: getModuleVersionString(module, { ...treeVersionA, name: "module-a" }, []),
        dependencyVersions: {},
        files: [],
      })
    })

    it("should hash together the version of the module and all dependencies", async () => {
      const moduleConfigs = await gardenA.resolveModules({
        log: gardenA.log,
      })
      gardenA.vcs = handlerA

      const moduleA = findByName(moduleConfigs, "module-a")!
      const moduleB = findByName(moduleConfigs, "module-b")!
      const moduleC = findByName(moduleConfigs, "module-c")!

      gardenA.clearCaches()

      const moduleVersionA: ModuleVersion = {
        versionString: treeVersionA.contentHash,
        files: [],
        dependencyVersions: {},
      }
      moduleA.version = moduleVersionA
      handlerA.setTestTreeVersion(moduleA.path, treeVersionA)

      const versionStringB = "qwerty"
      const moduleVersionB: ModuleVersion = {
        versionString: versionStringB,
        files: [],
        dependencyVersions: { "module-a": moduleVersionA },
      }
      moduleB.version = moduleVersionB
      const treeVersionB: TreeVersion = { contentHash: versionStringB, files: [] }
      handlerA.setTestTreeVersion(moduleB.path, treeVersionB)

      const versionStringC = "asdfgh"
      const treeVersionC: TreeVersion = { contentHash: versionStringC, files: [] }
      handlerA.setTestTreeVersion(moduleC.path, treeVersionC)

      const gardenResolvedModuleVersion = await gardenA.resolveModuleVersion(gardenA.log, moduleC, [moduleA, moduleB])
      const manuallyResolvedModuleVersion = {
        versionString: getModuleVersionString(moduleC, { ...treeVersionC, name: "module-c" }, [
          { ...moduleVersionA, name: "module-a" },
          { ...moduleVersionB, name: "module-b" },
        ]),
        dependencyVersions: {
          "module-a": moduleVersionA,
          "module-b": moduleVersionB,
        },
        files: [],
      }

      expect(gardenResolvedModuleVersion).to.eql(manuallyResolvedModuleVersion)
    })

    it("should not include module's garden.yml in version file list", async () => {
      const moduleConfig = await gardenA.resolveModule("module-a")
      const version = await gardenA.resolveModuleVersion(gardenA.log, moduleConfig, [])
      expect(version.files).to.not.include(moduleConfig.configPath!)
    })

    it("should be affected by changes to the module's config", async () => {
      const moduleConfig = await gardenA.resolveModule("module-a")
      const version1 = await gardenA.resolveModuleVersion(gardenA.log, moduleConfig, [])
      moduleConfig.name = "foo"
      const version2 = await gardenA.resolveModuleVersion(gardenA.log, moduleConfig, [])
      expect(version1).to.not.eql(version2)
    })

    it("should not be affected by changes to the module's garden.yml that don't affect the module config", async () => {
      const projectRoot = getDataDir("test-projects", "multiple-module-config")
      const garden = await makeTestGarden(projectRoot)
      const moduleConfigA1 = await garden.resolveModule("module-a1")
      const configPath = moduleConfigA1.configPath!
      const orgConfig = await readFile(configPath)

      try {
        const version1 = await gardenA.resolveModuleVersion(garden.log, moduleConfigA1, [])
        await writeFile(configPath, orgConfig + "\n---")
        const version2 = await gardenA.resolveModuleVersion(garden.log, moduleConfigA1, [])
        expect(version1).to.eql(version2)
      } finally {
        await writeFile(configPath, orgConfig)
      }
    })
  })
})

describe("getModuleVersionString", () => {
  const namedVersionA: NamedModuleVersion = {
    name: "module-a",
    versionString: "qwerty",
    dependencyVersions: {},
    files: [],
  }
  const treeVersionA: NamedTreeVersion = {
    name: namedVersionA.name,
    contentHash: namedVersionA.versionString,
    files: [],
  }
  const namedVersionB: NamedModuleVersion = {
    name: "module-b",
    versionString: "qwerty",
    dependencyVersions: { "module-a": { ...namedVersionA } },
    files: [],
  }

  const namedVersionC: NamedModuleVersion = {
    name: "module-c",
    versionString: "qwerty",
    dependencyVersions: { "module-b": { ...namedVersionB } },
    files: [],
  }

  const dependencyVersions: NamedModuleVersion[] = [namedVersionB, namedVersionC]
  const dummyTreeVersion = { name: "module-a", contentHash: "00000000000", files: [] }

  it("should return a different version for a module when a variable used by it changes", async () => {
    const templateGarden = await makeTestGarden(getDataDir("test-project-variable-versioning"))
    templateGarden["cacheKey"] = "" // Disable caching of the config graph
    const before = await templateGarden.resolveModule("module-a")

    templateGarden.variables["echo-string"] = "something-else"

    const after = await templateGarden.resolveModule("module-a")

    expect(getModuleVersionString(before, dummyTreeVersion, [])).to.not.eql(
      getModuleVersionString(after, dummyTreeVersion, [])
    )
  })

  it("should return the same version for a module when a variable not used by it changes", async () => {
    const templateGarden = await makeTestGarden(getDataDir("test-project-variable-versioning"))
    templateGarden["cacheKey"] = "" // Disable caching of the config graph
    const before = await templateGarden.resolveModule("module-a")

    templateGarden.variables["bla"] = "ble"

    const after = await templateGarden.resolveModule("module-a")

    expect(getModuleVersionString(before, dummyTreeVersion, [])).to.eql(
      getModuleVersionString(after, dummyTreeVersion, [])
    )
  })

  it("is stable with respect to key order in moduleConfig", async () => {
    const originalConfig = defaultModuleConfig
    const stirredConfig: any = cloneDeep(originalConfig)
    delete stirredConfig.name
    stirredConfig.name = originalConfig.name

    expect(getModuleVersionString(originalConfig, treeVersionA, dependencyVersions)).to.eql(
      getModuleVersionString(stirredConfig, treeVersionA, dependencyVersions)
    )
  })

  it("is stable with respect to dependency version order", async () => {
    const config = defaultModuleConfig

    expect(getModuleVersionString(config, treeVersionA, [namedVersionB, namedVersionC])).to.eql(
      getModuleVersionString(config, treeVersionA, [namedVersionC, namedVersionB])
    )
  })

  it("should be stable between runtimes", async () => {
    const projectRoot = getDataDir("test-projects", "fixed-version-hashes-1")

    // fixed-version-hashes-1 expects this var to be set
    process.env.MODULE_A_TEST_ENV_VAR = "foo"

    const garden = await makeTestGarden(projectRoot, { noCache: true })
    const module = await garden.resolveModule("module-a")

    const fixedVersionString = "v-03ad0bf895"
    expect(module.version.versionString).to.eql(fixedVersionString)

    delete process.env.TEST_ENV_VAR
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

describe("hashModuleVersion", () => {
  function baseConfig() {
    return {
      apiVersion: DEFAULT_API_VERSION,
      type: "test",
      path: "/tmp",
      name: "foo",
      allowPublish: false,
      build: { dependencies: [] },
      disabled: false,
      serviceConfigs: [],
      taskConfigs: [],
      testConfigs: [],
      spec: {},
    }
  }

  context("buildConfig is set", () => {
    it("only uses the buildConfig for the module config hash", () => {
      const config = {
        ...baseConfig(),
        buildConfig: {
          something: "build specific",
        },
      }
      const a = hashModuleVersion(config, { name: "foo", contentHash: "abcdefabced", files: [] }, [])
      const b = hashModuleVersion(
        {
          ...config,
          serviceConfigs: [{ name: "bla", dependencies: [], disabled: false, hotReloadable: false, spec: {} }],
          taskConfigs: [{ name: "bla", dependencies: [], disabled: false, spec: {}, timeout: 123, cacheResult: false }],
          testConfigs: [{ name: "bla", dependencies: [], disabled: false, spec: {}, timeout: 123 }],
          spec: { foo: "bar" },
        },
        { name: "foo", contentHash: "abcdefabced", files: [] },
        []
      )
      expect(a).to.equal(b)
    })

    it("factors in dependency versions", () => {
      const config = {
        ...baseConfig(),
        buildConfig: {
          something: "build specific",
        },
      }
      const a = hashModuleVersion(config, { name: "foo", contentHash: "abcdefabced", files: [] }, [])
      const b = hashModuleVersion(config, { name: "foo", contentHash: "abcdefabced", files: [] }, [
        { name: "dep", versionString: "blabalbalba", files: [], dependencyVersions: {} },
      ])
      expect(a).to.not.equal(b)
    })
  })

  context("buildConfig is not set", () => {
    it("is affected by changes to the spec field", () => {
      const config = {
        ...baseConfig(),
      }
      const a = hashModuleVersion(config, { name: "foo", contentHash: "abcdefabced", files: [] }, [])
      const b = hashModuleVersion(
        {
          ...config,
          spec: { foo: "bar" },
        },
        { name: "foo", contentHash: "abcdefabced", files: [] },
        []
      )
      expect(a).to.not.equal(b)
    })

    it("omits generally-considered runtime fields", () => {
      const config = {
        ...baseConfig(),
      }
      const a = hashModuleVersion(config, { name: "foo", contentHash: "abcdefabced", files: [] }, [])
      const b = hashModuleVersion(
        {
          ...config,
          serviceConfigs: [{ name: "bla", dependencies: [], disabled: false, hotReloadable: false, spec: {} }],
          taskConfigs: [{ name: "bla", dependencies: [], disabled: false, spec: {}, timeout: 123, cacheResult: false }],
          testConfigs: [{ name: "bla", dependencies: [], disabled: false, spec: {}, timeout: 123 }],
        },
        { name: "foo", contentHash: "abcdefabced", files: [] },
        []
      )
      expect(a).to.equal(b)
    })

    it("factors in dependency versions", () => {
      const config = {
        ...baseConfig(),
      }
      const a = hashModuleVersion(config, { name: "foo", contentHash: "abcdefabced", files: [] }, [])
      const b = hashModuleVersion(config, { name: "foo", contentHash: "abcdefabced", files: [] }, [
        { name: "dep", versionString: "blabalbalba", files: [], dependencyVersions: {} },
      ])
      expect(a).to.not.equal(b)
    })
  })
})
