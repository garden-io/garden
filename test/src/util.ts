import { expect } from "chai"
import { join } from "path"
import { scanDirectory } from "../../src/util"

describe("util", () => {
  describe("scanDirectory", () => {
    it("should iterate through all files in a directory", async () => {
      const testPath = join(__dirname, "..", "data", "scanDirectory")
      let count = 0

      const expectedPaths = ["1", "2", "3", "subdir", "subdir/4"].map((f) => join(testPath, f))

      for await (const item of scanDirectory(testPath)) {
        expect(expectedPaths).to.include(item.path)
        count++
      }

      expect(count).to.eq(5)
    })

    it("should filter files based on filter function", async () => {
      const testPath = join(__dirname, "..", "data", "scanDirectory")
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

})
