import { expect } from "chai"
import { join, basename } from "path"
import { getDataDir, expectError, makeTestGardenA } from "../../../helpers"
import {
  scanDirectory,
  toCygwinPath,
  getChildDirNames,
  isConfigFilename,
  getConfigFilePath,
  getWorkingCopyId,
  findConfigPathsInPath,
  detectModuleOverlap,
} from "../../../../src/util/fs"
import { withDir } from "tmp-promise"
import { ModuleConfig } from "../../../../src/config/module"

const projectYamlFileExtensions = getDataDir("test-project-yaml-file-extensions")
const projectDuplicateYamlFileExtensions = getDataDir("test-project-duplicate-yaml-file-extensions")

describe("util", () => {
  describe("detectModuleOverlap", () => {
    it("should detect if modules have the same root", () => {
      const moduleA = {
        name: "module-a",
        path: join("/", "user", "code", "foo"),
      } as ModuleConfig
      const moduleB = {
        name: "module-b",
        path: join("/", "user", "code", "foo"),
      } as ModuleConfig
      const moduleC = {
        name: "module-c",
        path: join("/", "user", "code", "foo"),
      } as ModuleConfig
      const moduleD = {
        name: "module-d",
        path: join("/", "user", "code", "bas"),
      } as ModuleConfig
      expect(detectModuleOverlap([moduleA, moduleB, moduleC, moduleD])).to.eql([
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
        path: join("/", "user", "code", "foo"),
      } as ModuleConfig
      const moduleB = {
        name: "module-b",
        path: join("/", "user", "code", "foo", "bar"),
      } as ModuleConfig
      const moduleC = {
        name: "module-c",
        path: join("/", "user", "code", "foo", "bar", "bas"),
      } as ModuleConfig
      const moduleD = {
        name: "module-d",
        path: join("/", "user", "code", "bas", "bar", "bas"),
      } as ModuleConfig
      expect(detectModuleOverlap([moduleA, moduleB, moduleC, moduleD])).to.eql([
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
          path: join("/", "user", "code", "foo"),
          include: [""],
        } as ModuleConfig
        const moduleB = {
          name: "module-b",
          path: join("/", "user", "code", "foo"),
        } as ModuleConfig
        expect(detectModuleOverlap([moduleA, moduleB])).to.eql([
          {
            module: moduleB,
            overlaps: [moduleA],
          },
        ])
      })
      it("should ignore modules that set excludes", () => {
        const moduleA = {
          name: "module-a",
          path: join("/", "user", "code", "foo"),
          exclude: [""],
        } as ModuleConfig
        const moduleB = {
          name: "module-b",
          path: join("/", "user", "code", "foo"),
        } as ModuleConfig
        expect(detectModuleOverlap([moduleA, moduleB])).to.eql([
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
          path: join("/", "user", "code", "foo"),
          include: [""],
        } as ModuleConfig
        const moduleB = {
          name: "module-b",
          path: join("/", "user", "code", "foo", "bar"),
        } as ModuleConfig
        expect(detectModuleOverlap([moduleA, moduleB])).to.be.empty
      })
      it("should ignore modules that set excludes", () => {
        const moduleA = {
          name: "module-a",
          path: join("/", "user", "code", "foo"),
          exclude: [""],
        } as ModuleConfig
        const moduleB = {
          name: "module-b",
          path: join("/", "user", "code", "foo", "bar"),
        } as ModuleConfig
        expect(detectModuleOverlap([moduleA, moduleB])).to.be.empty
      })
      it("should detect overlaps if only nested module has includes/excludes", () => {
        const moduleA1 = {
          name: "module-a",
          path: join("/", "user", "code", "foo"),
        } as ModuleConfig
        const moduleB1 = {
          name: "module-b",
          path: join("/", "user", "code", "foo", "bar"),
          include: [""],
        } as ModuleConfig
        const moduleA2 = {
          name: "module-a",
          path: join("/", "user", "code", "foo"),
        } as ModuleConfig
        const moduleB2 = {
          name: "module-b",
          path: join("/", "user", "code", "foo", "bar"),
          exclude: [""],
        } as ModuleConfig
        expect(detectModuleOverlap([moduleA1, moduleB1])).to.eql([
          {
            module: moduleA1,
            overlaps: [moduleB1],
          },
        ])
        expect(detectModuleOverlap([moduleA2, moduleB2])).to.eql([
          {
            module: moduleA2,
            overlaps: [moduleB2],
          },
        ])
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

  describe("getConfigFilePath", () => {
    context("name of the file is garden.yml", () => {
      it("should return the full path to the config file", async () => {
        const testPath = join(projectYamlFileExtensions, "module-yml")
        expect(await getConfigFilePath(testPath)).to.eql(join(testPath, "garden.yml"))
      })
    })
    context("name of the file is garden.yaml", () => {
      it("should return the full path to the config file", async () => {
        const testPath = join(projectYamlFileExtensions, "module-yml")
        expect(await getConfigFilePath(testPath)).to.eql(join(testPath, "garden.yml"))
      })
    })
    it("should throw if multiple valid config files found at the given path", async () => {
      await expectError(() => getConfigFilePath(projectDuplicateYamlFileExtensions), "validation")
    })
    it("should return a valid default path if no config file found at the given path", async () => {
      const testPath = join(projectYamlFileExtensions, "module-no-config")
      const result = await getConfigFilePath(testPath)
      expect(isConfigFilename(basename(result))).to.be.true
    })
  })

  describe("isConfigFilename", () => {
    it("should return true if the name of the file is garden.yaml", async () => {
      expect(await isConfigFilename("garden.yaml")).to.be.true
    })
    it("should return true if the name of the file is garden.yml", async () => {
      expect(await isConfigFilename("garden.yml")).to.be.true
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
    it("should find all garden configs in a directory", async () => {
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
})
