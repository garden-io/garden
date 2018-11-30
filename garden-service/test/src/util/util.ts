import { expect } from "chai"
import { join } from "path"
import { getDataDir } from "../../helpers"
import {
  scanDirectory,
  getChildDirNames,
  toCygwinPath,
  pickKeys,
  getEnvVarName,
  deepOmitUndefined,
  deepFilter,
} from "../../../src/util/util"
import { expectError } from "../../helpers"

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

  describe("getEnvVarName", () => {
    it("should translate the service name to a name appropriate for env variables", async () => {
      expect(getEnvVarName("service-b")).to.equal("SERVICE_B")
    })
  })

  describe("pickKeys", () => {
    it("should pick keys from an object", () => {
      const obj = { a: 1, b: 2, c: 3 }
      expect(pickKeys(obj, ["a", "b"])).to.eql({ a: 1, b: 2 })
    })

    it("should throw if one or more keys are missing", async () => {
      const obj = { a: 1, b: 2, c: 3 }
      await expectError(() => pickKeys(obj, <any>["a", "foo", "bar"]), (err) => {
        expect(err.message).to.equal("Could not find key(s): foo, bar")
        expect(err.detail.missing).to.eql(["foo", "bar"])
        expect(err.detail.available).to.eql(["a", "b", "c"])
      })
    })

    it("should use given description in error message", async () => {
      const obj = { a: 1, b: 2, c: 3 }
      await expectError(() => pickKeys(obj, <any>["a", "foo", "bar"], "banana"), (err) => {
        expect(err.message).to.equal("Could not find banana(s): foo, bar")
      })
    })
  })

  describe("deepFilter", () => {
    const fn = v => v !== 99

    it("should filter keys in a simple object", () => {
      const obj = {
        a: 1,
        b: 2,
        c: 99,
      }
      expect(deepFilter(obj, fn)).to.eql({ a: 1, b: 2 })
    })

    it("should filter keys in a nested object", () => {
      const obj = {
        a: 1,
        b: 2,
        c: { d: 3, e: 99 },
      }
      expect(deepFilter(obj, fn)).to.eql({ a: 1, b: 2, c: { d: 3 } })
    })

    it("should filter values in lists", () => {
      const obj = {
        a: 1,
        b: 2,
        c: [3, 99],
      }
      expect(deepFilter(obj, fn)).to.eql({ a: 1, b: 2, c: [3] })
    })

    it("should filter keys in objects in lists", () => {
      const obj = {
        a: 1,
        b: 2,
        c: [
          { d: 3, e: 99 },
        ],
      }
      expect(deepFilter(obj, fn)).to.eql({ a: 1, b: 2, c: [{ d: 3 }] })
    })
  })

  describe("deepOmitUndefined", () => {
    it("should omit keys with undefined values in a simple object", () => {
      const obj = {
        a: 1,
        b: 2,
        c: undefined,
      }
      expect(deepOmitUndefined(obj)).to.eql({ a: 1, b: 2 })
    })

    it("should omit keys with undefined values in a nested object", () => {
      const obj = {
        a: 1,
        b: 2,
        c: { d: 3, e: undefined },
      }
      expect(deepOmitUndefined(obj)).to.eql({ a: 1, b: 2, c: { d: 3 } })
    })

    it("should omit undefined values in lists", () => {
      const obj = {
        a: 1,
        b: 2,
        c: [3, undefined],
      }
      expect(deepOmitUndefined(obj)).to.eql({ a: 1, b: 2, c: [3] })
    })

    it("should omit undefined values in objects in lists", () => {
      const obj = {
        a: 1,
        b: 2,
        c: [
          { d: 3, e: undefined },
        ],
      }
      expect(deepOmitUndefined(obj)).to.eql({ a: 1, b: 2, c: [{ d: 3 }] })
    })
  })
})
