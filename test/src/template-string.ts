import { expect } from "chai"
import { parseTemplateString } from "../../src/template-string"

/* tslint:disable:no-invalid-template-strings */

describe("parseTemplateString", async () => {
  it("should return a non-templated string unchanged", async () => {
    const res = await parseTemplateString("somestring", {})
    expect(res).to.equal("somestring")
  })

  it("should interpolate a simple format string", async () => {
    const res = await parseTemplateString("${some}", { some: "value" })
    expect(res).to.equal("value")
  })

  it("should interpolate a format string with a prefix", async () => {
    const res = await parseTemplateString("prefix-${some}", { some: "value" })
    expect(res).to.equal("prefix-value")
  })

  it("should interpolate a format string with a suffix", async () => {
    const res = await parseTemplateString("${some}-suffix", { some: "value" })
    expect(res).to.equal("value-suffix")
  })

  it("should handle a nested key", async () => {
    const res = await parseTemplateString("${some.nested}", { some: { nested: "value" }})
    expect(res).to.equal("value")
  })

  it("should resolve a key via a resolver function", async () => {
    const resolver = (parts) => {
      expect(parts).to.eql(["nested", "key"])
      return "value"
    }
    const res = await parseTemplateString("${some.nested.key}", { some: resolver })
    expect(res).to.equal("value")
  })

  it("should resolve a key via a resolver function that returns a promise", async () => {
    const resolver = async (parts) => {
      expect(parts).to.eql(["nested", "key"])
      return "value"
    }
    const res = await parseTemplateString("${some.nested.key}", { some: resolver })
    expect(res).to.equal("value")
  })

  it("should resolve a key via a resolver function in a nested key", async () => {
    const resolver = (parts) => {
      expect(parts).to.eql(["key"])
      return "value"
    }
    const res = await parseTemplateString("${some.nested.key}", { some: { nested: resolver } })
    expect(res).to.equal("value")
  })

  it("should handle multiple format strings", async () => {
    const res = await parseTemplateString("prefix-${a}-${b}-suffix", { a: "value", b: "other" })
    expect(res).to.equal("prefix-value-other-suffix")
  })

  it("should handle consecutive format strings", async () => {
    const res = await parseTemplateString("${a}${b}", { a: "value", b: "other" })
    expect(res).to.equal("valueother")
  })

  it("should interpolate a simple format string that resolves to a number", async () => {
    const res = await parseTemplateString("${some}", { some: 123 })
    expect(res).to.equal("123")
  })

  it("should interpolate a simple format string that resolves to a boolean", async () => {
    const res = await parseTemplateString("${some}", { some: false })
    expect(res).to.equal("false")
  })

  it("should throw when a key is not found", async () => {
    try {
      await parseTemplateString("${some}", {})
    } catch (err) {
      expect(err.message).to.equal("Could not find key: some")
      return
    }

    throw new Error("Expected error")
  })

  it("should throw when a nested key is not found", async () => {
    try {
      await parseTemplateString("${some.other}", { some: {} })
    } catch (err) {
      expect(err.message).to.equal("Could not find key: some.other")
      return
    }

    throw new Error("Expected error")
  })

  it("should throw when a found key is not a primitive", async () => {
    try {
      await parseTemplateString("${some}", { some: {} })
    } catch (err) {
      expect(err.message).to.equal("Value at some exists but is not a primitive (string, number or boolean)")
      return
    }

    throw new Error("Expected error")
  })
})
