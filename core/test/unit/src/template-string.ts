/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import {
  resolveTemplateString,
  resolveTemplateStrings,
  collectTemplateReferences,
  throwOnMissingSecretKeys,
} from "../../../src/template-string"
import { ConfigContext } from "../../../src/config/template-contexts/base"
import { expectError } from "../../helpers"
import stripAnsi = require("strip-ansi")
import { dedent } from "../../../src/util/string"

/* tslint:disable:no-invalid-template-strings */

class TestContext extends ConfigContext {
  constructor(context) {
    super()
    Object.assign(this, context)
  }
}

describe("resolveTemplateString", async () => {
  it("should return a non-templated string unchanged", async () => {
    const res = resolveTemplateString("somestring", new TestContext({}))
    expect(res).to.equal("somestring")
  })

  it("should resolve a key with a dash in it", async () => {
    const res = resolveTemplateString("${some-key}", new TestContext({ "some-key": "value" }))
    expect(res).to.equal("value")
  })

  it("should resolve a nested key with a dash in it", async () => {
    const res = resolveTemplateString("${ctx.some-key}", new TestContext({ ctx: { "some-key": "value" } }))
    expect(res).to.equal("value")
  })

  it("should correctly resolve if ? suffix is present but value exists", async () => {
    const res = resolveTemplateString("${foo}?", new TestContext({ foo: "bar" }))
    expect(res).to.equal("bar")
  })

  it("should allow undefined values if ? suffix is present", async () => {
    const res = resolveTemplateString("${foo}?", new TestContext({}))
    expect(res).to.equal(undefined)
  })

  it("should pass optional string through if allowPartial=true", async () => {
    const res = resolveTemplateString("${foo}?", new TestContext({}), { allowPartial: true })
    expect(res).to.equal("${foo}?")
  })

  it("should support a string literal in a template string as a means to escape it", async () => {
    const res = resolveTemplateString("${'$'}{bar}", new TestContext({}))
    expect(res).to.equal("${bar}")
  })

  it("should pass through a template string with a double $$ prefix", async () => {
    const res = resolveTemplateString("$${bar}", new TestContext({}))
    expect(res).to.equal("$${bar}")
  })

  it("should allow unescaping a template string with a double $$ prefix", async () => {
    const res = resolveTemplateString("$${bar}", new TestContext({}), { unescape: true })
    expect(res).to.equal("${bar}")
  })

  it("should allow mixing normal and escaped strings", async () => {
    const res = resolveTemplateString("${foo}-and-$${var.nope}", new TestContext({ foo: "yes" }), { unescape: true })
    expect(res).to.equal("yes-and-${var.nope}")
  })

  it("should interpolate a format string with a prefix", async () => {
    const res = resolveTemplateString("prefix-${some}", new TestContext({ some: "value" }))
    expect(res).to.equal("prefix-value")
  })

  it("should interpolate a format string with a suffix", async () => {
    const res = resolveTemplateString("${some}-suffix", new TestContext({ some: "value" }))
    expect(res).to.equal("value-suffix")
  })

  it("should interpolate a format string with a prefix and a suffix", async () => {
    const res = resolveTemplateString("prefix-${some}-suffix", new TestContext({ some: "value" }))
    expect(res).to.equal("prefix-value-suffix")
  })

  it("should interpolate an optional format string with a prefix and a suffix", async () => {
    const res = resolveTemplateString("prefix-${some}?-suffix", new TestContext({}))
    expect(res).to.equal("prefix--suffix")
  })

  it("should interpolate a format string with a prefix with whitespace", async () => {
    const res = resolveTemplateString("prefix ${some}", new TestContext({ some: "value" }))
    expect(res).to.equal("prefix value")
  })

  it("should interpolate a format string with a suffix with whitespace", async () => {
    const res = resolveTemplateString("${some} suffix", new TestContext({ some: "value" }))
    expect(res).to.equal("value suffix")
  })

  it("should correctly interpolate a format string with surrounding whitespace", async () => {
    const res = resolveTemplateString("prefix ${some} suffix", new TestContext({ some: "value" }))
    expect(res).to.equal("prefix value suffix")
  })

  it("should handle a nested key", async () => {
    const res = resolveTemplateString("${some.nested}", new TestContext({ some: { nested: "value" } }))
    expect(res).to.equal("value")
  })

  it("should handle multiple format strings", async () => {
    const res = resolveTemplateString("prefix-${a}-${b}-suffix", new TestContext({ a: "value", b: "other" }))
    expect(res).to.equal("prefix-value-other-suffix")
  })

  it("should handle consecutive format strings", async () => {
    const res = resolveTemplateString("${a}${b}", new TestContext({ a: "value", b: "other" }))
    expect(res).to.equal("valueother")
  })

  it("should throw when a key is not found", async () => {
    try {
      resolveTemplateString("${some}", new TestContext({}))
    } catch (err) {
      expect(stripAnsi(err.message)).to.equal("Invalid template string (${some}): Could not find key some.")
      return
    }

    throw new Error("Expected error")
  })

  it("should trim long template string in error messages", async () => {
    expectError(
      () =>
        resolveTemplateString(
          "${some} very very very very very long long long long long template string",
          new TestContext({})
        ),
      (err) =>
        expect(stripAnsi(err.message)).to.equal(
          "Invalid template string (${some} very very very very very l…): Could not find key some."
        )
    )
  })

  it("should replace line breaks in template strings in error messages", async () => {
    expectError(
      () => resolveTemplateString("${some}\nmulti\nline\nstring", new TestContext({})),
      (err) =>
        expect(stripAnsi(err.message)).to.equal(
          "Invalid template string (${some}\\nmulti\\nline\\nstring): Could not find key some."
        )
    )
  })

  it("should throw when a nested key is not found", async () => {
    try {
      resolveTemplateString("${some.other}", new TestContext({ some: {} }))
    } catch (err) {
      expect(stripAnsi(err.message)).to.equal(
        "Invalid template string (${some.other}): Could not find key other under some."
      )
      return
    }

    throw new Error("Expected error")
  })

  it("should throw with an incomplete template string", async () => {
    try {
      resolveTemplateString("${some", new TestContext({ some: {} }))
    } catch (err) {
      expect(err.message).to.equal("Invalid template string (${some): Unable to parse as valid template string.")
      return
    }

    throw new Error("Expected error")
  })

  it("should throw on nested format strings", async () => {
    return expectError(
      () => resolveTemplateString("${resol${part}ed}", new TestContext({})),
      (err) =>
        expect(err.message).to.equal(
          "Invalid template string (${resol${part}ed}): Unable to parse as valid template string."
        )
    )
  })

  it("should handle a single-quoted string", async () => {
    const res = resolveTemplateString("${'foo'}", new TestContext({}))
    expect(res).to.equal("foo")
  })

  it("should handle a numeric literal and return it directly", async () => {
    const res = resolveTemplateString("${123}", new TestContext({}))
    expect(res).to.equal(123)
  })

  it("should handle a boolean true literal and return it directly", async () => {
    const res = resolveTemplateString("${true}", new TestContext({}))
    expect(res).to.equal(true)
  })

  it("should handle a boolean false literal and return it directly", async () => {
    const res = resolveTemplateString("${false}", new TestContext({}))
    expect(res).to.equal(false)
  })

  it("should handle a null literal and return it directly", async () => {
    const res = resolveTemplateString("${null}", new TestContext({}))
    expect(res).to.equal(null)
  })

  it("should handle a numeric literal in a logical OR and return it directly", async () => {
    const res = resolveTemplateString("${a || 123}", new TestContext({}))
    expect(res).to.equal(123)
  })

  it("should handle a boolean true literal in a logical OR and return it directly", async () => {
    const res = resolveTemplateString("${a || true}", new TestContext({}))
    expect(res).to.equal(true)
  })

  it("should handle a boolean false literal in a logical OR and return it directly", async () => {
    const res = resolveTemplateString("${a || false}", new TestContext({}))
    expect(res).to.equal(false)
  })

  it("should handle a null literal in a logical OR and return it directly", async () => {
    const res = resolveTemplateString("${a || null}", new TestContext({}))
    expect(res).to.equal(null)
  })

  it("should handle a double-quoted string", async () => {
    const res = resolveTemplateString('${"foo"}', new TestContext({}))
    expect(res).to.equal("foo")
  })

  it("should throw on invalid single-quoted string", async () => {
    return expectError(
      () => resolveTemplateString("${'foo}", new TestContext({})),
      (err) =>
        expect(err.message).to.equal("Invalid template string (${'foo}): Unable to parse as valid template string.")
    )
  })

  it("should throw on invalid double-quoted string", async () => {
    return expectError(
      () => resolveTemplateString('${"foo}', new TestContext({})),
      (err) =>
        expect(err.message).to.equal('Invalid template string (${"foo}): Unable to parse as valid template string.')
    )
  })

  it("should handle a logical OR between two identifiers", async () => {
    const res = resolveTemplateString("${a || b}", new TestContext({ a: undefined, b: "abc" }))
    expect(res).to.equal("abc")
  })

  it("should handle a logical OR between two nested identifiers", async () => {
    const res = resolveTemplateString(
      "${a.b || c.d}",
      new TestContext({
        a: { b: undefined },
        c: { d: "abc" },
      })
    )
    expect(res).to.equal("abc")
  })

  it("should handle a logical OR between two nested identifiers where the first resolves", async () => {
    const res = resolveTemplateString(
      "${a.b || c.d}",
      new TestContext({
        a: { b: "abc" },
        c: { d: undefined },
      })
    )
    expect(res).to.equal("abc")
  })

  it("should handle a logical OR between two identifiers without spaces with first value undefined", async () => {
    const res = resolveTemplateString("${a||b}", new TestContext({ a: undefined, b: "abc" }))
    expect(res).to.equal("abc")
  })

  it("should handle a logical OR between two identifiers with first value undefined and string fallback", async () => {
    const res = resolveTemplateString('${a || "foo"}', new TestContext({ a: undefined }))
    expect(res).to.equal("foo")
  })

  it("should handle a logical OR with undefined nested value and string fallback", async () => {
    const res = resolveTemplateString("${a.b || 'foo'}", new TestContext({ a: {} }))
    expect(res).to.equal("foo")
  })

  it("should handle chained logical OR with string fallback", async () => {
    const res = resolveTemplateString("${a.b || c.d || e.f || 'foo'}", new TestContext({ a: {}, c: {}, e: {} }))
    expect(res).to.equal("foo")
  })

  it("should handle a logical OR between two identifiers without spaces with first value set", async () => {
    const res = resolveTemplateString("${a||b}", new TestContext({ a: "abc", b: undefined }))
    expect(res).to.equal("abc")
  })

  it("should throw if neither key in logical OR is valid", async () => {
    return expectError(
      () => resolveTemplateString("${a || b}", new TestContext({})),
      (err) => expect(stripAnsi(err.message)).to.equal("Invalid template string (${a || b}): Could not find key b.")
    )
  })

  it("should throw on invalid logical OR string", async () => {
    return expectError(
      () => resolveTemplateString("${a || 'b}", new TestContext({})),
      (err) =>
        expect(err.message).to.equal("Invalid template string (${a || 'b}): Unable to parse as valid template string.")
    )
  })

  it("should handle a logical OR between a string and a string", async () => {
    const res = resolveTemplateString("${'a' || 'b'}", new TestContext({ a: undefined }))
    expect(res).to.equal("a")
  })

  it("should handle a logical OR between an empty string and a string", async () => {
    const res = resolveTemplateString("${a || 'b'}", new TestContext({ a: "" }))
    expect(res).to.equal("b")
  })

  it("should handle a logical AND between booleans", async () => {
    const res = resolveTemplateString("${true && a}", new TestContext({ a: true }))
    expect(res).to.equal(true)
  })

  it("should handle a logical AND where the first part is false but the second part is not resolvable", async () => {
    // i.e. the 2nd clause should not need to be evaluated
    const res = resolveTemplateString("${false && a}", new TestContext({}))
    expect(res).to.equal(false)
  })

  it("should handle a logical AND with an empty string as the first clause", async () => {
    const res = resolveTemplateString("${'' && true}", new TestContext({}))
    expect(res).to.equal("")
  })

  it("should handle a logical AND with an empty string as the second clause", async () => {
    const res = resolveTemplateString("${true && ''}", new TestContext({}))
    expect(res).to.equal("")
  })

  it("should handle a positive equality comparison between equal resolved values", async () => {
    const res = resolveTemplateString("${a == b}", new TestContext({ a: "a", b: "a" }))
    expect(res).to.equal(true)
  })

  it("should handle a positive equality comparison between equal string literals", async () => {
    const res = resolveTemplateString("${'a' == 'a'}", new TestContext({}))
    expect(res).to.equal(true)
  })

  it("should handle a positive equality comparison between equal numeric literals", async () => {
    const res = resolveTemplateString("${123 == 123}", new TestContext({}))
    expect(res).to.equal(true)
  })

  it("should handle a positive equality comparison between equal boolean literals", async () => {
    const res = resolveTemplateString("${true == true}", new TestContext({}))
    expect(res).to.equal(true)
  })

  it("should handle a positive equality comparison between different resolved values", async () => {
    const res = resolveTemplateString("${a == b}", new TestContext({ a: "a", b: "b" }))
    expect(res).to.equal(false)
  })

  it("should handle a positive equality comparison between different string literals", async () => {
    const res = resolveTemplateString("${'a' == 'b'}", new TestContext({}))
    expect(res).to.equal(false)
  })

  it("should handle a positive equality comparison between different numeric literals", async () => {
    const res = resolveTemplateString("${123 == 456}", new TestContext({}))
    expect(res).to.equal(false)
  })

  it("should handle a positive equality comparison between different boolean literals", async () => {
    const res = resolveTemplateString("${true == false}", new TestContext({}))
    expect(res).to.equal(false)
  })

  it("should handle a negative equality comparison between equal resolved values", async () => {
    const res = resolveTemplateString("${a != b}", new TestContext({ a: "a", b: "a" }))
    expect(res).to.equal(false)
  })

  it("should handle a negative equality comparison between equal string literals", async () => {
    const res = resolveTemplateString("${'a' != 'a'}", new TestContext({}))
    expect(res).to.equal(false)
  })

  it("should handle a negative equality comparison between equal numeric literals", async () => {
    const res = resolveTemplateString("${123 != 123}", new TestContext({}))
    expect(res).to.equal(false)
  })

  it("should handle a negative equality comparison between equal boolean literals", async () => {
    const res = resolveTemplateString("${false != false}", new TestContext({}))
    expect(res).to.equal(false)
  })

  it("should handle a negative equality comparison between different resolved values", async () => {
    const res = resolveTemplateString("${a != b}", new TestContext({ a: "a", b: "b" }))
    expect(res).to.equal(true)
  })

  it("should handle a negative equality comparison between different string literals", async () => {
    const res = resolveTemplateString("${'a' != 'b'}", new TestContext({}))
    expect(res).to.equal(true)
  })

  it("should handle a negative equality comparison between different numeric literals", async () => {
    const res = resolveTemplateString("${123 != 456}", new TestContext({}))
    expect(res).to.equal(true)
  })

  it("should handle a negative equality comparison between different boolean literals", async () => {
    const res = resolveTemplateString("${true != false}", new TestContext({}))
    expect(res).to.equal(true)
  })

  it("should handle a positive equality comparison between different value types", async () => {
    const res = resolveTemplateString("${true == 'foo'}", new TestContext({}))
    expect(res).to.equal(false)
  })

  it("should handle a negative equality comparison between different value types", async () => {
    const res = resolveTemplateString("${123 != false}", new TestContext({}))
    expect(res).to.equal(true)
  })

  it("should handle negations on booleans", async () => {
    const res = resolveTemplateString("${!true}", new TestContext({}))
    expect(res).to.equal(false)
  })

  it("should handle negations on nulls", async () => {
    const res = resolveTemplateString("${!null}", new TestContext({}))
    expect(res).to.equal(true)
  })

  it("should handle negations on empty strings", async () => {
    const res = resolveTemplateString("${!''}", new TestContext({}))
    expect(res).to.equal(true)
  })

  it("should handle negations on resolved keys", async () => {
    const res = resolveTemplateString("${!a}", new TestContext({ a: false }))
    expect(res).to.equal(true)
  })

  it("should handle the typeof operator for resolved booleans", async () => {
    const res = resolveTemplateString("${typeof a}", new TestContext({ a: false }))
    expect(res).to.equal("boolean")
  })

  it("should handle the typeof operator for resolved numbers", async () => {
    const res = resolveTemplateString("${typeof foo}", new TestContext({ foo: 1234 }))
    expect(res).to.equal("number")
  })

  it("should handle the typeof operator for strings", async () => {
    const res = resolveTemplateString("${typeof 'foo'}", new TestContext({}))
    expect(res).to.equal("string")
  })

  it("should throw when using comparison operators on missing keys", async () => {
    return expectError(
      () => resolveTemplateString("${a >= b}", new TestContext({ a: 123 })),
      (err) =>
        expect(stripAnsi(err.message)).to.equal(
          "Invalid template string (${a >= b}): Could not find key b. Available keys: a."
        )
    )
  })

  it("should concatenate two arrays", async () => {
    const res = resolveTemplateString("${a + b}", new TestContext({ a: [1], b: [2, 3] }))
    expect(res).to.eql([1, 2, 3])
  })

  it("should add two numbers together", async () => {
    const res = resolveTemplateString("${1 + a}", new TestContext({ a: 2 }))
    expect(res).to.equal(3)
  })

  it("should throw when using + on number and array", async () => {
    return expectError(
      () => resolveTemplateString("${a + b}", new TestContext({ a: 123, b: ["a"] })),
      (err) =>
        expect(stripAnsi(err.message)).to.equal(
          "Invalid template string (${a + b}): Both terms need to be either arrays or numbers for + operator (got number and object)."
        )
    )
  })

  it("should correctly evaluate clauses in parentheses", async () => {
    const res = resolveTemplateString("${(1 + 2) * (3 + 4)}", new TestContext({}))
    expect(res).to.equal(21)
  })

  it("should handle member lookup with bracket notation", async () => {
    const res = resolveTemplateString("${foo['bar']}", new TestContext({ foo: { bar: true } }))
    expect(res).to.equal(true)
  })

  it("should handle member lookup with bracket notation, single quotes and dot in key name", async () => {
    const res = resolveTemplateString("${foo['bar.baz']}", new TestContext({ foo: { "bar.baz": true } }))
    expect(res).to.equal(true)
  })

  it("should handle member lookup with bracket notation, double quotes and dot in key name", async () => {
    const res = resolveTemplateString('${foo.bar["bla.ble"]}', new TestContext({ foo: { bar: { "bla.ble": 123 } } }))
    expect(res).to.equal(123)
  })

  it("should handle numeric member lookup with bracket notation", async () => {
    const res = resolveTemplateString("${foo[1]}", new TestContext({ foo: [false, true] }))
    expect(res).to.equal(true)
  })

  it("should handle consecutive member lookups with bracket notation", async () => {
    const res = resolveTemplateString("${foo['bar']['baz']}", new TestContext({ foo: { bar: { baz: true } } }))
    expect(res).to.equal(true)
  })

  it("should handle dot member after bracket member", async () => {
    const res = resolveTemplateString("${foo['bar'].baz}", new TestContext({ foo: { bar: { baz: true } } }))
    expect(res).to.equal(true)
  })

  it("should handle template expression within brackets", async () => {
    const res = resolveTemplateString(
      "${foo['${bar}']}",
      new TestContext({
        foo: { baz: true },
        bar: "baz",
      })
    )
    expect(res).to.equal(true)
  })

  it("should handle identifiers within brackets", async () => {
    const res = resolveTemplateString(
      "${foo[bar]}",
      new TestContext({
        foo: { baz: true },
        bar: "baz",
      })
    )
    expect(res).to.equal(true)
  })

  it("should handle nested identifiers within brackets", async () => {
    const res = resolveTemplateString(
      "${foo[a.b]}",
      new TestContext({
        foo: { baz: true },
        a: { b: "baz" },
      })
    )
    expect(res).to.equal(true)
  })

  it("should throw if bracket expression resolves to a non-primitive", async () => {
    return expectError(
      () => resolveTemplateString("${foo[bar]}", new TestContext({ foo: {}, bar: {} })),
      (err) =>
        expect(err.message).to.equal(
          "Invalid template string (${foo[bar]}): Expression in bracket must resolve to a primitive (got object)."
        )
    )
  })

  it("should throw if attempting to index a primitive with brackets", async () => {
    return expectError(
      () => resolveTemplateString("${foo[bar]}", new TestContext({ foo: 123, bar: "baz" })),
      (err) =>
        expect(err.message).to.equal(
          'Invalid template string (${foo[bar]}): Attempted to look up key "baz" on a number.'
        )
    )
  })

  it("should throw when using >= on non-numeric terms", async () => {
    return expectError(
      () => resolveTemplateString("${a >= b}", new TestContext({ a: 123, b: "foo" })),
      (err) =>
        expect(err.message).to.equal(
          "Invalid template string (${a >= b}): Both terms need to be numbers for >= operator (got number and string)."
        )
    )
  })

  it("should handle a positive ternary expression", async () => {
    const res = resolveTemplateString("${foo ? true : false}", new TestContext({ foo: true }))
    expect(res).to.equal(true)
  })

  it("should handle a negative ternary expression", async () => {
    const res = resolveTemplateString("${foo ? true : false}", new TestContext({ foo: false }))
    expect(res).to.equal(false)
  })

  it("should handle a ternary expression with an expression as a test", async () => {
    const res = resolveTemplateString("${foo == 'bar' ? a : b}", new TestContext({ foo: "bar", a: true, b: false }))
    expect(res).to.equal(true)
  })

  it("should handle a ternary expression with an object as a test", async () => {
    const res = resolveTemplateString("${a ? a.value : b}", new TestContext({ a: { value: true }, b: false }))
    expect(res).to.equal(true)
  })

  it("should handle a ternary expression with template key values", async () => {
    const res = resolveTemplateString(
      "${foo == 'bar' ? '=${foo}' : b}",
      new TestContext({ foo: "bar", a: true, b: false })
    )
    expect(res).to.equal("=bar")
  })

  it("should handle an expression in parentheses", async () => {
    const res = resolveTemplateString("${foo || (a > 5)}", new TestContext({ foo: false, a: 10 }))
    expect(res).to.equal(true)
  })

  it("should handle numeric indices on arrays", () => {
    const res = resolveTemplateString("${foo.1}", new TestContext({ foo: [false, true] }))
    expect(res).to.equal(true)
  })

  it("should resolve keys on objects in arrays", () => {
    const res = resolveTemplateString("${foo.1.bar}", new TestContext({ foo: [{}, { bar: true }] }))
    expect(res).to.equal(true)
  })

  it("should correctly propagate errors from nested contexts", async () => {
    await expectError(
      () =>
        resolveTemplateString(
          "${nested.missing}",
          new TestContext({ nested: new TestContext({ foo: 123, bar: 456, baz: 789 }) })
        ),
      (err) =>
        expect(stripAnsi(err.message)).to.equal(
          "Invalid template string (${nested.missing}): Could not find key missing under nested. Available keys: bar, baz and foo."
        )
    )
  })

  it("should correctly propagate errors from nested objects", async () => {
    await expectError(
      () => resolveTemplateString("${nested.missing}", new TestContext({ nested: { foo: 123, bar: 456 } })),
      (err) =>
        expect(stripAnsi(err.message)).to.equal(
          "Invalid template string (${nested.missing}): Could not find key missing under nested. Available keys: bar and foo."
        )
    )
  })

  it("should correctly propagate errors when resolving key on object in nested context", async () => {
    const c = new TestContext({ nested: new TestContext({ deeper: {} }) })

    await expectError(
      () => resolveTemplateString("${nested.deeper.missing}", c),
      (err) =>
        expect(stripAnsi(err.message)).to.equal(
          "Invalid template string (${nested.deeper.missing}): Could not find key missing under nested.deeper."
        )
    )
  })

  it("should correctly propagate errors from deeply nested contexts", async () => {
    const c = new TestContext({ nested: new TestContext({ deeper: new TestContext({}) }) })

    await expectError(
      () => resolveTemplateString("${nested.deeper.missing}", c),
      (err) =>
        expect(stripAnsi(err.message)).to.equal(
          "Invalid template string (${nested.deeper.missing}): Could not find key missing under nested.deeper."
        )
    )
  })

  context("allowPartial=true", () => {
    it("passes through template strings with missing key", () => {
      const res = resolveTemplateString("${a}", new TestContext({}), { allowPartial: true })
      expect(res).to.equal("${a}")
    })

    it("passes through a template string with a missing key in an optional clause", () => {
      const res = resolveTemplateString("${a || b}", new TestContext({ b: 123 }), { allowPartial: true })
      expect(res).to.equal("${a || b}")
    })

    it("passes through a template string with a missing key in a ternary", () => {
      const res = resolveTemplateString("${a ? b : 123}", new TestContext({ b: 123 }), { allowPartial: true })
      expect(res).to.equal("${a ? b : 123}")
    })
  })

  context("when the template string is the full input string", () => {
    it("should return a resolved number directly", async () => {
      const res = resolveTemplateString("${a}", new TestContext({ a: 100 }))
      expect(res).to.equal(100)
    })

    it("should return a resolved boolean true directly", async () => {
      const res = resolveTemplateString("${a}", new TestContext({ a: true }))
      expect(res).to.equal(true)
    })

    it("should return a resolved boolean false directly", async () => {
      const res = resolveTemplateString("${a}", new TestContext({ a: false }))
      expect(res).to.equal(false)
    })

    it("should return a resolved null directly", async () => {
      const res = resolveTemplateString("${a}", new TestContext({ a: null }))
      expect(res).to.equal(null)
    })

    it("should return a resolved object directly", async () => {
      const res = resolveTemplateString("${a}", new TestContext({ a: { b: 123 } }))
      expect(res).to.eql({ b: 123 })
    })

    it("should return a resolved array directly", async () => {
      const res = resolveTemplateString("${a}", new TestContext({ a: [123] }))
      expect(res).to.eql([123])
    })
  })

  context("when the template string is a part of a string", () => {
    it("should format a resolved number into the string", async () => {
      const res = resolveTemplateString("foo-${a}", new TestContext({ a: 100 }))
      expect(res).to.equal("foo-100")
    })

    it("should format a resolved boolean true into the string", async () => {
      const res = resolveTemplateString("foo-${a}", new TestContext({ a: true }))
      expect(res).to.equal("foo-true")
    })

    it("should format a resolved boolean false into the string", async () => {
      const res = resolveTemplateString("foo-${a}", new TestContext({ a: false }))
      expect(res).to.equal("foo-false")
    })

    it("should format a resolved null into the string", async () => {
      const res = resolveTemplateString("foo-${a}", new TestContext({ a: null }))
      expect(res).to.equal("foo-null")
    })

    context("allowPartial=true", () => {
      it("passes through template strings with missing key", () => {
        const res = resolveTemplateString("${a}-${b}", new TestContext({ b: "foo" }), { allowPartial: true })
        expect(res).to.equal("${a}-foo")
      })

      it("passes through a template string with a missing key in an optional clause", () => {
        const res = resolveTemplateString("${a || b}-${c}", new TestContext({ b: 123, c: "foo" }), {
          allowPartial: true,
        })
        expect(res).to.equal("${a || b}-foo")
      })
    })
  })

  context("contains operator", () => {
    it("should throw when right-hand side is not a primitive", () => {
      const c = new TestContext({ a: [1, 2], b: [3, 4] })

      expectError(
        () => resolveTemplateString("${a contains b}", c),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(
            "Invalid template string (${a contains b}): The right-hand side of a 'contains' operator must be a string, number, boolean or null (got object)."
          )
      )
    })

    it("should throw when left-hand side is not a string, array or object", () => {
      const c = new TestContext({ a: "foo", b: null })

      expectError(
        () => resolveTemplateString("${b contains a}", c),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(
            "Invalid template string (${b contains a}): The left-hand side of a 'contains' operator must be a string, array or object (got null)."
          )
      )
    })

    it("positive string literal contains string literal", () => {
      const res = resolveTemplateString("${'foobar' contains 'foo'}", new TestContext({}))
      expect(res).to.equal(true)
    })

    it("string literal contains string literal (negative)", () => {
      const res = resolveTemplateString("${'blorg' contains 'blarg'}", new TestContext({}))
      expect(res).to.equal(false)
    })

    it("string literal contains string reference", () => {
      const res = resolveTemplateString("${a contains 'foo'}", new TestContext({ a: "foobar" }))
      expect(res).to.equal(true)
    })

    it("string reference contains string literal (negative)", () => {
      const res = resolveTemplateString("${a contains 'blarg'}", new TestContext({ a: "foobar" }))
      expect(res).to.equal(false)
    })

    it("string contains number", () => {
      const res = resolveTemplateString("${a contains 0}", new TestContext({ a: "hmm-0" }))
      expect(res).to.equal(true)
    })

    it("object contains string literal", () => {
      const res = resolveTemplateString("${a contains 'foo'}", new TestContext({ a: { foo: 123 } }))
      expect(res).to.equal(true)
    })

    it("object contains string literal (negative)", () => {
      const res = resolveTemplateString("${a contains 'bar'}", new TestContext({ a: { foo: 123 } }))
      expect(res).to.equal(false)
    })

    it("object contains string reference", () => {
      const res = resolveTemplateString("${a contains b}", new TestContext({ a: { foo: 123 }, b: "foo" }))
      expect(res).to.equal(true)
    })

    it("object contains number reference", () => {
      const res = resolveTemplateString("${a contains b}", new TestContext({ a: { 123: 456 }, b: 123 }))
      expect(res).to.equal(true)
    })

    it("object contains number literal", () => {
      const res = resolveTemplateString("${a contains 123}", new TestContext({ a: { 123: 456 } }))
      expect(res).to.equal(true)
    })

    it("array contains string reference", () => {
      const res = resolveTemplateString("${a contains b}", new TestContext({ a: ["foo"], b: "foo" }))
      expect(res).to.equal(true)
    })

    it("array contains string reference (negative)", () => {
      const res = resolveTemplateString("${a contains b}", new TestContext({ a: ["foo"], b: "bar" }))
      expect(res).to.equal(false)
    })

    it("array contains string literal", () => {
      const res = resolveTemplateString("${a contains 'foo'}", new TestContext({ a: ["foo"] }))
      expect(res).to.equal(true)
    })

    it("array contains number", () => {
      const res = resolveTemplateString("${a contains 1}", new TestContext({ a: [0, 1] }))
      expect(res).to.equal(true)
    })

    it("array contains numeric index (negative)", () => {
      const res = resolveTemplateString("${a contains 1}", new TestContext({ a: [0] }))
      expect(res).to.equal(false)
    })
  })

  context("conditional blocks", () => {
    it("single-line if block (positive)", () => {
      const res = resolveTemplateString("prefix ${if a}content ${endif}suffix", new TestContext({ a: true }))
      expect(res).to.equal("prefix content suffix")
    })

    it("single-line if block (negative)", () => {
      const res = resolveTemplateString("prefix ${if a}content ${endif}suffix", new TestContext({ a: false }))
      expect(res).to.equal("prefix suffix")
    })

    it("single-line if/else statement (positive)", () => {
      const res = resolveTemplateString(
        "prefix ${if a == 123}content ${else}other ${endif}suffix",
        new TestContext({ a: 123 })
      )
      expect(res).to.equal("prefix content suffix")
    })

    it("single-line if/else statement (negative)", () => {
      const res = resolveTemplateString(
        "prefix ${if a}content ${else}other ${endif}suffix",
        new TestContext({ a: false })
      )
      expect(res).to.equal("prefix other suffix")
    })

    it("multi-line if block (positive)", () => {
      const res = resolveTemplateString("prefix\n${if a}content\n${endif}suffix", new TestContext({ a: true }))
      expect(res).to.equal(dedent`
        prefix
        content
        suffix
      `)
    })

    it("template string within if block", () => {
      const res = resolveTemplateString(
        "prefix\n${if a}templated: ${b}\n${endif}suffix",
        new TestContext({ a: true, b: "content" })
      )
      expect(res).to.equal(dedent`
        prefix
        templated: content
        suffix
      `)
    })

    it("nested if block (both positive)", () => {
      const res = resolveTemplateString(
        "prefix\n${if a}some ${if b}content\n${endif}${endif}suffix",
        new TestContext({ a: true, b: true })
      )
      expect(res).to.equal(dedent`
        prefix
        some content
        suffix
      `)
    })

    it("nested if block (outer negative)", () => {
      const res = resolveTemplateString(
        "prefix\n${if a}some ${if b}content\n${endif}${endif}suffix",
        new TestContext({ a: false, b: true })
      )
      expect(res).to.equal(dedent`
        prefix
        suffix
      `)
    })

    it("nested if block (inner negative)", () => {
      const res = resolveTemplateString(
        "prefix\n${if a}some\n${if b}content\n${endif}${endif}suffix",
        new TestContext({ a: true, b: false })
      )
      expect(res).to.equal(dedent`
        prefix
        some
        suffix
      `)
    })

    it("if/else statement inside if block", () => {
      const res = resolveTemplateString(
        "prefix\n${if a}some\n${if b}nope${else}content\n${endif}${endif}suffix",
        new TestContext({ a: true, b: false })
      )
      expect(res).to.equal(dedent`
        prefix
        some
        content
        suffix
      `)
    })

    it("if block inside if/else statement", () => {
      const res = resolveTemplateString(
        "prefix\n${if a}some\n${if b}content\n${endif}${else}nope ${endif}suffix",
        new TestContext({ a: true, b: false })
      )
      expect(res).to.equal(dedent`
        prefix
        some
        suffix
      `)
    })

    it("throws if an if block has an optional suffix", () => {
      expectError(
        () => resolveTemplateString("prefix ${if a}?content ${endif}", new TestContext({ a: true })),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(
            "Invalid template string (prefix ${if a}?content ${endif}): Cannot specify optional suffix in if-block."
          )
      )
    })

    it("throws if an if block doesn't have a matching endif", () => {
      expectError(
        () => resolveTemplateString("prefix ${if a}content", new TestContext({ a: true })),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(
            "Invalid template string (prefix ${if a}content): Missing ${endif} after ${if ...} block."
          )
      )
    })

    it("throws if an endif block doesn't have a matching if", () => {
      expectError(
        () => resolveTemplateString("prefix content ${endif}", new TestContext({ a: true })),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(
            "Invalid template string (prefix content ${endif}): Found ${endif} block without a preceding ${if...} block."
          )
      )
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

    const result = resolveTemplateStrings(obj, templateContext)

    expect(result).to.eql({
      some: "value",
      other: {
        nested: "else",
        noTemplate: "at-all",
      },
    })
  })

  it("should correctly handle optional template strings", async () => {
    const obj = {
      some: "${key}?",
      other: "${missing}?",
    }
    const templateContext = new TestContext({
      key: "value",
    })

    const result = resolveTemplateStrings(obj, templateContext)

    expect(result).to.eql({
      some: "value",
      other: undefined,
    })
  })

  it("should collapse $merge keys on objects", () => {
    const obj = {
      $merge: { a: "a", b: "b" },
      b: "B",
      c: "c",
    }
    const templateContext = new TestContext({})

    const result = resolveTemplateStrings(obj, templateContext)

    expect(result).to.eql({
      a: "a",
      b: "B",
      c: "c",
    })
  })

  it("should collapse $merge keys based on position on object", () => {
    const obj = {
      b: "B",
      c: "c",
      $merge: { a: "a", b: "b" },
    }
    const templateContext = new TestContext({})

    const result = resolveTemplateStrings(obj, templateContext)

    expect(result).to.eql({
      a: "a",
      b: "b",
      c: "c",
    })
  })

  it("should resolve $merge keys before collapsing", () => {
    const obj = {
      $merge: "${obj}",
      b: "B",
      c: "c",
    }
    const templateContext = new TestContext({ obj: { a: "a", b: "b" } })

    const result = resolveTemplateStrings(obj, templateContext)

    expect(result).to.eql({
      a: "a",
      b: "B",
      c: "c",
    })
  })

  it("should resolve $merge keys depth-first", () => {
    const obj = {
      b: "B",
      c: "c",
      $merge: {
        $merge: "${obj}",
        a: "a",
      },
    }
    const templateContext = new TestContext({ obj: { b: "b" } })

    const result = resolveTemplateStrings(obj, templateContext)

    expect(result).to.eql({
      a: "a",
      b: "b",
      c: "c",
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

    expect(collectTemplateReferences(obj)).to.eql([["banana", "rama", "llama"], ["moo"], ["my", "reference"]])
  })
})

describe.skip("throwOnMissingSecretKeys", () => {
  it("should not throw an error if no secrets are referenced", () => {
    const configs = [
      {
        name: "foo",
        foo: "${banana.llama}",
        nested: { boo: "${moo}" },
      },
    ]

    throwOnMissingSecretKeys(configs, {}, "Module")
    throwOnMissingSecretKeys(configs, { someSecret: "123" }, "Module")
  })

  it("should throw an error if one or more secrets is missing", async () => {
    const configs = [
      {
        name: "moduleA",
        foo: "${secrets.a}",
        nested: { boo: "${secrets.b}" },
      },
      {
        name: "moduleB",
        bar: "${secrets.a}",
        nested: { boo: "${secrets.b}" },
        baz: "${secrets.c}",
      },
    ]

    await expectError(
      () => throwOnMissingSecretKeys(configs, { b: "123" }, "Module"),
      (err) => {
        expect(err.message).to.match(/Module moduleA: a/)
        expect(err.message).to.match(/Module moduleB: a, c/)
        expect(err.message).to.match(/Secret keys with loaded values: b/)
      }
    )

    await expectError(
      () => throwOnMissingSecretKeys(configs, {}, "Module"),
      (err) => {
        expect(err.message).to.match(/Module moduleA: a, b/)
        expect(err.message).to.match(/Module moduleB: a, b, c/)
        expect(err.message).to.match(/Note: No secrets have been loaded./)
      }
    )
  })
})
