import { expect } from "chai"
import {
  pickKeys,
  getEnvVarName,
  deepOmitUndefined,
  deepFilter,
  splitLast,
} from "../../../../src/util/util"
import { expectError } from "../../../helpers"
import { splitFirst } from "../../../../src/util/util"

describe("util", () => {
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

  describe("splitFirst", () => {
    it("should split string on first occurrence of given delimiter", () => {
      expect(splitFirst("foo:bar:boo", ":")).to.eql(["foo", "bar:boo"])
    })

    it("should return the whole string as first element when no delimiter is found in string", () => {
      expect(splitFirst("foo", ":")).to.eql(["foo", ""])
    })
  })

  describe("splitLast", () => {
    it("should split string on last occurrence of given delimiter", () => {
      expect(splitLast("foo:bar:boo", ":")).to.eql(["foo:bar", "boo"])
    })

    it("should return the whole string as last element when no delimiter is found in string", () => {
      expect(splitLast("foo", ":")).to.eql(["", "foo"])
    })
  })
})
