import { expect } from "chai"
import { resolveTemplateString, resolveTemplateStrings } from "../../src/template-string"
import { ConfigContext } from "../../src/config/config-context"

/* tslint:disable:no-invalid-template-strings */

class TestContext extends ConfigContext {
  constructor(context) {
    super()
    Object.assign(this, context)
  }
}

describe("resolveTemplateString", async () => {
  it("should return a non-templated string unchanged", async () => {
    const res = await resolveTemplateString("somestring", new TestContext({}))
    expect(res).to.equal("somestring")
  })

  it("should interpolate a simple format string", async () => {
    const res = await resolveTemplateString("${some}", new TestContext({ some: "value" }))
    expect(res).to.equal("value")
  })

  it("should interpolate a format string with a prefix", async () => {
    const res = await resolveTemplateString("prefix-${some}", new TestContext({ some: "value" }))
    expect(res).to.equal("prefix-value")
  })

  it("should interpolate a format string with a suffix", async () => {
    const res = await resolveTemplateString("${some}-suffix", new TestContext({ some: "value" }))
    expect(res).to.equal("value-suffix")
  })

  it("should handle a nested key", async () => {
    const res = await resolveTemplateString("${some.nested}", new TestContext({ some: { nested: "value" } }))
    expect(res).to.equal("value")
  })

  // it("should resolve a key via a resolver function", async () => {
  //   const resolver = (parts) => {
  //     expect(parts).to.eql(["nested", "key"])
  //     return "value"
  //   }
  //   const res = await resolveTemplateString("${some.nested.key}", new TestContext({ some: resolver }))
  //   expect(res).to.equal("value")
  // })

  // it("should resolve a key via a resolver function that returns a promise", async () => {
  //   const resolver = async (parts) => {
  //     expect(parts).to.eql(["nested", "key"])
  //     return "value"
  //   }
  //   const res = await resolveTemplateString("${some.nested.key}", { some: resolver }))
  //   expect(res).to.equal("value")
  // })

  // it("should resolve a key via a resolver function in a nested key", async () => {
  //   const resolver = (parts) => {
  //     expect(parts).to.eql(["key"])
  //     return "value"
  //   }
  //   const res = await resolveTemplateString("${some.nested.key}", { some: { nested: resolver } }))
  //   expect(res).to.equal("value")
  // })

  it("should handle multiple format strings", async () => {
    const res = await resolveTemplateString("prefix-${a}-${b}-suffix", new TestContext({ a: "value", b: "other" }))
    expect(res).to.equal("prefix-value-other-suffix")
  })

  it("should handle consecutive format strings", async () => {
    const res = await resolveTemplateString("${a}${b}", new TestContext({ a: "value", b: "other" }))
    expect(res).to.equal("valueother")
  })

  it("should interpolate a simple format string that resolves to a number", async () => {
    const res = await resolveTemplateString("${some}", new TestContext({ some: 123 }))
    expect(res).to.equal("123")
  })

  it("should interpolate a simple format string that resolves to a boolean", async () => {
    const res = await resolveTemplateString("${some}", new TestContext({ some: false }))
    expect(res).to.equal("false")
  })

  it("should throw when a key is not found", async () => {
    try {
      await resolveTemplateString("${some}", new TestContext({}))
    } catch (err) {
      expect(err.message).to.equal("Could not find key: some")
      return
    }

    throw new Error("Expected error")
  })

  it("should throw when a nested key is not found", async () => {
    try {
      await resolveTemplateString("${some.other}", new TestContext({ some: {} }))
    } catch (err) {
      expect(err.message).to.equal("Could not find key: some.other")
      return
    }

    throw new Error("Expected error")
  })

  it("should throw when a found key is not a primitive", async () => {
    try {
      await resolveTemplateString("${some}", new TestContext({ some: {} }))
    } catch (err) {
      expect(err.message).to.equal("Config value at some exists but is not a primitive (string, number or boolean)")
      return
    }

    throw new Error("Expected error")
  })

  it("should throw with an incomplete template string", async () => {
    try {
      await resolveTemplateString("${some", new TestContext({ some: {} }))
    } catch (err) {
      expect(err.message).to.equal("Invalid template string: ...${some")
      return
    }

    throw new Error("Expected error")
  })

  it("should handle nested format strings", async () => {
    const res = await resolveTemplateString("${resol${part}ed}", new TestContext({ resolved: 123, part: "v" }))
    expect(res).to.equal("123")
  })

  it("should handle nested format strings with nested keys", async () => {
    const res = await resolveTemplateString(
      "${resol${part}ed.nested}", new TestContext({ resolved: { nested: 123 }, part: "v" }),
    )
    expect(res).to.equal("123")
  })

  it("should handle nested format strings with format string at end", async () => {
    const res = await resolveTemplateString("${resolv${part}}", new TestContext({ resolved: 123, part: "ed" }))
    expect(res).to.equal("123")
  })

  it("should handle deeply nested format strings", async () => {
    const res = await resolveTemplateString(
      "${resol${pa${deep}t}ed}", new TestContext({ resolved: 123, deep: "r", part: "v" }),
    )
    expect(res).to.equal("123")
  })
})

describe("resolveTemplateStrings", () => {
  it("should resolve all template strings in an object with the given context", async () => {
    const obj = {
      some: "${key}",
      other: {
        nested: "${something}",
        noTemplate: "at-all",
      },
    }
    const templateContext = new TestContext({
      key: "value",
      something: "else",
    })

    const result = await resolveTemplateStrings(obj, templateContext)

    expect(result).to.eql({
      some: "value",
      other: {
        nested: "else",
        noTemplate: "at-all",
      },
    })
  })
})
