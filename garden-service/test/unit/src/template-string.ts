import { expect } from "chai"
import { resolveTemplateString, resolveTemplateStrings } from "../../../src/template-string"
import { ConfigContext } from "../../../src/config/config-context"
import { expectError } from "../../helpers"

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

  it("should optionally allow undefined values", async () => {
    const res = await resolveTemplateString("${some}", new TestContext({}), { allowUndefined: true })
    expect(res).to.equal("")
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
      expect(err.message).to.equal("Invalid template string: ${some")
      return
    }

    throw new Error("Expected error")
  })

  it("should throw on nested format strings", async () => {
    return expectError(
      () => resolveTemplateString(
        "${resol${part}ed}",
        new TestContext({}),
      ),
      (err) => (expect(err.message).to.equal("Invalid template string: ${resol${part}ed}")),
    )
  })

  it("should handle a single-quoted string", async () => {
    const res = await resolveTemplateString(
      "${'foo'}",
      new TestContext({}),
    )
    expect(res).to.equal("foo")
  })

  it("should handle a double-quoted string", async () => {
    const res = await resolveTemplateString(
      "${\"foo\"}",
      new TestContext({}),
    )
    expect(res).to.equal("foo")
  })

  it("should throw on invalid single-quoted string", async () => {
    return expectError(
      () => resolveTemplateString(
        "${'foo}",
        new TestContext({}),
      ),
      (err) => (expect(err.message).to.equal("Invalid template string: ${'foo}")),
    )
  })

  it("should throw on invalid double-quoted string", async () => {
    return expectError(
      () => resolveTemplateString(
        "${\"foo}",
        new TestContext({}),
      ),
      (err) => (expect(err.message).to.equal("Invalid template string: ${\"foo}")),
    )
  })

  it("should handle a conditional between two identifiers", async () => {
    const res = await resolveTemplateString(
      "${a || b}",
      new TestContext({ a: undefined, b: 123 }),
    )
    expect(res).to.equal("123")
  })

  it("should handle a conditional between two nested identifiers", async () => {
    const res = await resolveTemplateString(
      "${a.b || c.d}",
      new TestContext({
        a: { b: undefined },
        c: { d: "123" },
      }),
    )
    expect(res).to.equal("123")
  })

  it("should handle a conditional between two nested identifiers where the first resolves", async () => {
    const res = await resolveTemplateString(
      "${a.b || c.d}",
      new TestContext({
        a: { b: "123" },
        c: { d: undefined },
      }),
    )
    expect(res).to.equal("123")
  })

  it("should handle a conditional between two identifiers without spaces with first value undefined", async () => {
    const res = await resolveTemplateString(
      "${a||b}",
      new TestContext({ a: undefined, b: 123 }),
    )
    expect(res).to.equal("123")
  })

  it("should handle a conditional between two identifiers with first value undefined and string fallback", async () => {
    const res = await resolveTemplateString(
      "${a || \"foo\"}",
      new TestContext({ a: undefined }),
    )
    expect(res).to.equal("foo")
  })

  it("should handle a conditional with undefined nested value and string fallback", async () => {
    const res = await resolveTemplateString(
      "${a.b || 'foo'}",
      new TestContext({ a: {} }),
    )
    expect(res).to.equal("foo")
  })

  it("should handle a conditional between two identifiers without spaces with first value set", async () => {
    const res = await resolveTemplateString(
      "${a||b}",
      new TestContext({ a: 123, b: undefined }),
    )
    expect(res).to.equal("123")
  })

  it("should throw if neither key in conditional is valid", async () => {
    return expectError(
      () => resolveTemplateString(
        "${a || b}",
        new TestContext({}),
      ),
      "configuration",
    )
  })

  it("should throw on invalid conditional string", async () => {
    return expectError(
      () => resolveTemplateString(
        "${a || 'b}",
        new TestContext({}),
      ),
      (err) => (expect(err.message).to.equal("Invalid template string: ${a || 'b}")),
    )
  })

  it("should handle a conditional between an identifier and a string", async () => {
    const res = await resolveTemplateString(
      "${a || 'b'}",
      new TestContext({ a: undefined }),
    )
    expect(res).to.equal("b")
  })

  it("should handle a conditional between a string and a string", async () => {
    const res = await resolveTemplateString(
      "${'a' || 'b'}",
      new TestContext({ a: undefined }),
    )
    expect(res).to.equal("a")
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
