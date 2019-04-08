import { expect } from "chai"
import { join } from "path"
import { getDataDir } from "../../../helpers"
import { scanDirectory, toCygwinPath, getChildDirNames } from "../../../../src/util/fs"

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

      for await (const item of scanDirectory(testPath, { filter: filterFunc })) {
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
})
