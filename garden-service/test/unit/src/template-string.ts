import { expect } from "chai"
import { resolveTemplateString, resolveTemplateStrings, collectTemplateReferences } from "../../../src/template-string"
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

  it("should resolve a key with a dash in it", async () => {
    const res = await resolveTemplateString("${some-key}", new TestContext({ "some-key": "value" }))
    expect(res).to.equal("value")
  })

  it("should resolve a nested key with a dash in it", async () => {
    const res = await resolveTemplateString("${ctx.some-key}", new TestContext({ ctx: { "some-key": "value" } }))
    expect(res).to.equal("value")
  })

  it("should optionally allow undefined values", async () => {
    const res = await resolveTemplateString("${some}", new TestContext({}), { allowUndefined: true })
    expect(res).to.equal(undefined)
  })

  it("should interpolate a format string with a prefix", async () => {
    const res = await resolveTemplateString("prefix-${some}", new TestContext({ some: "value" }))
    expect(res).to.equal("prefix-value")
  })

  it("should interpolate a format string with a suffix", async () => {
    const res = await resolveTemplateString("${some}-suffix", new TestContext({ some: "value" }))
    expect(res).to.equal("value-suffix")
  })

  it("should interpolate a format string with a prefix with whitespace", async () => {
    const res = await resolveTemplateString("prefix ${some}", new TestContext({ some: "value" }))
    expect(res).to.equal("prefix value")
  })

  it("should interpolate a format string with a suffix with whitespace", async () => {
    const res = await resolveTemplateString("${some} suffix", new TestContext({ some: "value" }))
    expect(res).to.equal("value suffix")
  })

  it("should correctly interpolate a format string with surrounding whitespace", async () => {
    const res = await resolveTemplateString("prefix ${some} suffix", new TestContext({ some: "value" }))
    expect(res).to.equal("prefix value suffix")
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

  it("should throw when a key is not found", async () => {
    try {
      await resolveTemplateString("${some}", new TestContext({}))
    } catch (err) {
      expect(err.message).to.equal("Invalid template string ${some}: Unable to resolve one or more keys.")
      return
    }

    throw new Error("Expected error")
  })

  it("should throw when a nested key is not found", async () => {
    try {
      await resolveTemplateString("${some.other}", new TestContext({ some: {} }))
    } catch (err) {
      expect(err.message).to.equal("Invalid template string ${some.other}: Unable to resolve one or more keys.")
      return
    }

    throw new Error("Expected error")
  })

  it("should throw when a found key is not a primitive", async () => {
    return expectError(
      () => resolveTemplateString("${some}", new TestContext({ some: {} })),
      (err) =>
        expect(err.message).to.equal(
          "Invalid template string ${some}: " +
            "Config value at 'some' exists but is not a primitive (string, number, boolean or null)"
        )
    )
  })

  it("should throw with an incomplete template string", async () => {
    try {
      await resolveTemplateString("${some", new TestContext({ some: {} }))
    } catch (err) {
      expect(err.message).to.equal("Invalid template string ${some: Unable to parse as valid template string.")
      return
    }

    throw new Error("Expected error")
  })

  it("should throw on nested format strings", async () => {
    return expectError(
      () => resolveTemplateString("${resol${part}ed}", new TestContext({})),
      (err) =>
        expect(err.message).to.equal(
          "Invalid template string ${resol${part}ed}: Unable to parse as valid template string."
        )
    )
  })

  it("should handle a single-quoted string", async () => {
    const res = await resolveTemplateString("${'foo'}", new TestContext({}))
    expect(res).to.equal("foo")
  })

  it("should handle a numeric literal and return it directly", async () => {
    const res = await resolveTemplateString("${123}", new TestContext({}))
    expect(res).to.equal(123)
  })

  it("should handle a boolean true literal and return it directly", async () => {
    const res = await resolveTemplateString("${true}", new TestContext({}))
    expect(res).to.equal(true)
  })

  it("should handle a boolean false literal and return it directly", async () => {
    const res = await resolveTemplateString("${false}", new TestContext({}))
    expect(res).to.equal(false)
  })

  it("should handle a null literal and return it directly", async () => {
    const res = await resolveTemplateString("${null}", new TestContext({}))
    expect(res).to.equal(null)
  })

  it("should handle a numeric literal in a logical OR and return it directly", async () => {
    const res = await resolveTemplateString("${a || 123}", new TestContext({}))
    expect(res).to.equal(123)
  })

  it("should handle a boolean true literal in a logical OR and return it directly", async () => {
    const res = await resolveTemplateString("${a || true}", new TestContext({}))
    expect(res).to.equal(true)
  })

  it("should handle a boolean false literal in a logical OR and return it directly", async () => {
    const res = await resolveTemplateString("${a || false}", new TestContext({}))
    expect(res).to.equal(false)
  })

  it("should handle a null literal in a logical OR and return it directly", async () => {
    const res = await resolveTemplateString("${a || null}", new TestContext({}))
    expect(res).to.equal(null)
  })

  it("should handle a double-quoted string", async () => {
    const res = await resolveTemplateString('${"foo"}', new TestContext({}))
    expect(res).to.equal("foo")
  })

  it("should throw on invalid single-quoted string", async () => {
    return expectError(
      () => resolveTemplateString("${'foo}", new TestContext({})),
      (err) =>
        expect(err.message).to.equal("Invalid template string ${'foo}: Unable to parse as valid template string.")
    )
  })

  it("should throw on invalid double-quoted string", async () => {
    return expectError(
      () => resolveTemplateString('${"foo}', new TestContext({})),
      (err) =>
        expect(err.message).to.equal('Invalid template string ${"foo}: Unable to parse as valid template string.')
    )
  })

  it("should handle a logical OR between two identifiers", async () => {
    const res = await resolveTemplateString("${a || b}", new TestContext({ a: undefined, b: "abc" }))
    expect(res).to.equal("abc")
  })

  it("should handle a logical OR between two nested identifiers", async () => {
    const res = await resolveTemplateString(
      "${a.b || c.d}",
      new TestContext({
        a: { b: undefined },
        c: { d: "abc" },
      })
    )
    expect(res).to.equal("abc")
  })

  it("should handle a logical OR between two nested identifiers where the first resolves", async () => {
    const res = await resolveTemplateString(
      "${a.b || c.d}",
      new TestContext({
        a: { b: "abc" },
        c: { d: undefined },
      })
    )
    expect(res).to.equal("abc")
  })

  it("should handle a logical OR between two identifiers without spaces with first value undefined", async () => {
    const res = await resolveTemplateString("${a||b}", new TestContext({ a: undefined, b: "abc" }))
    expect(res).to.equal("abc")
  })

  it("should handle a logical OR between two identifiers with first value undefined and string fallback", async () => {
    const res = await resolveTemplateString('${a || "foo"}', new TestContext({ a: undefined }))
    expect(res).to.equal("foo")
  })

  it("should handle a logical OR with undefined nested value and string fallback", async () => {
    const res = await resolveTemplateString("${a.b || 'foo'}", new TestContext({ a: {} }))
    expect(res).to.equal("foo")
  })

  it("should handle chained logical OR with string fallback", async () => {
    const res = await resolveTemplateString("${a.b || c.d || e.f || 'foo'}", new TestContext({ a: {}, c: {}, e: {} }))
    expect(res).to.equal("foo")
  })

  it("should handle a logical OR between two identifiers without spaces with first value set", async () => {
    const res = await resolveTemplateString("${a||b}", new TestContext({ a: "abc", b: undefined }))
    expect(res).to.equal("abc")
  })

  it("should throw if neither key in logical OR is valid", async () => {
    return expectError(
      () => resolveTemplateString("${a || b}", new TestContext({})),
      (err) => expect(err.message).to.equal("Invalid template string ${a || b}: Unable to resolve one or more keys.")
    )
  })

  it("should throw on invalid logical OR string", async () => {
    return expectError(
      () => resolveTemplateString("${a || 'b}", new TestContext({})),
      (err) =>
        expect(err.message).to.equal("Invalid template string ${a || 'b}: Unable to parse as valid template string.")
    )
  })

  it("should handle a logical OR between a string and a string", async () => {
    const res = await resolveTemplateString("${'a' || 'b'}", new TestContext({ a: undefined }))
    expect(res).to.equal("a")
  })

  it("should handle a logical OR between an empty string and a string", async () => {
    const res = await resolveTemplateString("${a || 'b'}", new TestContext({ a: "" }))
    expect(res).to.equal("b")
  })

  it("should handle a logical AND between booleans", async () => {
    const res = await resolveTemplateString("${true && a}", new TestContext({ a: true }))
    expect(res).to.equal(true)
  })

  it("should handle a logical AND with an empty string as the first clause", async () => {
    const res = await resolveTemplateString("${'' && true}", new TestContext({}))
    expect(res).to.equal("")
  })

  it("should handle a logical AND with an empty string as the second clause", async () => {
    const res = await resolveTemplateString("${true && ''}", new TestContext({}))
    expect(res).to.equal("")
  })

  it("should handle a positive equality comparison between equal resolved values", async () => {
    const res = await resolveTemplateString("${a == b}", new TestContext({ a: "a", b: "a" }))
    expect(res).to.equal(true)
  })

  it("should handle a positive equality comparison between equal string literals", async () => {
    const res = await resolveTemplateString("${'a' == 'a'}", new TestContext({}))
    expect(res).to.equal(true)
  })

  it("should handle a positive equality comparison between equal numeric literals", async () => {
    const res = await resolveTemplateString("${123 == 123}", new TestContext({}))
    expect(res).to.equal(true)
  })

  it("should handle a positive equality comparison between equal boolean literals", async () => {
    const res = await resolveTemplateString("${true == true}", new TestContext({}))
    expect(res).to.equal(true)
  })

  it("should handle a positive equality comparison between different resolved values", async () => {
    const res = await resolveTemplateString("${a == b}", new TestContext({ a: "a", b: "b" }))
    expect(res).to.equal(false)
  })

  it("should handle a positive equality comparison between different string literals", async () => {
    const res = await resolveTemplateString("${'a' == 'b'}", new TestContext({}))
    expect(res).to.equal(false)
  })

  it("should handle a positive equality comparison between different numeric literals", async () => {
    const res = await resolveTemplateString("${123 == 456}", new TestContext({}))
    expect(res).to.equal(false)
  })

  it("should handle a positive equality comparison between different boolean literals", async () => {
    const res = await resolveTemplateString("${true == false}", new TestContext({}))
    expect(res).to.equal(false)
  })

  it("should handle a negative equality comparison between equal resolved values", async () => {
    const res = await resolveTemplateString("${a != b}", new TestContext({ a: "a", b: "a" }))
    expect(res).to.equal(false)
  })

  it("should handle a negative equality comparison between equal string literals", async () => {
    const res = await resolveTemplateString("${'a' != 'a'}", new TestContext({}))
    expect(res).to.equal(false)
  })

  it("should handle a negative equality comparison between equal numeric literals", async () => {
    const res = await resolveTemplateString("${123 != 123}", new TestContext({}))
    expect(res).to.equal(false)
  })

  it("should handle a negative equality comparison between equal boolean literals", async () => {
    const res = await resolveTemplateString("${false != false}", new TestContext({}))
    expect(res).to.equal(false)
  })

  it("should handle a negative equality comparison between different resolved values", async () => {
    const res = await resolveTemplateString("${a != b}", new TestContext({ a: "a", b: "b" }))
    expect(res).to.equal(true)
  })

  it("should handle a negative equality comparison between different string literals", async () => {
    const res = await resolveTemplateString("${'a' != 'b'}", new TestContext({}))
    expect(res).to.equal(true)
  })

  it("should handle a negative equality comparison between different numeric literals", async () => {
    const res = await resolveTemplateString("${123 != 456}", new TestContext({}))
    expect(res).to.equal(true)
  })

  it("should handle a negative equality comparison between different boolean literals", async () => {
    const res = await resolveTemplateString("${true != false}", new TestContext({}))
    expect(res).to.equal(true)
  })

  it("should handle a positive equality comparison between different value types", async () => {
    const res = await resolveTemplateString("${true == 'foo'}", new TestContext({}))
    expect(res).to.equal(false)
  })

  it("should handle a negative equality comparison between different value types", async () => {
    const res = await resolveTemplateString("${123 != false}", new TestContext({}))
    expect(res).to.equal(true)
  })

  it("should handle negations on booleans", async () => {
    const res = await resolveTemplateString("${!true}", new TestContext({}))
    expect(res).to.equal(false)
  })

  it("should handle negations on nulls", async () => {
    const res = await resolveTemplateString("${!null}", new TestContext({}))
    expect(res).to.equal(true)
  })

  it("should handle negations on empty strings", async () => {
    const res = await resolveTemplateString("${!''}", new TestContext({}))
    expect(res).to.equal(true)
  })

  it("should handle negations on resolved keys", async () => {
    const res = await resolveTemplateString("${!a}", new TestContext({ a: false }))
    expect(res).to.equal(true)
  })

  it("should handle the typeof operator for resolved booleans", async () => {
    const res = await resolveTemplateString("${typeof a}", new TestContext({ a: false }))
    expect(res).to.equal("boolean")
  })

  it("should handle the typeof operator for resolved numbers", async () => {
    const res = await resolveTemplateString("${typeof foo}", new TestContext({ foo: 1234 }))
    expect(res).to.equal("number")
  })

  it("should handle the typeof operator for strings", async () => {
    const res = await resolveTemplateString("${typeof 'foo'}", new TestContext({}))
    expect(res).to.equal("string")
  })

  it("should throw when using comparison operators on missing keys", async () => {
    return expectError(
      () => resolveTemplateString("${a >= b}", new TestContext({ a: 123 })),
      (err) => expect(err.message).to.equal("Invalid template string ${a >= b}: Could not resolve one or more keys.")
    )
  })

  it("should correctly evaluate clauses in parentheses", async () => {
    const res = await resolveTemplateString("${(1 + 2) * (3 + 4)}", new TestContext({}))
    expect(res).to.equal(21)
  })

  it("should throw when using >= on non-numeric terms", async () => {
    return expectError(
      () => resolveTemplateString("${a >= b}", new TestContext({ a: 123, b: "foo" })),
      (err) =>
        expect(err.message).to.equal(
          "Invalid template string ${a >= b}: Both terms need to be numbers for >= operator (got number and string)."
        )
    )
  })

  it("should handle a positive ternary expression", async () => {
    const res = await resolveTemplateString("${foo ? true : false}", new TestContext({ foo: true }))
    expect(res).to.equal(true)
  })

  it("should handle a negative ternary expression", async () => {
    const res = await resolveTemplateString("${foo ? true : false}", new TestContext({ foo: false }))
    expect(res).to.equal(false)
  })

  it("should handle a ternary expression with nested expressions", async () => {
    const res = await resolveTemplateString(
      "${foo == 'bar' ? a : b}",
      new TestContext({ foo: "bar", a: true, b: false })
    )
    expect(res).to.equal(true)
  })

  it("should handle an expression in parentheses", async () => {
    const res = await resolveTemplateString("${foo || (a > 5)}", new TestContext({ foo: false, a: 10 }))
    expect(res).to.equal(true)
  })

  context("when the template string is the full input string", () => {
    it("should return a resolved number directly", async () => {
      const res = await resolveTemplateString("${a}", new TestContext({ a: 100 }))
      expect(res).to.equal(100)
    })

    it("should return a resolved boolean true directly", async () => {
      const res = await resolveTemplateString("${a}", new TestContext({ a: true }))
      expect(res).to.equal(true)
    })

    it("should return a resolved boolean false directly", async () => {
      const res = await resolveTemplateString("${a}", new TestContext({ a: false }))
      expect(res).to.equal(false)
    })

    it("should return a resolved null directly", async () => {
      const res = await resolveTemplateString("${a}", new TestContext({ a: null }))
      expect(res).to.equal(null)
    })
  })

  context("when the template string is a part of a string", () => {
    it("should format a resolved number into the string", async () => {
      const res = await resolveTemplateString("foo-${a}", new TestContext({ a: 100 }))
      expect(res).to.equal("foo-100")
    })

    it("should format a resolved boolean true into the string", async () => {
      const res = await resolveTemplateString("foo-${a}", new TestContext({ a: true }))
      expect(res).to.equal("foo-true")
    })

    it("should format a resolved boolean false into the string", async () => {
      const res = await resolveTemplateString("foo-${a}", new TestContext({ a: false }))
      expect(res).to.equal("foo-false")
    })

    it("should format a resolved null into the string", async () => {
      const res = await resolveTemplateString("foo-${a}", new TestContext({ a: null }))
      expect(res).to.equal("foo-null")
    })
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

describe("collectTemplateReferences", () => {
  it("should return and sort all template string references in an object", async () => {
    const obj = {
      foo: "${my.reference}",
      nested: {
        boo: "${moo}",
        foo: "lalalla${moo}${moo}",
        banana: "${banana.rama.llama}",
      },
    }

    expect(await collectTemplateReferences(obj)).to.eql([["banana", "rama", "llama"], ["moo"], ["my", "reference"]])
  })
})
