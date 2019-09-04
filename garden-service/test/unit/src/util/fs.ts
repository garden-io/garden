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
} from "../../../../src/util/fs"
import { withDir } from "tmp-promise"

const projectYamlFileExtensions = getDataDir("test-project-yaml-file-extensions")
const projectDuplicateYamlFileExtensions = getDataDir("test-project-duplicate-yaml-file-extensions")

describe("util", () => {
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
