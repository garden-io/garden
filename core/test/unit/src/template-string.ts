/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import {
  resolveTemplateString,
  resolveTemplateStrings,
  throwOnMissingSecretKeys,
  getActionTemplateReferences,
} from "../../../src/template-string/template-string.js"
import { CONTEXT_RESOLVE_KEY_AVAILABLE_LATER, GenericContext } from "../../../src/config/template-contexts/base.js"
import type { TestGarden } from "../../helpers.js"
import { expectError, expectFuzzyMatch, getDataDir, makeTestGarden } from "../../helpers.js"
import { dedent } from "../../../src/util/string.js"
import stripAnsi from "strip-ansi"
import { TemplateStringError } from "../../../src/exceptions.js"
import repeat from "lodash-es/repeat.js"
import type { ContextLookupReferenceFinding } from "../../../src/template-string/static-analysis.js"
import {
  getContextLookupReferences,
  UnresolvableValue,
  visitAll,
} from "../../../src/template-string/static-analysis.js"

describe("resolveTemplateString", () => {
  it("should return a non-templated string unchanged", () => {
    const res = resolveTemplateString({ string: "somestring", context: new GenericContext({}) })
    expect(res).to.equal("somestring")
  })

  it("should resolve a key with a dash in it", () => {
    const res = resolveTemplateString({ string: "${some-key}", context: new GenericContext({ "some-key": "value" }) })
    expect(res).to.equal("value")
  })

  it("should resolve a nested key with a dash in it", () => {
    const res = resolveTemplateString({
      string: "${ctx.some-key}",
      context: new GenericContext({ ctx: { "some-key": "value" } }),
    })
    expect(res).to.equal("value")
  })

  it("should correctly resolve if ? suffix is present but value exists", () => {
    const res = resolveTemplateString({ string: "${foo}?", context: new GenericContext({ foo: "bar" }) })
    expect(res).to.equal("bar")
  })

  it("should allow undefined values if ? suffix is present", () => {
    const res = resolveTemplateString({ string: "${foo}?", context: new GenericContext({}) })
    expect(res).to.equal(undefined)
  })

  it("should pass optional string through if allowPartial=true", () => {
    const res = resolveTemplateString({
      string: "${foo}?",
      context: new GenericContext({}),
      contextOpts: { allowPartial: true },
    })
    expect(res).to.equal("${foo}?")
  })

  it("should not crash when variable in a member expression cannot be resolved with allowPartial=true", () => {
    const inputs = [
      '${actions.run["${inputs.deployableTarget}-dummy"].var}',
      '${actions.build["${parent.name}"].outputs.deployment-image-id}',
      '${actions.build["${parent.name}?"]}',
    ]
    for (const input of inputs) {
      const res = resolveTemplateString({
        string: input,
        context: new GenericContext({
          actions: {
            run: {},
            build: {},
          },
        }),
        contextOpts: { allowPartial: true },
      })
      expect(res).to.equal(input)
    }
  })

  it("should fail if optional expression in member expression cannot be resolved with allowPartial=false", async () => {
    await expectError(
      () =>
        resolveTemplateString({
          string: '${actions.build["${parent.name}?"]}',
          context: new GenericContext({
            actions: {
              build: {},
            },
          }),
          contextOpts: { allowPartial: false },
        }),
      {
        contains:
          'Invalid template string (${actions.build["${parent.name}?"]}): Expression in brackets must resolve to a string or number (got undefined).',
      }
    )
  })

  it("should support a string literal in a template string as a means to escape it", () => {
    const res = resolveTemplateString({ string: "${'$'}{bar}", context: new GenericContext({}) })
    expect(res).to.equal("${bar}")
  })

  it("should pass through a template string with a double $$ prefix if allowPartial=true", () => {
    const res = resolveTemplateString({
      string: "$${bar}",
      context: new GenericContext({}),
      contextOpts: { allowPartial: true },
    })
    expect(res).to.equal("$${bar}")
  })

  it("should allow unescaping a template string with a double $$ prefix", () => {
    const res = resolveTemplateString({
      string: "$${bar}",
      context: new GenericContext({}),
      contextOpts: { unescape: true },
    })
    expect(res).to.equal("${bar}")
  })

  it("should unescape a template string with a double $$ prefix if allowPartial=false", () => {
    const res = resolveTemplateString({
      string: "$${bar}",
      context: new GenericContext({}),
      contextOpts: { allowPartial: false },
    })
    expect(res).to.equal("${bar}")
  })

  it("should allow nesting escaped strings within normal strings", () => {
    const res = resolveTemplateString({
      string: "${foo == 'yes' ? '$${bar}' : 'fail' }",
      context: new GenericContext({ foo: "yes" }),
      contextOpts: { unescape: true },
    })
    expect(res).to.equal("${bar}")
  })

  describe("should escape env references correctly", () => {
    const envFormats = [
      { delimiter: ".", platform: "macos/linux" },
      // FIXME: for some reason peggy parser does not process strings with : in the middle
      // { delimiter: ":", platform: "windows" },
    ]

    for (const envFormat of envFormats) {
      describe(`on ${envFormat.platform}`, () => {
        it("for standalone env vars", () => {
          const res = resolveTemplateString({
            string: "$${env" + envFormat.delimiter + "TEST_ENV}",
            context: new GenericContext({}),
            contextOpts: { unescape: true },
          })
          expect(res).to.equal("${env" + envFormat.delimiter + "TEST_ENV}")
        })

        it("for env vars in argument lists", () => {
          const res = resolveTemplateString({
            string: "foo $${env" + envFormat.delimiter + "TEST_ENV} bar",
            context: new GenericContext({}),
            contextOpts: { unescape: true },
          })
          expect(res).to.equal("foo ${env" + envFormat.delimiter + "TEST_ENV} bar")
        })

        it("for env vars that are parts of another strings", () => {
          const res = resolveTemplateString({
            string: "${foo}-$${env" + envFormat.delimiter + "TEST_ENV}",
            context: new GenericContext({ foo: "foo" }),
            contextOpts: { unescape: true },
          })
          expect(res).to.equal("foo-${env" + envFormat.delimiter + "TEST_ENV}")
        })
      })
    }
  })

  it("should allow mixing normal and escaped strings", () => {
    const res = resolveTemplateString({
      string: "${foo}-and-$${var.nope}",
      context: new GenericContext({ foo: "yes" }),
      contextOpts: { unescape: true },
    })
    expect(res).to.equal("yes-and-${var.nope}")
  })

  it("should interpolate a format string with a prefix", () => {
    const res = resolveTemplateString({ string: "prefix-${some}", context: new GenericContext({ some: "value" }) })
    expect(res).to.equal("prefix-value")
  })

  it("should interpolate a format string with a suffix", () => {
    const res = resolveTemplateString({ string: "${some}-suffix", context: new GenericContext({ some: "value" }) })
    expect(res).to.equal("value-suffix")
  })

  it("should interpolate a format string with a prefix and a suffix", () => {
    const res = resolveTemplateString({
      string: "prefix-${some}-suffix",
      context: new GenericContext({ some: "value" }),
    })
    expect(res).to.equal("prefix-value-suffix")
  })

  it("should interpolate an optional format string with a prefix and a suffix", () => {
    const res = resolveTemplateString({ string: "prefix-${some}?-suffix", context: new GenericContext({}) })
    expect(res).to.equal("prefix--suffix")
  })

  it("should interpolate a format string with a prefix with whitespace", () => {
    const res = resolveTemplateString({ string: "prefix ${some}", context: new GenericContext({ some: "value" }) })
    expect(res).to.equal("prefix value")
  })

  it("should interpolate a format string with a suffix with whitespace", () => {
    const res = resolveTemplateString({ string: "${some} suffix", context: new GenericContext({ some: "value" }) })
    expect(res).to.equal("value suffix")
  })

  it("should correctly interpolate a format string with surrounding whitespace", () => {
    const res = resolveTemplateString({
      string: "prefix ${some} suffix",
      context: new GenericContext({ some: "value" }),
    })
    expect(res).to.equal("prefix value suffix")
  })

  it("should handle a nested key", () => {
    const res = resolveTemplateString({
      string: "${some.nested}",
      context: new GenericContext({ some: { nested: "value" } }),
    })
    expect(res).to.equal("value")
  })

  it("should handle multiple format strings", () => {
    const res = resolveTemplateString({
      string: "prefix-${a}-${b}-suffix",
      context: new GenericContext({ a: "value", b: "other" }),
    })
    expect(res).to.equal("prefix-value-other-suffix")
  })

  it("should handle consecutive format strings", () => {
    const res = resolveTemplateString({ string: "${a}${b}", context: new GenericContext({ a: "value", b: "other" }) })
    expect(res).to.equal("valueother")
  })

  it("should throw when a key is not found", () => {
    void expectError(() => resolveTemplateString({ string: "${some}", context: new GenericContext({}) }), {
      contains: "Invalid template string (${some}): Could not find key some",
    })
  })

  it("should trim long template string in error messages", () => {
    const veryLongString = repeat("very ", 100)
    void expectError(
      () =>
        resolveTemplateString({
          string: `\${some} ${veryLongString} template string`,
          context: new GenericContext({}),
        }),
      (err) => expect(err.message.length).to.be.lessThan(350)
    )
  })

  it("should replace line breaks in template strings in error messages", () => {
    void expectError(
      () => resolveTemplateString({ string: "${some}\nmulti\nline\nstring", context: new GenericContext({}) }),
      {
        contains: "Invalid template string (${some}\\nmulti\\nline\\nstring): Could not find key some",
      }
    )
  })

  it("should throw when a nested key is not found", () => {
    void expectError(
      () => resolveTemplateString({ string: "${some.other}", context: new GenericContext({ some: {} }) }),
      {
        contains: "Invalid template string (${some.other}): Could not find key other under some",
      }
    )
  })

  it("should throw with an incomplete template string", () => {
    try {
      resolveTemplateString({ string: "${some", context: new GenericContext({ some: {} }) })
    } catch (err) {
      if (!(err instanceof TemplateStringError)) {
        expect.fail("Expected TemplateStringError")
      }
      expect(stripAnsi(err.message)).to.equal(
        "Invalid template string (${some): Unable to parse as valid template string."
      )
      return
    }

    expect.fail("Expected error")
  })

  it("should throw on nested format strings", () => {
    void expectError(() => resolveTemplateString({ string: "${resol${part}ed}", context: new GenericContext({}) }), {
      contains: "Invalid template string (${resol${part}ed}): Unable to parse as valid template string.",
    })
  })

  it("should handle a single-quoted string", () => {
    const res = resolveTemplateString({ string: "${'foo'}", context: new GenericContext({}) })
    expect(res).to.equal("foo")
  })

  it("should handle a numeric literal and return it directly", () => {
    const res = resolveTemplateString({ string: "${123}", context: new GenericContext({}) })
    expect(res).to.equal(123)
  })

  it("should handle a boolean true literal and return it directly", () => {
    const res = resolveTemplateString({ string: "${true}", context: new GenericContext({}) })
    expect(res).to.equal(true)
  })

  it("should handle a boolean false literal and return it directly", () => {
    const res = resolveTemplateString({ string: "${false}", context: new GenericContext({}) })
    expect(res).to.equal(false)
  })

  it("should allow unclosed conditional blocks expressions (true)", () => {
    const res = resolveTemplateString({ string: "${if true}", context: new GenericContext({}) })
    expect(res).to.equal(true)
  })

  it("should allow unclosed conditional blocks expressions (false)", () => {
    const res = resolveTemplateString({ string: "${if false}", context: new GenericContext({}) })
    expect(res).to.equal(false)
  })

  it("should allow unclosed conditional blocks expressions (any value)", () => {
    const res = resolveTemplateString({ string: '${if "something"}', context: new GenericContext({}) })
    expect(res).to.equal("something")
  })

  it("empty conditional blocks expressions evaluate to empty string", () => {
    const res = resolveTemplateString({ string: "${if true}${endif}", context: new GenericContext({}) })
    expect(res).to.equal("")
  })

  it("should handle a null literal and return it directly", () => {
    const res = resolveTemplateString({ string: "${null}", context: new GenericContext({}) })
    expect(res).to.equal(null)
  })

  it("should handle a numeric literal in a logical OR and return it directly", () => {
    const res = resolveTemplateString({ string: "${a || 123}", context: new GenericContext({}) })
    expect(res).to.equal(123)
  })

  it("should handle a boolean true literal in a logical OR and return it directly", () => {
    const res = resolveTemplateString({ string: "${a || true}", context: new GenericContext({}) })
    expect(res).to.equal(true)
  })

  it("should handle a boolean false literal in a logical OR and return it directly", () => {
    const res = resolveTemplateString({ string: "${a || false}", context: new GenericContext({}) })
    expect(res).to.equal(false)
  })

  it("should handle a null literal in a logical OR and return it directly", () => {
    const res = resolveTemplateString({ string: "${a || null}", context: new GenericContext({}) })
    expect(res).to.equal(null)
  })

  it("should handle a double-quoted string", () => {
    const res = resolveTemplateString({ string: '${"foo"}', context: new GenericContext({}) })
    expect(res).to.equal("foo")
  })

  it("should throw on invalid single-quoted string", () => {
    void expectError(() => resolveTemplateString({ string: "${'foo}", context: new GenericContext({}) }), {
      contains: "Invalid template string (${'foo}): Unable to parse as valid template string.",
    })
  })

  it("should throw on invalid double-quoted string", () => {
    void expectError(() => resolveTemplateString({ string: '${"foo}', context: new GenericContext({}) }), {
      contains: 'Invalid template string (${"foo}): Unable to parse as valid template string.',
    })
  })

  it("should handle a logical OR between two identifiers", () => {
    const res = resolveTemplateString({ string: "${a || b}", context: new GenericContext({ a: undefined, b: "abc" }) })
    expect(res).to.equal("abc")
  })

  it("should handle a logical OR between two nested identifiers", () => {
    const res = resolveTemplateString({
      string: "${a.b || c.d}",
      context: new GenericContext({
        a: { b: undefined },
        c: { d: "abc" },
      }),
    })
    expect(res).to.equal("abc")
  })

  it("should handle a logical OR between two nested identifiers where the first resolves", () => {
    const res = resolveTemplateString({
      string: "${a.b || c.d}",
      context: new GenericContext({
        a: { b: "abc" },
        c: { d: undefined },
      }),
    })
    expect(res).to.equal("abc")
  })

  it("should handle a logical OR between two identifiers without spaces with first value undefined", () => {
    const res = resolveTemplateString({ string: "${a||b}", context: new GenericContext({ a: undefined, b: "abc" }) })
    expect(res).to.equal("abc")
  })

  it("should handle a logical OR between two identifiers with first value undefined and string fallback", () => {
    const res = resolveTemplateString({ string: '${a || "foo"}', context: new GenericContext({ a: undefined }) })
    expect(res).to.equal("foo")
  })

  it("should handle a logical OR with undefined nested value and string fallback", () => {
    const res = resolveTemplateString({ string: "${a.b || 'foo'}", context: new GenericContext({ a: {} }) })
    expect(res).to.equal("foo")
  })

  it("should handle chained logical OR with string fallback", () => {
    const res = resolveTemplateString({
      string: "${a.b || c.d || e.f || 'foo'}",
      context: new GenericContext({ a: {}, c: {}, e: {} }),
    })
    expect(res).to.equal("foo")
  })

  it("should handle a logical OR between two identifiers without spaces with first value set", () => {
    const res = resolveTemplateString({ string: "${a||b}", context: new GenericContext({ a: "abc", b: undefined }) })
    expect(res).to.equal("abc")
  })

  it("should throw if neither key in logical OR is valid", () => {
    void expectError(() => resolveTemplateString({ string: "${a || b}", context: new GenericContext({}) }), {
      contains: "Invalid template string (${a || b}): Could not find key b",
    })
  })

  it("should throw on invalid logical OR string", () => {
    void expectError(() => resolveTemplateString({ string: "${a || 'b}", context: new GenericContext({}) }), {
      contains: "Invalid template string (${a || 'b}): Unable to parse as valid template string.",
    })
  })

  it("should handle a logical OR between a string and a string", () => {
    const res = resolveTemplateString({ string: "${'a' || 'b'}", context: new GenericContext({ a: undefined }) })
    expect(res).to.equal("a")
  })

  it("should handle a logical OR between an empty string and a string", () => {
    const res = resolveTemplateString({ string: "${a || 'b'}", context: new GenericContext({ a: "" }) })
    expect(res).to.equal("b")
  })

  context("logical AND (&& operator)", () => {
    it("true literal and true variable reference", () => {
      const res = resolveTemplateString({ string: "${true && a}", context: new GenericContext({ a: true }) })
      expect(res).to.equal(true)
    })

    it("two true variable references", () => {
      const res = resolveTemplateString({
        string: "${var.a && var.b}",
        context: new GenericContext({ var: { a: true, b: true } }),
      })
      expect(res).to.equal(true)
    })

    it("first part is false but the second part is not resolvable", () => {
      // i.e. the 2nd clause should not need to be evaluated
      const res = resolveTemplateString({ string: "${false && a}", context: new GenericContext({}) })
      expect(res).to.equal(false)
    })

    it("an empty string as the first clause", () => {
      const res = resolveTemplateString({ string: "${'' && true}", context: new GenericContext({}) })
      expect(res).to.equal("")
    })

    it("an empty string as the second clause", () => {
      const res = resolveTemplateString({ string: "${true && ''}", context: new GenericContext({}) })
      expect(res).to.equal("")
    })

    it("a missing reference as the first clause", () => {
      const res = resolveTemplateString({ string: "${var.foo && 'a'}", context: new GenericContext({ var: {} }) })
      expect(res).to.equal(false)
    })

    it("a missing reference as the second clause", () => {
      const res = resolveTemplateString({ string: "${'a' && var.foo}", context: new GenericContext({ var: {} }) })
      expect(res).to.equal(false)
    })

    context("partial resolution", () => {
      it("a missing reference as the first clause returns the original template", () => {
        const res = resolveTemplateString({
          string: "${var.foo && 'a'}",
          context: new GenericContext({ var: {} }),
          contextOpts: { allowPartial: true },
        })
        expect(res).to.equal("${var.foo && 'a'}")
      })

      it("a missing reference as the second clause returns the original template", () => {
        const res = resolveTemplateString({
          string: "${'a' && var.foo}",
          context: new GenericContext({ var: {} }),
          contextOpts: { allowPartial: true },
        })
        expect(res).to.equal("${'a' && var.foo}")
      })
    })
  })

  context("partial resolution in binary operators", () => {
    context("arithmetic operators", () => {
      const arithmeticOperators = ["-", "*", "/", "%", ">", ">=", "<", "<="]
      for (const operator of arithmeticOperators) {
        describe(`with ${operator} operator`, () => {
          it("a missing reference as the first clause returns the original template", () => {
            const res = resolveTemplateString({
              string: `$\{var.foo ${operator} 2}`,
              context: new GenericContext({ var: {} }),
              contextOpts: { allowPartial: true },
            })
            expect(res).to.equal(`$\{var.foo ${operator} 2}`)
          })

          it("a missing reference as the second clause returns the original template", () => {
            const res = resolveTemplateString({
              string: `$\{2 ${operator} var.foo}`,
              context: new GenericContext({ var: {} }),
              contextOpts: { allowPartial: true },
            })
            expect(res).to.equal(`$\{2 ${operator} var.foo}`)
          })
        })
      }
    })

    context("overloaded operators", () => {
      const overLoadedOperators = ["+"]
      for (const operator of overLoadedOperators) {
        describe(`with ${operator} operator`, () => {
          it(`a missing reference as the first clause returns the original template`, () => {
            const res = resolveTemplateString({
              string: `$\{var.foo ${operator} '2'}`,
              context: new GenericContext({ var: {} }),
              contextOpts: { allowPartial: true },
            })
            expect(res).to.equal(`$\{var.foo ${operator} '2'}`)
          })

          it("a missing reference as the second clause returns the original template", () => {
            const res = resolveTemplateString({
              string: `$\{2 ${operator} var.foo}`,
              context: new GenericContext({ var: {} }),
              contextOpts: { allowPartial: true },
            })
            expect(res).to.equal(`$\{2 ${operator} var.foo}`)
          })
        })
      }
    })
  })

  it("should handle a positive equality comparison between equal resolved values", () => {
    const res = resolveTemplateString({ string: "${a == b}", context: new GenericContext({ a: "a", b: "a" }) })
    expect(res).to.equal(true)
  })

  it("should handle a positive equality comparison between equal string literals", () => {
    const res = resolveTemplateString({ string: "${'a' == 'a'}", context: new GenericContext({}) })
    expect(res).to.equal(true)
  })

  it("should handle a positive equality comparison between equal numeric literals", () => {
    const res = resolveTemplateString({ string: "${123 == 123}", context: new GenericContext({}) })
    expect(res).to.equal(true)
  })

  it("should handle a positive equality comparison between equal boolean literals", () => {
    const res = resolveTemplateString({ string: "${true == true}", context: new GenericContext({}) })
    expect(res).to.equal(true)
  })

  it("should handle a positive equality comparison between different resolved values", () => {
    const res = resolveTemplateString({ string: "${a == b}", context: new GenericContext({ a: "a", b: "b" }) })
    expect(res).to.equal(false)
  })

  it("should handle a positive equality comparison between different string literals", () => {
    const res = resolveTemplateString({ string: "${'a' == 'b'}", context: new GenericContext({}) })
    expect(res).to.equal(false)
  })

  it("should handle a positive equality comparison between different numeric literals", () => {
    const res = resolveTemplateString({ string: "${123 == 456}", context: new GenericContext({}) })
    expect(res).to.equal(false)
  })

  it("should handle a positive equality comparison between different boolean literals", () => {
    const res = resolveTemplateString({ string: "${true == false}", context: new GenericContext({}) })
    expect(res).to.equal(false)
  })

  it("should handle a negative equality comparison between equal resolved values", () => {
    const res = resolveTemplateString({ string: "${a != b}", context: new GenericContext({ a: "a", b: "a" }) })
    expect(res).to.equal(false)
  })

  it("should handle a negative equality comparison between equal string literals", () => {
    const res = resolveTemplateString({ string: "${'a' != 'a'}", context: new GenericContext({}) })
    expect(res).to.equal(false)
  })

  it("should handle a negative equality comparison between equal numeric literals", () => {
    const res = resolveTemplateString({ string: "${123 != 123}", context: new GenericContext({}) })
    expect(res).to.equal(false)
  })

  it("should handle a negative equality comparison between equal boolean literals", () => {
    const res = resolveTemplateString({ string: "${false != false}", context: new GenericContext({}) })
    expect(res).to.equal(false)
  })

  it("should handle a negative equality comparison between different resolved values", () => {
    const res = resolveTemplateString({ string: "${a != b}", context: new GenericContext({ a: "a", b: "b" }) })
    expect(res).to.equal(true)
  })

  it("should handle a negative equality comparison between different string literals", () => {
    const res = resolveTemplateString({ string: "${'a' != 'b'}", context: new GenericContext({}) })
    expect(res).to.equal(true)
  })

  it("should handle a negative equality comparison between different numeric literals", () => {
    const res = resolveTemplateString({ string: "${123 != 456}", context: new GenericContext({}) })
    expect(res).to.equal(true)
  })

  it("should handle a negative equality comparison between different boolean literals", () => {
    const res = resolveTemplateString({ string: "${true != false}", context: new GenericContext({}) })
    expect(res).to.equal(true)
  })

  it("should handle a positive equality comparison between different value types", () => {
    const res = resolveTemplateString({ string: "${true == 'foo'}", context: new GenericContext({}) })
    expect(res).to.equal(false)
  })

  it("should handle a negative equality comparison between different value types", () => {
    const res = resolveTemplateString({ string: "${123 != false}", context: new GenericContext({}) })
    expect(res).to.equal(true)
  })

  it("should handle negations on booleans", () => {
    const res = resolveTemplateString({ string: "${!true}", context: new GenericContext({}) })
    expect(res).to.equal(false)
  })

  it("should handle negations on nulls", () => {
    const res = resolveTemplateString({ string: "${!null}", context: new GenericContext({}) })
    expect(res).to.equal(true)
  })

  it("should handle negations on empty strings", () => {
    const res = resolveTemplateString({ string: "${!''}", context: new GenericContext({}) })
    expect(res).to.equal(true)
  })

  it("should handle negations on resolved keys", () => {
    const res = resolveTemplateString({ string: "${!a}", context: new GenericContext({ a: false }) })
    expect(res).to.equal(true)
  })

  it("should handle the typeof operator for resolved booleans", () => {
    const res = resolveTemplateString({ string: "${typeof a}", context: new GenericContext({ a: false }) })
    expect(res).to.equal("boolean")
  })

  it("should handle the typeof operator for resolved numbers", () => {
    const res = resolveTemplateString({ string: "${typeof foo}", context: new GenericContext({ foo: 1234 }) })
    expect(res).to.equal("number")
  })

  it("should handle the typeof operator for strings", () => {
    const res = resolveTemplateString({ string: "${typeof 'foo'}", context: new GenericContext({}) })
    expect(res).to.equal("string")
  })

  it("should throw when using comparison operators on missing keys", () => {
    void expectError(() => resolveTemplateString({ string: "${a >= b}", context: new GenericContext({ a: 123 }) }), {
      contains: "Invalid template string (${a >= b}): Could not find key b. Available keys: a.",
    })
  })

  it("should concatenate two arrays", () => {
    const res = resolveTemplateString({ string: "${a + b}", context: new GenericContext({ a: [1], b: [2, 3] }) })
    expect(res).to.eql([1, 2, 3])
  })

  it("should concatenate two strings", () => {
    const res = resolveTemplateString({ string: "${a + b}", context: new GenericContext({ a: "foo", b: "bar" }) })
    expect(res).to.eql("foobar")
  })

  it("should add two numbers together", () => {
    const res = resolveTemplateString({ string: "${1 + a}", context: new GenericContext({ a: 2 }) })
    expect(res).to.equal(3)
  })

  it("should throw when using + on number and array", () => {
    void expectError(
      () => resolveTemplateString({ string: "${a + b}", context: new GenericContext({ a: 123, b: ["a"] }) }),
      {
        contains:
          "Invalid template string (${a + b}): Both terms need to be either arrays or strings or numbers for + operator (got number and object).",
      }
    )
  })

  it("should correctly evaluate clauses in parentheses", () => {
    const res = resolveTemplateString({ string: "${(1 + 2) * (3 + 4)}", context: new GenericContext({}) })
    expect(res).to.equal(21)
  })

  it("should handle member lookup with bracket notation", () => {
    const res = resolveTemplateString({ string: "${foo['bar']}", context: new GenericContext({ foo: { bar: true } }) })
    expect(res).to.equal(true)
  })

  it("should handle member lookup with bracket notation, single quotes and dot in key name", () => {
    const res = resolveTemplateString({
      string: "${foo['bar.baz']}",
      context: new GenericContext({ foo: { "bar.baz": true } }),
    })
    expect(res).to.equal(true)
  })

  it("should handle member lookup with bracket notation, double quotes and dot in key name", () => {
    const res = resolveTemplateString({
      string: '${foo.bar["bla.ble"]}',
      context: new GenericContext({ foo: { bar: { "bla.ble": 123 } } }),
    })
    expect(res).to.equal(123)
  })

  it("should handle numeric member lookup with bracket notation", () => {
    const res = resolveTemplateString({ string: "${foo[1]}", context: new GenericContext({ foo: [false, true] }) })
    expect(res).to.equal(true)
  })

  it("should handle consecutive member lookups with bracket notation", () => {
    const res = resolveTemplateString({
      string: "${foo['bar']['baz']}",
      context: new GenericContext({ foo: { bar: { baz: true } } }),
    })
    expect(res).to.equal(true)
  })

  it("should handle dot member after bracket member", () => {
    const res = resolveTemplateString({
      string: "${foo['bar'].baz}",
      context: new GenericContext({ foo: { bar: { baz: true } } }),
    })
    expect(res).to.equal(true)
  })

  it("should handle template expression within brackets", () => {
    const res = resolveTemplateString({
      string: "${foo['${bar}']}",
      context: new GenericContext({
        foo: { baz: true },
        bar: "baz",
      }),
    })
    expect(res).to.equal(true)
  })

  it("should handle identifiers within brackets", () => {
    const res = resolveTemplateString({
      string: "${foo[bar]}",
      context: new GenericContext({
        foo: { baz: true },
        bar: "baz",
      }),
    })
    expect(res).to.equal(true)
  })

  it("should handle nested identifiers within brackets", () => {
    const res = resolveTemplateString({
      string: "${foo[a.b]}",
      context: new GenericContext({
        foo: { baz: true },
        a: { b: "baz" },
      }),
    })
    expect(res).to.equal(true)
  })

  it("should throw if bracket expression resolves to a non-primitive", () => {
    void expectError(
      () => resolveTemplateString({ string: "${foo[bar]}", context: new GenericContext({ foo: {}, bar: {} }) }),
      {
        contains:
          "Invalid template string (${foo[bar]}): Expression in brackets must resolve to a string or number (got object).",
      }
    )
  })

  it("should throw if attempting to index a primitive with brackets", () => {
    void expectError(
      () => resolveTemplateString({ string: "${foo[bar]}", context: new GenericContext({ foo: 123, bar: "baz" }) }),
      {
        contains: 'Invalid template string (${foo[bar]}): Attempted to look up key "baz" on a number.',
      }
    )
  })

  it("should throw when using >= on non-numeric terms", () => {
    void expectError(
      () => resolveTemplateString({ string: "${a >= b}", context: new GenericContext({ a: 123, b: "foo" }) }),
      {
        contains:
          "Invalid template string (${a >= b}): Both terms need to be numbers for >= operator (got number and string).",
      }
    )
  })

  it("should handle a positive ternary expression", () => {
    const res = resolveTemplateString({ string: "${foo ? true : false}", context: new GenericContext({ foo: true }) })
    expect(res).to.equal(true)
  })

  it("should handle a negative ternary expression", () => {
    const res = resolveTemplateString({ string: "${foo ? true : false}", context: new GenericContext({ foo: false }) })
    expect(res).to.equal(false)
  })

  it("should handle a ternary expression with an expression as a test", () => {
    const res = resolveTemplateString({
      string: "${foo == 'bar' ? a : b}",
      context: new GenericContext({ foo: "bar", a: true, b: false }),
    })
    expect(res).to.equal(true)
  })

  it("should ignore errors in a value not returned by a ternary", () => {
    const res = resolveTemplateString({
      string: "${var.foo ? replace(var.foo, ' ', ',') : null}",
      context: new GenericContext({ var: {} }),
    })
    expect(res).to.equal(null)
  })

  it("should handle a ternary expression with an object as a test", () => {
    const res = resolveTemplateString({
      string: "${a ? a.value : b}",
      context: new GenericContext({ a: { value: true }, b: false }),
    })
    expect(res).to.equal(true)
  })

  it("should handle a ternary expression with template key values", () => {
    const res = resolveTemplateString({
      string: "${foo == 'bar' ? '=${foo}' : b}",
      context: new GenericContext({ foo: "bar", a: true, b: false }),
    })
    expect(res).to.equal("=bar")
  })

  it("should handle an expression in parentheses", () => {
    const res = resolveTemplateString({
      string: "${foo || (a > 5)}",
      context: new GenericContext({ foo: false, a: 10 }),
    })
    expect(res).to.equal(true)
  })

  it("should handle numeric indices on arrays", () => {
    const res = resolveTemplateString({ string: "${foo.1}", context: new GenericContext({ foo: [false, true] }) })
    expect(res).to.equal(true)
  })

  it("should resolve keys on objects in arrays", () => {
    const res = resolveTemplateString({
      string: "${foo.1.bar}",
      context: new GenericContext({ foo: [{}, { bar: true }] }),
    })
    expect(res).to.equal(true)
  })

  it("should correctly propagate errors from nested contexts", () => {
    void expectError(
      () =>
        resolveTemplateString({
          string: "${nested.missing}",
          context: new GenericContext({ nested: new GenericContext({ foo: 123, bar: 456, baz: 789 }) }),
        }),
      {
        contains:
          "Invalid template string (${nested.missing}): Could not find key missing under nested. Available keys: bar, baz and foo.",
      }
    )
  })

  it("should correctly propagate errors from nested objects", () => {
    void expectError(
      () =>
        resolveTemplateString({
          string: "${nested.missing}",
          context: new GenericContext({ nested: { foo: 123, bar: 456 } }),
        }),
      {
        contains:
          "Invalid template string (${nested.missing}): Could not find key missing under nested. Available keys: bar and foo.",
      }
    )
  })

  it("should correctly propagate errors when resolving key on object in nested context", () => {
    const c = new GenericContext({ nested: new GenericContext({ deeper: {} }) })

    void expectError(() => resolveTemplateString({ string: "${nested.deeper.missing}", context: c }), {
      contains: "Invalid template string (${nested.deeper.missing}): Could not find key missing under nested.deeper.",
    })
  })

  it("should correctly propagate errors from deeply nested contexts", () => {
    const c = new GenericContext({ nested: new GenericContext({ deeper: new GenericContext({}) }) })

    void expectError(() => resolveTemplateString({ string: "${nested.deeper.missing}", context: c }), {
      contains: "Invalid template string (${nested.deeper.missing}): Could not find key missing under nested.deeper.",
    })
  })

  context("allowPartial=true", () => {
    it("passes through template strings with missing key", () => {
      const res = resolveTemplateString({
        string: "${a}",
        context: new GenericContext({}),
        contextOpts: { allowPartial: true },
      })
      expect(res).to.equal("${a}")
    })

    it("passes through a template string with a missing key in an optional clause", () => {
      const res = resolveTemplateString({
        string: "${a || b}",
        context: new GenericContext({ b: 123 }),
        contextOpts: { allowPartial: true },
      })
      expect(res).to.equal("${a || b}")
    })

    it("passes through a template string with a missing key in a ternary", () => {
      const res = resolveTemplateString({
        string: "${a ? b : 123}",
        context: new GenericContext({ b: 123 }),
        contextOpts: { allowPartial: true },
      })
      expect(res).to.equal("${a ? b : 123}")
    })
  })

  context("when the template string is the full input string", () => {
    it("should return a resolved number directly", () => {
      const res = resolveTemplateString({ string: "${a}", context: new GenericContext({ a: 100 }) })
      expect(res).to.equal(100)
    })

    it("should return a resolved boolean true directly", () => {
      const res = resolveTemplateString({ string: "${a}", context: new GenericContext({ a: true }) })
      expect(res).to.equal(true)
    })

    it("should return a resolved boolean false directly", () => {
      const res = resolveTemplateString({ string: "${a}", context: new GenericContext({ a: false }) })
      expect(res).to.equal(false)
    })

    it("should return a resolved null directly", () => {
      const res = resolveTemplateString({ string: "${a}", context: new GenericContext({ a: null }) })
      expect(res).to.equal(null)
    })

    it("should return a resolved object directly", () => {
      const res = resolveTemplateString({ string: "${a}", context: new GenericContext({ a: { b: 123 } }) })
      expect(res).to.eql({ b: 123 })
    })

    it("should return a resolved array directly", () => {
      const res = resolveTemplateString({ string: "${a}", context: new GenericContext({ a: [123] }) })
      expect(res).to.eql([123])
    })
  })

  context("when the template string is a part of a string", () => {
    it("should format a resolved number into the string", () => {
      const res = resolveTemplateString({ string: "foo-${a}", context: new GenericContext({ a: 100 }) })
      expect(res).to.equal("foo-100")
    })

    it("should format a resolved boolean true into the string", () => {
      const res = resolveTemplateString({ string: "foo-${a}", context: new GenericContext({ a: true }) })
      expect(res).to.equal("foo-true")
    })

    it("should format a resolved boolean false into the string", () => {
      const res = resolveTemplateString({ string: "foo-${a}", context: new GenericContext({ a: false }) })
      expect(res).to.equal("foo-false")
    })

    it("should format a resolved null into the string", () => {
      const res = resolveTemplateString({ string: "foo-${a}", context: new GenericContext({ a: null }) })
      expect(res).to.equal("foo-null")
    })

    context("allowPartial=true", () => {
      it("does not resolve template expressions when 'b' is missing in the context", () => {
        const res = resolveTemplateString({
          string: "${a}-${b}",
          context: new GenericContext({ a: "foo" }),
          contextOpts: { allowPartial: true },
        })
        expect(res).to.equal("${a}-${b}")
      })

      it("does not resolve template expressions when 'a' is missing in the context", () => {
        const res = resolveTemplateString({
          string: "${a}-${b}",
          context: new GenericContext({ b: "foo" }),
          contextOpts: { allowPartial: true },
        })
        expect(res).to.equal("${a}-${b}")
      })

      it("does not resolve template expressions when 'a' is missing in the context when evaluating a conditional expression", () => {
        const res = resolveTemplateString({
          string: "${a || b}-${c}",
          context: new GenericContext({ b: 123, c: "foo" }),
          contextOpts: {
            allowPartial: true,
          },
        })
        expect(res).to.equal("${a || b}-${c}")
      })

      it("resolves template expressions when the context is fully available", () => {
        const res = resolveTemplateString({
          string: "${a}-${b}",
          context: new GenericContext({ a: "foo", b: "bar" }),
          contextOpts: { allowPartial: true },
        })
        expect(res).to.equal("foo-bar")
      })
    })
  })

  context("contains operator", () => {
    it("should throw when right-hand side is not a primitive", () => {
      const c = new GenericContext({ a: [1, 2], b: [3, 4] })

      void expectError(() => resolveTemplateString({ string: "${a contains b}", context: c }), {
        contains:
          "Invalid template string (${a contains b}): The right-hand side of a 'contains' operator must be a string, number, boolean or null (got object).",
      })
    })

    it("should throw when left-hand side is not a string, array or object", () => {
      const c = new GenericContext({ a: "foo", b: null })

      void expectError(() => resolveTemplateString({ string: "${b contains a}", context: c }), {
        contains:
          "Invalid template string (${b contains a}): The left-hand side of a 'contains' operator must be a string, array or object (got null).",
      })
    })

    it("positive string literal contains string literal", () => {
      const res = resolveTemplateString({ string: "${'foobar' contains 'foo'}", context: new GenericContext({}) })
      expect(res).to.equal(true)
    })

    it("string literal contains string literal (negative)", () => {
      const res = resolveTemplateString({ string: "${'blorg' contains 'blarg'}", context: new GenericContext({}) })
      expect(res).to.equal(false)
    })

    it("string literal contains string reference", () => {
      const res = resolveTemplateString({ string: "${a contains 'foo'}", context: new GenericContext({ a: "foobar" }) })
      expect(res).to.equal(true)
    })

    it("string reference contains string literal (negative)", () => {
      const res = resolveTemplateString({
        string: "${a contains 'blarg'}",
        context: new GenericContext({ a: "foobar" }),
      })
      expect(res).to.equal(false)
    })

    it("string contains number", () => {
      const res = resolveTemplateString({ string: "${a contains 0}", context: new GenericContext({ a: "hmm-0" }) })
      expect(res).to.equal(true)
    })

    it("object contains string literal", () => {
      const res = resolveTemplateString({
        string: "${a contains 'foo'}",
        context: new GenericContext({ a: { foo: 123 } }),
      })
      expect(res).to.equal(true)
    })

    it("object contains string literal (negative)", () => {
      const res = resolveTemplateString({
        string: "${a contains 'bar'}",
        context: new GenericContext({ a: { foo: 123 } }),
      })
      expect(res).to.equal(false)
    })

    it("object contains string reference", () => {
      const res = resolveTemplateString({
        string: "${a contains b}",
        context: new GenericContext({ a: { foo: 123 }, b: "foo" }),
      })
      expect(res).to.equal(true)
    })

    it("object contains number reference", () => {
      const res = resolveTemplateString({
        string: "${a contains b}",
        context: new GenericContext({ a: { 123: 456 }, b: 123 }),
      })
      expect(res).to.equal(true)
    })

    it("object contains number literal", () => {
      const res = resolveTemplateString({
        string: "${a contains 123}",
        context: new GenericContext({ a: { 123: 456 } }),
      })
      expect(res).to.equal(true)
    })

    it("array contains string reference", () => {
      const res = resolveTemplateString({
        string: "${a contains b}",
        context: new GenericContext({ a: ["foo"], b: "foo" }),
      })
      expect(res).to.equal(true)
    })

    it("array contains string reference (negative)", () => {
      const res = resolveTemplateString({
        string: "${a contains b}",
        context: new GenericContext({ a: ["foo"], b: "bar" }),
      })
      expect(res).to.equal(false)
    })

    it("array contains string literal", () => {
      const res = resolveTemplateString({ string: "${a contains 'foo'}", context: new GenericContext({ a: ["foo"] }) })
      expect(res).to.equal(true)
    })

    it("array contains number", () => {
      const res = resolveTemplateString({ string: "${a contains 1}", context: new GenericContext({ a: [0, 1] }) })
      expect(res).to.equal(true)
    })

    it("array contains numeric index (negative)", () => {
      const res = resolveTemplateString({ string: "${a contains 1}", context: new GenericContext({ a: [0] }) })
      expect(res).to.equal(false)
    })
  })

  context("conditional blocks", () => {
    it("single-line if block (positive)", () => {
      const res = resolveTemplateString({
        string: "prefix ${if a}content ${endif}suffix",
        context: new GenericContext({ a: true }),
      })
      expect(res).to.equal("prefix content suffix")
    })

    it("single-line if block (negative)", () => {
      const res = resolveTemplateString({
        string: "prefix ${if a}content ${endif}suffix",
        context: new GenericContext({ a: false }),
      })
      expect(res).to.equal("prefix suffix")
    })

    it("single-line if/else statement (positive)", () => {
      const res = resolveTemplateString({
        string: "prefix ${if a == 123}content ${else}other ${endif}suffix",
        context: new GenericContext({ a: 123 }),
      })
      expect(res).to.equal("prefix content suffix")
    })

    it("single-line if/else statement (negative)", () => {
      const res = resolveTemplateString({
        string: "prefix ${if a}content ${else}other ${endif}suffix",
        context: new GenericContext({ a: false }),
      })
      expect(res).to.equal("prefix other suffix")
    })

    it("multi-line if block (positive)", () => {
      const res = resolveTemplateString({
        string: "prefix\n${if a}content\n${endif}suffix",
        context: new GenericContext({ a: true }),
      })
      expect(res).to.equal(dedent`
        prefix
        content
        suffix
      `)
    })

    it("template string within if block", () => {
      const res = resolveTemplateString({
        string: "prefix\n${if a}templated: ${b}\n${endif}suffix",
        context: new GenericContext({ a: true, b: "content" }),
      })
      expect(res).to.equal(dedent`
        prefix
        templated: content
        suffix
      `)
    })

    it("nested if block (both positive)", () => {
      const res = resolveTemplateString({
        string: "prefix\n${if a}some ${if b}content\n${endif}${endif}suffix",
        context: new GenericContext({ a: true, b: true }),
      })
      expect(res).to.equal(dedent`
        prefix
        some content
        suffix
      `)
    })

    it("nested if block (outer negative)", () => {
      const res = resolveTemplateString({
        string: "prefix\n${if a}some ${if b}content\n${endif}${endif}suffix",
        context: new GenericContext({ a: false, b: true }),
      })
      expect(res).to.equal(dedent`
        prefix
        suffix
      `)
    })

    it("nested if block (inner negative)", () => {
      const res = resolveTemplateString({
        string: "prefix\n${if a}some\n${if b}content\n${endif}${endif}suffix",
        context: new GenericContext({ a: true, b: false }),
      })
      expect(res).to.equal(dedent`
        prefix
        some
        suffix
      `)
    })

    it("if/else statement inside if block", () => {
      const res = resolveTemplateString({
        string: "prefix\n${if a}some\n${if b}nope${else}content\n${endif}${endif}suffix",
        context: new GenericContext({ a: true, b: false }),
      })
      expect(res).to.equal(dedent`
        prefix
        some
        content
        suffix
      `)
    })

    it("if block inside if/else statement", () => {
      const res = resolveTemplateString({
        string: "prefix\n${if a}some\n${if b}content\n${endif}${else}nope ${endif}suffix",
        context: new GenericContext({ a: true, b: false }),
      })
      expect(res).to.equal(dedent`
        prefix
        some
        suffix
      `)
    })

    it("throws if an if block has an optional suffix", () => {
      void expectError(
        () =>
          resolveTemplateString({
            string: "prefix ${if a}?content ${endif}",
            context: new GenericContext({ a: true }),
          }),
        {
          contains:
            "Invalid template string (prefix ${if a}?content ${endif}): Cannot specify optional suffix in if-block.",
        }
      )
    })

    it("throws if an if block doesn't have a matching endif", () => {
      void expectError(
        () => resolveTemplateString({ string: "prefix ${if a}content", context: new GenericContext({ a: true }) }),
        {
          contains: "Invalid template string (prefix ${if a}content): Missing ${endif} after ${if ...} block.",
        }
      )
    })
    it("throws if an if block doesn't have a matching endif inside another if block that is closed", () => {
      void expectError(
        () =>
          resolveTemplateString({
            string: '${if "foo"}${if "this is bananas!"}${endif}',
            context: new GenericContext({ a: true }),
          }),
        {
          contains:
            'Invalid template string (${if "foo"}${if "this is bananas!"}${endif}): Missing ${endif} after ${if ...} block.',
        }
      )
    })

    it("throws if an endif block doesn't have a matching if", () => {
      void expectError(
        () => resolveTemplateString({ string: "prefix content ${endif}", context: new GenericContext({ a: true }) }),
        {
          contains:
            "Invalid template string (prefix content ${endif}): Found ${endif} block without a preceding ${if...} block.",
        }
      )
    })

    it("throws if an if block doesn't have a matching endif and there is content", () => {
      void expectError(
        () => resolveTemplateString({ string: "${if a}content", context: new GenericContext({ a: true }) }),
        {
          contains: "Invalid template string (${if a}content): Missing ${endif} after ${if ...} block.",
        }
      )
    })
  })

  context("helper functions", () => {
    it("resolves a helper function with a string literal", () => {
      const res = resolveTemplateString({ string: "${base64Encode('foo')}", context: new GenericContext({}) })
      expect(res).to.equal("Zm9v")
    })

    it("resolves a template string in a helper argument", () => {
      const res = resolveTemplateString({
        string: "${base64Encode('${a}')}",
        context: new GenericContext({ a: "foo" }),
      })
      expect(res).to.equal("Zm9v")
    })

    it("resolves a helper function with multiple arguments", () => {
      const res = resolveTemplateString({ string: "${split('a,b,c', ',')}", context: new GenericContext({}) })
      expect(res).to.eql(["a", "b", "c"])
    })

    it("resolves a helper function with a template key reference", () => {
      const res = resolveTemplateString({ string: "${base64Encode(a)}", context: new GenericContext({ a: "foo" }) })
      expect(res).to.equal("Zm9v")
    })

    it("generates a correct hash with a string literal from the sha256 helper function", () => {
      const res = resolveTemplateString({
        string: "${sha256('This Is A Test String')}",
        context: new GenericContext({}),
      })
      expect(res).to.equal("9a058284378d1cc6b4348aacb6ba847918376054b094bbe06eb5302defc52685")
    })

    it("throws if an argument is missing", () => {
      void expectError(() => resolveTemplateString({ string: "${base64Decode()}", context: new GenericContext({}) }), {
        contains:
          "Invalid template string (${base64Decode()}): Missing argument 'string' (at index 0) for base64Decode helper function.",
      })
    })

    it("throws if a wrong argument type is passed", () => {
      void expectError(
        () => resolveTemplateString({ string: "${base64Decode(a)}", context: new GenericContext({ a: 1234 }) }),
        {
          contains:
            "Invalid template string (${base64Decode(a)}): Error validating argument 'string' for base64Decode helper function:\n\nvalue must be a string",
        }
      )
    })

    it("throws if the function can't be found", () => {
      void expectError(() => resolveTemplateString({ string: "${floop('blop')}", context: new GenericContext({}) }), {
        contains:
          "Invalid template string (${floop('blop')}): Could not find helper function 'floop'. Available helper functions:",
      })
    })

    it("throws if the function fails", () => {
      void expectError(
        () => resolveTemplateString({ string: "${jsonDecode('{]}')}", context: new GenericContext({}) }),
        {
          contains:
            "Invalid template string (${jsonDecode('{]}')}): Error from helper function jsonDecode: SyntaxError",
        }
      )
    })

    it("does not apply helper function on unresolved template string and returns string as-is, when allowPartial=true", () => {
      const res = resolveTemplateString({
        string: "${base64Encode('${environment.namespace}')}",
        context: new GenericContext({}),
        contextOpts: {
          allowPartial: true,
        },
      })
      expect(res).to.equal("${base64Encode('${environment.namespace}')}")
    })

    it("does not apply helper function on unresolved template object and returns string as-is, when allowPartial=true", () => {
      const res = resolveTemplateString({
        string: "${base64Encode(var.foo)}",
        context: new GenericContext({ foo: { $forEach: ["a", "b"], $return: "${item.value}" } }),
        contextOpts: {
          allowPartial: true,
        },
      })
      expect(res).to.equal("${base64Encode(var.foo)}")
    })

    context("concat", () => {
      it("allows empty strings", () => {
        const res = resolveTemplateString({ string: "${concat('', '')}", context: new GenericContext({}) })
        expect(res).to.equal("")
      })

      context("throws when", () => {
        function expectArgTypeError({
          template,
          GenericContextVars = {},
          errorMessage,
        }: {
          template: string
          GenericContextVars?: object
          errorMessage: string
        }) {
          void expectError(
            () => resolveTemplateString({ string: template, context: new GenericContext(GenericContextVars) }),
            {
              contains: `Invalid template string (\${concat(a, b)}): ${errorMessage}`,
            }
          )
        }

        it("using an incompatible argument types (string and object)", () => {
          return expectArgTypeError({
            template: "${concat(a, b)}",
            GenericContextVars: {
              a: "123",
              b: ["a"],
            },
            errorMessage:
              "Error from helper function concat: Error: Both terms need to be either arrays or strings (got string and object).",
          })
        })

        it("using an unsupported argument types (number and object)", () => {
          return expectArgTypeError({
            template: "${concat(a, b)}",
            GenericContextVars: {
              a: 123,
              b: ["a"],
            },
            errorMessage:
              "Error validating argument 'arg1' for concat helper function:\n\nvalue must be one of [array, string]",
          })
        })
      })
    })

    context("isEmpty", () => {
      context("allows nulls", () => {
        it("resolves null as 'true'", () => {
          const res = resolveTemplateString({ string: "${isEmpty(null)}", context: new GenericContext({}) })
          expect(res).to.be.true
        })

        it("resolves references to null as 'true'", () => {
          const res = resolveTemplateString({ string: "${isEmpty(a)}", context: new GenericContext({ a: null }) })
          expect(res).to.be.true
        })
      })

      context("allows empty strings", () => {
        it("resolves an empty string as 'true'", () => {
          const res = resolveTemplateString({ string: "${isEmpty('')}", context: new GenericContext({}) })
          expect(res).to.be.true
        })

        it("resolves a reference to an empty string as 'true'", () => {
          const res = resolveTemplateString({ string: "${isEmpty(a)}", context: new GenericContext({ a: "" }) })
          expect(res).to.be.true
        })
      })
    })

    context("slice", () => {
      it("allows numeric indices", () => {
        const res = resolveTemplateString({
          string: "${slice(foo, 0, 3)}",
          context: new GenericContext({ foo: "abcdef" }),
        })
        expect(res).to.equal("abc")
      })

      it("allows numeric strings as indices", () => {
        const res = resolveTemplateString({
          string: "${slice(foo, '0', '3')}",
          context: new GenericContext({ foo: "abcdef" }),
        })
        expect(res).to.equal("abc")
      })

      it("throws on invalid string in the start index", () => {
        void expectError(
          () =>
            resolveTemplateString({ string: "${slice(foo, 'a', 3)}", context: new GenericContext({ foo: "abcdef" }) }),
          {
            contains: `Invalid template string (\${slice(foo, 'a', 3)}): Error from helper function slice: Error: start index must be a number or a numeric string (got "a")`,
          }
        )
      })

      it("throws on invalid string in the end index", () => {
        void expectError(
          () =>
            resolveTemplateString({ string: "${slice(foo, 0, 'b')}", context: new GenericContext({ foo: "abcdef" }) }),
          {
            contains: `Invalid template string (\${slice(foo, 0, 'b')}): Error from helper function slice: Error: end index must be a number or a numeric string (got "b")`,
          }
        )
      })
    })
  })

  context("array literals", () => {
    it("returns an empty array literal back", () => {
      const res = resolveTemplateString({ string: "${[]}", context: new GenericContext({}) })
      expect(res).to.eql([])
    })

    it("returns an array literal of literals back", () => {
      const res = resolveTemplateString({
        string: "${['foo', \"bar\", 123, true, false]}",
        context: new GenericContext({}),
      })
      expect(res).to.eql(["foo", "bar", 123, true, false])
    })

    it("resolves a key in an array literal", () => {
      const res = resolveTemplateString({ string: "${[foo]}", context: new GenericContext({ foo: "bar" }) })
      expect(res).to.eql(["bar"])
    })

    it("resolves a nested key in an array literal", () => {
      const res = resolveTemplateString({
        string: "${[foo.bar]}",
        context: new GenericContext({ foo: { bar: "baz" } }),
      })
      expect(res).to.eql(["baz"])
    })

    it("calls a helper in an array literal", () => {
      const res = resolveTemplateString({
        string: "${[foo, base64Encode('foo')]}",
        context: new GenericContext({ foo: "bar" }),
      })
      expect(res).to.eql(["bar", "Zm9v"])
    })

    it("calls a helper with an array literal argument", () => {
      const res = resolveTemplateString({ string: "${join(['foo', 'bar'], ',')}", context: new GenericContext({}) })
      expect(res).to.eql("foo,bar")
    })

    it("allows empty string separator in join helper function", () => {
      const res = resolveTemplateString({ string: "${join(['foo', 'bar'], '')}", context: new GenericContext({}) })
      expect(res).to.eql("foobar")
    })
  })
})

describe("resolveTemplateStrings", () => {
  it("should resolve all template strings in an object with the given context", () => {
    const obj = {
      some: "${key}",
      other: {
        nested: "${something}",
        noTemplate: "at-all",
      },
    }
    const templateContext = new GenericContext({
      key: "value",
      something: "else",
    })

    const result = resolveTemplateStrings({ source: undefined, value: obj, context: templateContext })

    expect(result).to.eql({
      some: "value",
      other: {
        nested: "else",
        noTemplate: "at-all",
      },
    })
  })

  it("should correctly handle optional template strings", () => {
    const obj = {
      some: "${key}?",
      other: "${missing}?",
    }
    const templateContext = new GenericContext({
      key: "value",
    })

    const result = resolveTemplateStrings({ source: undefined, value: obj, context: templateContext })

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
    const templateContext = new GenericContext({})

    const result = resolveTemplateStrings({ source: undefined, value: obj, context: templateContext })

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
    const templateContext = new GenericContext({})

    const result = resolveTemplateStrings({ source: undefined, value: obj, context: templateContext })

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
    const templateContext = new GenericContext({ obj: { a: "a", b: "b" } })

    const result = resolveTemplateStrings({ source: undefined, value: obj, context: templateContext })

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
    const templateContext = new GenericContext({ obj: { b: "b" } })

    const result = resolveTemplateStrings({ source: undefined, value: obj, context: templateContext })

    expect(result).to.eql({
      a: "a",
      b: "b",
      c: "c",
    })
  })

  it("should resolve $merge keys if one object is undefined but it can fall back to another object", () => {
    const obj = {
      $merge: "${var.doesnotexist || var.obj}",
      c: "c",
    }
    const templateContext = new GenericContext({ var: { obj: { a: "a", b: "b" } } })

    const result = resolveTemplateStrings({ value: obj, context: templateContext, source: undefined })

    expect(result).to.eql({
      a: "a",
      b: "b",
      c: "c",
    })
  })

  it("should partially resolve $merge keys if a dependency cannot be resolved yet in partial mode", () => {
    const obj = {
      "key-value-array": {
        $forEach: "${inputs.merged-object || []}",
        $return: {
          name: "${item.key}",
          value: "${item.value}",
        },
      },
    }
    const templateContext = new GenericContext({
      inputs: {
        "merged-object": {
          $merge: "${var.empty || var.input-object}",
          INTERNAL_VAR_1: "INTERNAL_VAR_1",
        },
      },
      var: {
        "input-object": {
          EXTERNAL_VAR_1: "EXTERNAL_VAR_1",
        },
      },
    })

    const result = resolveTemplateStrings({
      value: obj,
      context: templateContext,
      contextOpts: { allowPartial: true },
      source: undefined,
    })

    expect(result).to.eql({
      "key-value-array": {
        $forEach: "${inputs.merged-object || []}",
        $return: {
          name: "${item.key}",
          value: "${item.value}",
        },
      },
    })
  })

  it("should resolve $merge keys if a dependency cannot be resolved but there's a fallback", () => {
    const obj = {
      "key-value-array": {
        $forEach: "${inputs.merged-object || []}",
        $return: {
          name: "${item.key}",
          value: "${item.value}",
        },
      },
    }
    const templateContext = new GenericContext({
      inputs: {
        "merged-object": {
          $merge: "${var.empty || var.input-object}",
          INTERNAL_VAR_1: "INTERNAL_VAR_1",
        },
      },
      var: {
        "input-object": {
          EXTERNAL_VAR_1: "EXTERNAL_VAR_1",
        },
      },
    })

    const result = resolveTemplateStrings({ value: obj, context: templateContext, source: undefined })

    expect(result).to.eql({
      "key-value-array": [
        { name: "EXTERNAL_VAR_1", value: "EXTERNAL_VAR_1" },
        { name: "INTERNAL_VAR_1", value: "INTERNAL_VAR_1" },
      ],
    })
  })

  it("should ignore $merge keys if the object to be merged is undefined", () => {
    const obj = {
      $merge: "${var.doesnotexist}",
      c: "c",
    }
    const templateContext = new GenericContext({ var: { obj: { a: "a", b: "b" } } })

    expect(() => resolveTemplateStrings({ value: obj, context: templateContext, source: undefined })).to.throw(
      "Invalid template string"
    )
  })

  context("$concat", () => {
    it("handles array concatenation", () => {
      const obj = {
        foo: ["a", { $concat: ["b", "c"] }, "d"],
      }
      const res = resolveTemplateStrings({ source: undefined, value: obj, context: new GenericContext({}) })
      expect(res).to.eql({
        foo: ["a", "b", "c", "d"],
      })
    })

    it("resolves $concat value before spreading", () => {
      const obj = {
        foo: ["a", { $concat: "${foo}" }, "d"],
      }
      const res = resolveTemplateStrings({
        source: undefined,
        value: obj,
        context: new GenericContext({ foo: ["b", "c"] }),
      })
      expect(res).to.eql({
        foo: ["a", "b", "c", "d"],
      })
    })

    it("resolves a $forEach in the $concat clause", () => {
      const obj = {
        foo: ["a", { $concat: { $forEach: ["B", "C"], $return: "${lower(item.value)}" } }, "d"],
      }
      const res = resolveTemplateStrings({
        source: undefined,
        value: obj,
        context: new GenericContext({ foo: ["b", "c"] }),
      })
      expect(res).to.eql({
        foo: ["a", "b", "c", "d"],
      })
    })

    it("throws if $concat value is not an array and allowPartial=false", () => {
      const obj = {
        foo: ["a", { $concat: "b" }, "d"],
      }

      void expectError(
        () => resolveTemplateStrings({ source: undefined, value: obj, context: new GenericContext({}) }),
        {
          contains: "Value of $concat key must be (or resolve to) an array (got string)",
        }
      )
    })

    it("throws if object with $concat key contains other keys as well", () => {
      const obj = {
        foo: ["a", { $concat: "b", nope: "nay", oops: "derp" }, "d"],
      }

      void expectError(
        () => resolveTemplateStrings({ source: undefined, value: obj, context: new GenericContext({}) }),
        {
          contains: 'A list item with a $concat key cannot have any other keys (found "nope" and "oops")',
        }
      )
    })

    it("ignores if $concat value is not an array and allowPartial=true", () => {
      const obj = {
        foo: ["a", { $concat: "${foo}" }, "d"],
      }
      const res = resolveTemplateStrings({
        source: undefined,
        value: obj,
        context: new GenericContext({}),
        contextOpts: { allowPartial: true },
      })
      expect(res).to.eql({
        foo: ["a", { $concat: "${foo}" }, "d"],
      })
    })
  })

  context("$if objects", () => {
    it("resolves to $then if $if is true", () => {
      const obj = {
        bar: {
          $if: "${foo == 1}",
          $then: 123,
          $else: 456,
        },
      }
      const res = resolveTemplateStrings({ source: undefined, value: obj, context: new GenericContext({ foo: 1 }) })
      expect(res).to.eql({ bar: 123 })
    })

    it("resolves to $else if $if is false", () => {
      const obj = {
        bar: {
          $if: "${foo == 1}",
          $then: 123,
          $else: 456,
        },
      }
      const res = resolveTemplateStrings({ source: undefined, value: obj, context: new GenericContext({ foo: 2 }) })
      expect(res).to.eql({ bar: 456 })
    })

    it("resolves to undefined if $if is false and $else is missing", () => {
      const obj = {
        bar: {
          $if: "${foo == 1}",
          $then: 123,
        },
      }
      const res = resolveTemplateStrings({ source: undefined, value: obj, context: new GenericContext({ foo: 2 }) })
      expect(res).to.eql({ bar: undefined })
    })

    it("returns object as-is if $if doesn't resolve to boolean and allowPartial=true", () => {
      const obj = {
        bar: {
          $if: "${foo}",
          $then: 123,
          $else: 456,
        },
      }
      const res = resolveTemplateStrings({
        source: undefined,
        value: obj,
        context: new GenericContext({ foo: 2 }),
        contextOpts: { allowPartial: true },
      })
      expect(res).to.eql(obj)
    })

    it("throws if $if doesn't resolve to boolean and allowPartial=false", () => {
      const obj = {
        bar: {
          $if: "${foo}",
          $then: 123,
        },
      }

      void expectError(
        () => resolveTemplateStrings({ source: undefined, value: obj, context: new GenericContext({ foo: "bla" }) }),
        {
          contains: "Value of $if key must be (or resolve to) a boolean (got string)",
        }
      )
    })

    it("throws if $then key is missing", () => {
      const obj = {
        bar: {
          $if: "${foo == 1}",
        },
      }

      void expectError(
        () => resolveTemplateStrings({ source: undefined, value: obj, context: new GenericContext({ foo: 1 }) }),
        {
          contains: "Missing $then field next to $if field",
        }
      )
    })

    it("throws if extra keys are found", () => {
      const obj = {
        bar: {
          $if: "${foo == 1}",
          $then: 123,
          foo: "bla",
        },
      }

      void expectError(
        () => resolveTemplateStrings({ source: undefined, value: obj, context: new GenericContext({ foo: 1 }) }),
        {
          contains: 'Found one or more unexpected keys on $if object: "foo"',
        }
      )
    })
  })

  context("$forEach", () => {
    it("loops through an array", () => {
      const obj = {
        foo: {
          $forEach: ["a", "b", "c"],
          $return: "foo",
        },
      }
      const res = resolveTemplateStrings({ source: undefined, value: obj, context: new GenericContext({}) })
      expect(res).to.eql({
        foo: ["foo", "foo", "foo"],
      })
    })

    it("loops through an object", () => {
      const obj = {
        foo: {
          $forEach: {
            a: 1,
            b: 2,
            c: 3,
          },
          $return: "${item.key}: ${item.value}",
        },
      }
      const res = resolveTemplateStrings({ source: undefined, value: obj, context: new GenericContext({}) })
      expect(res).to.eql({
        foo: ["a: 1", "b: 2", "c: 3"],
      })
    })

    it("throws if the input isn't a list or object and allowPartial=false", () => {
      const obj = {
        foo: {
          $forEach: "foo",
          $return: "foo",
        },
      }

      void expectError(
        () => resolveTemplateStrings({ source: undefined, value: obj, context: new GenericContext({}) }),
        {
          contains: "Value of $forEach key must be (or resolve to) an array or mapping object (got string)",
        }
      )
    })

    it("ignores the loop if the input isn't a list or object and allowPartial=true", () => {
      const obj = {
        foo: {
          $forEach: "${foo}",
          $return: "foo",
        },
      }
      const res = resolveTemplateStrings({
        source: undefined,
        value: obj,
        context: new GenericContext({}),
        contextOpts: { allowPartial: true },
      })
      expect(res).to.eql(obj)
    })

    it("throws if there's no $return clause", () => {
      const obj = {
        foo: {
          $forEach: [1, 2, 3],
        },
      }

      void expectError(
        () => resolveTemplateStrings({ source: undefined, value: obj, context: new GenericContext({}) }),
        {
          contains: "Missing $return field next to $forEach field.",
        }
      )
    })

    it("throws if there are superfluous keys on the object", () => {
      const obj = {
        foo: {
          $forEach: [1, 2, 3],
          $return: "foo",
          $concat: [4, 5, 6],
          foo: "bla",
        },
      }

      void expectError(
        () => resolveTemplateStrings({ source: undefined, value: obj, context: new GenericContext({}) }),
        {
          contains: 'Found one or more unexpected keys on $forEach object: "$concat" and "foo"',
        }
      )
    })

    it("exposes item.value and item.key when resolving the $return clause", () => {
      const obj = {
        foo: {
          $forEach: "${foo}",
          $return: "${item.key}: ${item.value}",
        },
      }
      const res = resolveTemplateStrings({
        source: undefined,
        value: obj,
        context: new GenericContext({ foo: ["a", "b", "c"] }),
      })
      expect(res).to.eql({
        foo: ["0: a", "1: b", "2: c"],
      })
    })

    it("resolves the input before processing", () => {
      const obj = {
        foo: {
          $forEach: "${foo}",
          $return: "${item.value}",
        },
      }
      const res = resolveTemplateStrings({
        source: undefined,
        value: obj,
        context: new GenericContext({ foo: ["a", "b", "c"] }),
      })
      expect(res).to.eql({
        foo: ["a", "b", "c"],
      })
    })

    it("filters out items if $filter resolves to false", () => {
      const obj = {
        foo: {
          $forEach: "${foo}",
          $filter: "${item.value != 'b'}",
          $return: "${item.value}",
        },
      }
      const res = resolveTemplateStrings({
        source: undefined,
        value: obj,
        context: new GenericContext({ foo: ["a", "b", "c"] }),
      })
      expect(res).to.eql({
        foo: ["a", "c"],
      })
    })

    it("throws if $filter doesn't resolve to a boolean", () => {
      const obj = {
        foo: {
          $forEach: ["a", "b", "c"],
          $filter: "foo",
          $return: "${item.value}",
        },
      }

      void expectError(
        () => resolveTemplateStrings({ source: undefined, value: obj, context: new GenericContext({}) }),
        {
          contains: "$filter clause in $forEach loop must resolve to a boolean value (got object)",
        }
      )
    })

    it("handles $concat clauses in $return", () => {
      const obj = {
        foo: {
          $forEach: ["a", "b", "c"],
          $return: {
            $concat: ["${item.value}-1", "${item.value}-2"],
          },
        },
      }
      const res = resolveTemplateStrings({ source: undefined, value: obj, context: new GenericContext({}) })
      expect(res).to.eql({
        foo: ["a-1", "a-2", "b-1", "b-2", "c-1", "c-2"],
      })
    })

    it("handles $forEach clauses in $return", () => {
      const obj = {
        foo: {
          $forEach: [
            ["a1", "a2"],
            ["b1", "b2"],
          ],
          $return: {
            $forEach: "${item.value}",
            $return: "${upper(item.value)}",
          },
        },
      }
      const res = resolveTemplateStrings({ source: undefined, value: obj, context: new GenericContext({}) })
      expect(res).to.eql({
        foo: [
          ["A1", "A2"],
          ["B1", "B2"],
        ],
      })
    })

    it("resolves to empty list for empty list input", () => {
      const obj = {
        foo: {
          $forEach: [],
          $return: "foo",
        },
      }
      const res = resolveTemplateStrings({ source: undefined, value: obj, context: new GenericContext({}) })
      expect(res).to.eql({
        foo: [],
      })
    })

    it("$merge should correctly merge objects with overlapping property names inside $forEach loop", () => {
      const services = [
        {
          "env-overrides": {},
          "service-props": {
            name: "tmp",
            command: ["sh", "run.sh"],
          },
        },
        {
          "env-overrides": {
            ENABLE_TMP: "true",
          },
          "service-props": {
            name: "tmp-admin",
            command: ["sh", "run.sh"],
          },
        },
      ]
      const obj = {
        services: {
          $forEach: "${services}",
          $return: {
            $merge: "${item.value.service-props}",
            env: {
              ALLOW_DATABASE_RESET: "true",
              $merge: "${item.value.env-overrides}",
            },
          },
        },
      }

      const res = resolveTemplateStrings({ source: undefined, value: obj, context: new GenericContext({ services }) })
      expect(res).to.eql({
        services: [
          {
            command: ["sh", "run.sh"],
            env: {
              ALLOW_DATABASE_RESET: "true",
            },
            name: "tmp",
          },
          {
            command: ["sh", "run.sh"],
            env: {
              ALLOW_DATABASE_RESET: "true",
              ENABLE_TMP: "true",
            },
            name: "tmp-admin",
          },
        ],
      })
    })
  })
})

describe("getContextLookupReferences", () => {
  it("should return all template string references in an object", () => {
    const obj = {
      foo: "${my.reference}",
      nested: {
        boo: "${moo}",
        foo: "lalalla${moo}${moo}",
        banana: "${banana.rama.llama}",
      },
    }

    const result = Array.from(
      getContextLookupReferences(
        visitAll({
          value: obj,
          parseTemplateStrings: true,
          source: {
            path: [],
          },
        }),
        new GenericContext({})
      )
    )
    const expected: ContextLookupReferenceFinding[] = [
      {
        keyPath: ["my", "reference"],
        type: "resolvable",
        yamlSource: {
          path: ["foo"],
        },
      },
      {
        keyPath: ["moo"],
        type: "resolvable",
        yamlSource: {
          path: ["nested", "boo"],
        },
      },
      {
        keyPath: ["moo"],
        type: "resolvable",
        yamlSource: {
          path: ["nested", "foo"],
        },
      },
      {
        keyPath: ["moo"],
        type: "resolvable",
        yamlSource: {
          path: ["nested", "foo"],
        },
      },
      {
        keyPath: ["banana", "rama", "llama"],
        type: "resolvable",
        yamlSource: {
          path: ["nested", "banana"],
        },
      },
    ]
    expect(result).to.eql(expected)
  })

  it("should handle keys with dots and unresolvable member expressions correctly", async () => {
    const obj = {
      a: "some ${templated['key.with.dots']}",
      b: "${more.stuff}",
      c: "${keyThatIs[unresolvable]}",
      d: '${keyThatIs["${unresolvable}"]}',
      e: "${optionalAndUnresolvable}?",
      f: "${keyThatIs[availableLater]}",
      g: '${keyThatIs["${availableLater}"]}',
    }
    const foundKeys = Array.from(
      getContextLookupReferences(
        visitAll({
          value: obj,
          parseTemplateStrings: true,
          source: {
            path: [],
          },
        }),
        new GenericContext({
          availableLater: CONTEXT_RESOLVE_KEY_AVAILABLE_LATER,
        })
      )
    )

    const expected: ContextLookupReferenceFinding[] = [
      {
        type: "resolvable",
        keyPath: ["templated", "key.with.dots"],
        yamlSource: {
          path: ["a"],
        },
      },
      {
        type: "resolvable",
        keyPath: ["more", "stuff"],
        yamlSource: {
          path: ["b"],
        },
      },
      {
        type: "resolvable",
        keyPath: ["unresolvable"],
        yamlSource: {
          path: ["c"],
        },
      },
      {
        type: "unresolvable",
        keyPath: ["keyThatIs", foundKeys[3].keyPath[1]],
        yamlSource: {
          path: ["c"],
        },
      },
      {
        type: "resolvable",
        keyPath: ["unresolvable"],
        yamlSource: {
          path: ["d"],
        },
      },
      {
        type: "unresolvable",
        keyPath: ["keyThatIs", foundKeys[5].keyPath[1]],
        yamlSource: {
          path: ["d"],
        },
      },
      {
        type: "resolvable",
        keyPath: ["optionalAndUnresolvable"],
        yamlSource: {
          path: ["e"],
        },
      },
      {
        type: "resolvable",
        keyPath: ["availableLater"],
        yamlSource: {
          path: ["f"],
        },
      },
      {
        type: "unresolvable",
        keyPath: ["keyThatIs", foundKeys[8].keyPath[1]],
        yamlSource: {
          path: ["f"],
        },
      },
      {
        type: "resolvable",
        keyPath: ["availableLater"],
        yamlSource: {
          path: ["g"],
        },
      },
      {
        type: "unresolvable",
        keyPath: ["keyThatIs", foundKeys[10].keyPath[1]],
        yamlSource: { path: ["g"] },
      },
    ]
    expect(foundKeys, `Unexpected found keys. JSON: ${JSON.stringify(foundKeys)}`).to.deep.equals(expected)

    const unresolvable1 = foundKeys[3].keyPath[1] as UnresolvableValue
    expect(unresolvable1).to.be.instanceOf(UnresolvableValue)
    expectFuzzyMatch(
      unresolvable1.getError().message,
      "invalid template string (${keythatis[unresolvable]}) at path c: could not find key unresolvable."
    )

    const unresolvable2 = foundKeys[5].keyPath[1] as UnresolvableValue
    expect(unresolvable2).to.be.instanceOf(UnresolvableValue)
    expectFuzzyMatch(
      unresolvable2.getError().message,
      "invalid template string (${unresolvable}) at path d: could not find key unresolvable."
    )

    const availableLater1 = foundKeys[8].keyPath[1] as UnresolvableValue
    expect(availableLater1).to.be.instanceOf(UnresolvableValue)
    expectFuzzyMatch(
      availableLater1.getError().message,
      "invalid template string (${keythatis[availablelater]}) at path f: could not find key availableLater."
    )

    const availableLater2 = foundKeys[10].keyPath[1] as UnresolvableValue
    expect(availableLater2).to.be.instanceOf(UnresolvableValue)
    expectFuzzyMatch(
      availableLater2.getError().message,
      "invalid template string (${availablelater}) at path g: could not find key availableLater."
    )
  })
})

describe("getActionTemplateReferences", () => {
  context("actions.*", () => {
    it("returns valid action references", () => {
      const config = {
        build: '${actions["build"].build-a}',
        buildFoo: '${actions["build"].build-a.outputs.foo}',
        deploy: '${actions["deploy"].deploy-a}',
        deployFoo: '${actions["deploy"].deploy-a.outputs.foo}',
        run: '${actions["run"].run-a}',
        runFoo: '${actions["run"].run-a.outputs.foo}',
        test: '${actions["test"].test-a}',
        testFoo: '${actions["test"].test-a.outputs.foo}',
      }
      const actionTemplateReferences = Array.from(getActionTemplateReferences(config as any, new GenericContext({})))
      expect(actionTemplateReferences).to.eql([
        {
          kind: "Build",
          name: "build-a",
          keyPath: [],
        },
        {
          kind: "Build",
          name: "build-a",
          keyPath: ["outputs", "foo"],
        },
        {
          kind: "Deploy",
          name: "deploy-a",
          keyPath: [],
        },
        {
          kind: "Deploy",
          name: "deploy-a",
          keyPath: ["outputs", "foo"],
        },
        {
          kind: "Run",
          name: "run-a",
          keyPath: [],
        },
        {
          kind: "Run",
          name: "run-a",
          keyPath: ["outputs", "foo"],
        },
        {
          kind: "Test",
          name: "test-a",
          keyPath: [],
        },
        {
          kind: "Test",
          name: "test-a",
          keyPath: ["outputs", "foo"],
        },
      ])
    })

    it("throws if action ref has no kind", () => {
      const config = {
        foo: "${actions}",
      }
      void expectError(() => Array.from(getActionTemplateReferences(config as any, new GenericContext({}))), {
        contains: "Found invalid action reference (missing kind)",
      })
    })

    it("throws if action ref has invalid kind", () => {
      const config = {
        foo: '${actions["badkind"].some-name}',
      }
      void expectError(() => Array.from(getActionTemplateReferences(config as any, new GenericContext({}))), {
        contains: "Found invalid action reference (invalid kind 'badkind')",
      })
    })

    it("throws if action kind is not a string", () => {
      const config = {
        foo: "${actions[123]}",
      }
      void expectError(() => Array.from(getActionTemplateReferences(config as any, new GenericContext({}))), {
        contains: "Found invalid action reference (kind is not a string)",
      })
    })

    it("throws if action kind is not resolvable", () => {
      const config = {
        foo: "${actions[foo.bar].some-name}",
      }
      void expectError(() => Array.from(getActionTemplateReferences(config as any, new GenericContext({}))), {
        contains:
          "found invalid action reference: invalid template string (${actions[foo.bar].some-name}) at path foo: could not find key foo. available keys: (none)",
      })
    })

    it("throws if dynamic action kind is invalid", () => {
      const config = {
        foo: '${actions[foo.bar || "hello"].some-name}',
      }
      void expectError(() => Array.from(getActionTemplateReferences(config as any, new GenericContext({}))), {
        contains: "found invalid action reference (invalid kind 'hello')",
      })
    })

    it("throws if action ref has no name", () => {
      const config = {
        foo: '${actions["build"]}',
      }
      void expectError(() => Array.from(getActionTemplateReferences(config as any, new GenericContext({}))), {
        contains: "Found invalid action reference (missing name)",
      })
    })

    it("throws if action name is not a string in identifier expression", () => {
      const config = {
        foo: '${actions["build"].123}',
      }
      void expectError(() => Array.from(getActionTemplateReferences(config as any, new GenericContext({}))), {
        contains: "Found invalid action reference (name is not a string)",
      })
    })

    it("throws if action name is not a string in member expression", () => {
      const config = {
        foo: '${actions["build"][123]}',
      }
      void expectError(() => Array.from(getActionTemplateReferences(config as any, new GenericContext({}))), {
        contains: "Found invalid action reference (name is not a string)",
      })
    })
  })

  context("runtime.*", () => {
    it("returns valid runtime references", () => {
      const config = {
        services: '${runtime["services"].service-a}',
        servicesFoo: '${runtime["services"].service-a.outputs.foo}',
        tasks: '${runtime["tasks"].task-a}',
        tasksFoo: '${runtime["tasks"].task-a.outputs.foo}',
      }
      const actionTemplateReferences = Array.from(getActionTemplateReferences(config as any, new GenericContext({})))
      expect(actionTemplateReferences).to.eql([
        {
          kind: "Deploy",
          name: "service-a",
          keyPath: [],
        },
        {
          kind: "Deploy",
          name: "service-a",
          keyPath: ["outputs", "foo"],
        },
        {
          kind: "Run",
          name: "task-a",
          keyPath: [],
        },
        {
          kind: "Run",
          name: "task-a",
          keyPath: ["outputs", "foo"],
        },
      ])
    })

    it("throws if runtime ref has no kind", () => {
      const config = {
        foo: "${runtime}",
      }
      void expectError(() => Array.from(getActionTemplateReferences(config as any, new GenericContext({}))), {
        contains: "Found invalid runtime reference (missing kind)",
      })
    })

    it("throws if runtime ref has invalid kind", () => {
      const config = {
        foo: '${runtime["badkind"].some-name}',
      }
      void expectError(() => Array.from(getActionTemplateReferences(config as any, new GenericContext({}))), {
        contains: "Found invalid runtime reference (invalid kind 'badkind')",
      })
    })

    it("throws if runtime kind is not a string", () => {
      const config = {
        foo: "${runtime[123]}",
      }
      void expectError(() => Array.from(getActionTemplateReferences(config as any, new GenericContext({}))), {
        contains: "Found invalid runtime reference (kind is not a string)",
      })
    })

    it("throws if runtime kind is not resolvable", () => {
      const config = {
        foo: "${runtime[foo.bar].some-name}",
      }
      void expectError(() => Array.from(getActionTemplateReferences(config as any, new GenericContext({}))), {
        contains:
          "found invalid runtime reference: invalid template string (${runtime[foo.bar].some-name}) at path foo: could not find key foo. available keys: (none).",
      })
    })

    it("throws if runtime ref has no name", () => {
      const config = {
        foo: '${runtime["tasks"]}',
      }
      void expectError(() => Array.from(getActionTemplateReferences(config as any, new GenericContext({}))), {
        contains: "Found invalid runtime reference (missing name)",
      })
    })

    it("throws if runtime ref name is not a string", () => {
      const config = {
        foo: '${runtime["tasks"].123}',
      }
      void expectError(() => Array.from(getActionTemplateReferences(config as any, new GenericContext({}))), {
        contains: "Found invalid runtime reference (name is not a string)",
      })
    })
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

    throwOnMissingSecretKeys(configs, new GenericContext({}), {}, "Module")
    throwOnMissingSecretKeys(configs, new GenericContext({}), { someSecret: "123" }, "Module")
  })

  it("should throw an error if one or more secrets is missing", () => {
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

    void expectError(
      () => throwOnMissingSecretKeys(configs, new GenericContext({}), { b: "123" }, "Module"),
      (err) => {
        expect(err.message).to.match(/Module moduleA: a/)
        expect(err.message).to.match(/Module moduleB: a, c/)
        expect(err.message).to.match(/Secret keys with loaded values: b/)
      }
    )

    void expectError(
      () => throwOnMissingSecretKeys(configs, new GenericContext({}), {}, "Module"),
      (err) => {
        expect(err.message).to.match(/Module moduleA: a, b/)
        expect(err.message).to.match(/Module moduleB: a, b, c/)
        expect(err.message).to.match(/Note: No secrets have been loaded./)
      }
    )
  })
})

describe("functional tests", () => {
  context("cross-context variable references", () => {
    let dataDir: string
    let garden: TestGarden

    before(async () => {
      dataDir = getDataDir("test-projects", "template-strings")
      garden = await makeTestGarden(dataDir)
    })

    it("should resolve variables from project-level and environment-level configs", async () => {
      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const deployAction = graph.getDeploy("test-deploy")
      expect(deployAction.getConfig().include).to.eql(["aFileFromEnvConfig", "aFileFromProjectConfig"])
    })
  })
})
