/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import repeat from "lodash-es/repeat.js"
import stripAnsi from "strip-ansi"
import { loadAndValidateYaml } from "../../../src/config/base.js"
import type { ContextLookupReferenceFinding } from "../../../src/template/analysis.js"
import {
  defaultVisitorOpts,
  getContextLookupReferences,
  UnresolvableValue,
  visitAll,
} from "../../../src/template/analysis.js"
import { legacyResolveTemplateString } from "../../../src/template/templated-strings.js"
import { dedent } from "../../../src/util/string.js"
import type { TestGarden } from "../../helpers.js"
import { expectError, expectFuzzyMatch, getDataDir, makeTestGarden } from "../../helpers.js"
import { TemplateStringError } from "../../../src/template/errors.js"
import { getActionTemplateReferences } from "../../../src/config/references.js"
import { throwOnMissingSecretKeys } from "../../../src/config/secrets.js"
import { parseTemplateCollection } from "../../../src/template/templated-collections.js"
import { deepEvaluate } from "../../../src/template/evaluate.js"
import pick from "lodash-es/pick.js"
import { TestContext } from "./config/template-contexts/base.js"
import type { Collection } from "../../../src/util/objects.js"
import type { ParsedTemplate } from "../../../src/template/types.js"
import type { ConfigContext } from "../../../src/config/template-contexts/base.js"
import { setGloablProjectApiVersion } from "../../../src/project-api-version.js"
import { GardenApiVersion } from "../../../src/constants.js"

describe("template string access protection", () => {
  it("should crash when an unresolved value is accidentally treated as resolved", () => {
    const parsed = parseTemplateCollection({ value: { foo: "${bar}" } as const, source: { path: [] } })
    expect(() => parsed.foo!["a"]).to.throw()
  })

  it("should not crash when an unresolved value is correctly evaluated", () => {
    const parsed = parseTemplateCollection({ value: { foo: "${bar}" } as const, source: { path: [] } })
    const evaluated = deepEvaluate(parsed, { context: new TestContext({ bar: "baz" }), opts: {} })
    expect(evaluated).to.eql({ foo: "baz" })
  })

  it("should crash when an unresolved value is accidentally used in a spread operator", () => {
    const parsed = parseTemplateCollection({ value: { foo: "${bar}" } as const, source: { path: [] } })
    const foo = parsed.foo as any
    expect(() => ({ ...foo })).to.throw()
  })
})

describe("parse and evaluate template strings with apiVersion: garden.io/v2", () => {
  beforeEach(() => {
    setGloablProjectApiVersion(GardenApiVersion.v2)
  })

  describe("should resolve ? suffix as a regular character", () => {
    it("should resolve ? as a regular character if the referenced template value exists", () => {
      const res = legacyResolveTemplateString({ string: "${foo}?", context: new TestContext({ foo: "bar" }) })
      expect(res).to.equal("bar?")
    })

    it("should throw the referenced template value with ? does not exists", () => {
      void expectError(
        () =>
          legacyResolveTemplateString({
            string: "${foo}?",
            context: new TestContext({}),
          }),
        { contains: "Invalid template string (${foo}?): Could not find key foo. Available keys: (none)." }
      )
    })

    it("should throw the referenced template value with ? does not exists but other keys are defined", () => {
      const obj = {
        some: "${key}?",
        other: "${missing}?",
      }
      const context = new TestContext({
        key: "value",
      })

      const parsed = parseTemplateCollection({ source: { path: [] }, value: obj })

      void expectError(
        () =>
          deepEvaluate(parsed, {
            context,
            opts: {},
          }),
        {
          contains:
            "Invalid template string (${missing}?) at path other: Could not find key missing. Available keys: key.",
        }
      )
    })

    it("should throw the referenced template value with ? does not exists and surrounded with a prefix and a suffix", () => {
      void expectError(
        () =>
          legacyResolveTemplateString({
            string: "prefix-${some}?-suffix",
            context: new TestContext({}),
          }),
        {
          contains:
            "Invalid template string (prefix-${some}?-suffix): Could not find key some. Available keys: (none).",
        }
      )
    })

    it("should throw if an expression with ? in member expression cannot be resolved", async () => {
      await expectError(
        () =>
          legacyResolveTemplateString({
            string: '${actions.build["${parent.name}?"]}',
            context: new TestContext({
              actions: {
                build: {},
              },
            }),
            contextOpts: {},
          }),
        {
          contains: "Invalid template string (${parent.name}?): Could not find key parent. Available keys: actions.",
        }
      )
    })
  })
})

describe("parse and evaluate template strings", () => {
  it("should return a non-templated string unchanged", () => {
    const res = legacyResolveTemplateString({ string: "somestring", context: new TestContext({}) })
    expect(res).to.equal("somestring")
  })

  it("should resolve a key with a dash in it", () => {
    const res = legacyResolveTemplateString({
      string: "${some-key}",
      context: new TestContext({ "some-key": "value" }),
    })
    expect(res).to.equal("value")
  })

  it("should resolve a nested key with a dash in it", () => {
    const res = legacyResolveTemplateString({
      string: "${ctx.some-key}",
      context: new TestContext({ ctx: { "some-key": "value" } }),
    })
    expect(res).to.equal("value")
  })

  describe("should resolve ? suffix as a regular character", () => {
    it("should resolve ? as a regular character if the referenced template value exists", () => {
      const res = legacyResolveTemplateString({ string: "${foo}?", context: new TestContext({ foo: "bar" }) })
      expect(res).to.equal("bar?")
    })

    it("should throw the referenced template value with ? does not exists", () => {
      void expectError(
        () =>
          legacyResolveTemplateString({
            string: "${foo}?",
            context: new TestContext({}),
          }),
        { contains: "Invalid template string (${foo}?): Could not find key foo. Available keys: (none)." }
      )
    })

    it("should throw the referenced template value with ? does not exists and surrounded with a prefix and a suffix", () => {
      void expectError(
        () =>
          legacyResolveTemplateString({
            string: "prefix-${some}?-suffix",
            context: new TestContext({}),
          }),
        {
          contains:
            "Invalid template string (prefix-${some}?-suffix): Could not find key some. Available keys: (none).",
        }
      )
    })

    it("should throw if an expression with ? in member expression cannot be resolved", async () => {
      await expectError(
        () =>
          legacyResolveTemplateString({
            string: '${actions.build["${parent.name}?"]}',
            context: new TestContext({
              actions: {
                build: {},
              },
            }),
            contextOpts: {},
          }),
        {
          contains: "Invalid template string (${parent.name}?): Could not find key parent. Available keys: actions.",
        }
      )
    })
  })

  it("should allow undefined values when falling back to another value suffix is present", () => {
    const res = legacyResolveTemplateString({ string: "${foo || null}", context: new TestContext({}) })
    expect(res).to.equal(null)
  })

  it("should fail if optional expression in member expression cannot be resolved", async () => {
    await expectError(
      () =>
        legacyResolveTemplateString({
          string: '${actions.build["${parent.name || null}"]}',
          context: new TestContext({
            actions: {
              build: {},
            },
          }),
          contextOpts: {},
        }),
      {
        contains:
          'Invalid template string (${actions.build["${parent.name || null}"]}): Expression in brackets must resolve to a string or number (got null).',
      }
    )
  })

  it("should support a string literal in a template string as a means to escape it", () => {
    const res = legacyResolveTemplateString({ string: "${'$'}{bar}", context: new TestContext({}) })
    expect(res).to.equal("${bar}")
  })

  it("should unescape a template string with a double $$ prefix by default", () => {
    const res = legacyResolveTemplateString({
      string: "$${bar}",
      context: new TestContext({}),
      contextOpts: {},
    })
    expect(res).to.equal("${bar}")
  })

  it("should resolve other template variables after escaped one with keepEscapingInTemplateStrings=true", () => {
    const res = legacyResolveTemplateString({
      string: "foo $${} ${bar}",
      context: new TestContext({ bar: "bar" }),
      contextOpts: { keepEscapingInTemplateStrings: true },
    })
    expect(res).to.equal("foo $${} bar")
  })

  it("should resolve other template variables after escaped one", () => {
    const res = legacyResolveTemplateString({
      string: "foo $${} ${bar}",
      context: new TestContext({ bar: "bar" }),
      contextOpts: {},
    })
    expect(res).to.equal("foo ${} bar")
  })

  it("should not unescape inner template variables with keepEscapingInTemplateStrings=true", () => {
    const res = legacyResolveTemplateString({
      string: 'foo ${"$${}"} ${bar}',
      context: new TestContext({ bar: "bar" }),
      contextOpts: { keepEscapingInTemplateStrings: true },
    })
    expect(res).to.equal("foo $${} bar")
  })

  it("should unescape inner template variables by default", () => {
    const res = legacyResolveTemplateString({
      string: 'foo ${"$${}"} ${bar}',
      context: new TestContext({ bar: "bar" }),
      contextOpts: {},
    })
    expect(res).to.equal("foo ${} bar")
  })

  it("should not unescape outer template variables with keepEscapingInTemplateStrings=true", () => {
    const res = legacyResolveTemplateString({
      string: 'foo $${"${}"} ${bar}',
      context: new TestContext({ bar: "bar" }),
      contextOpts: { keepEscapingInTemplateStrings: true },
    })
    expect(res).to.equal('foo $${"${}"} bar')
  })

  it("should unescape outer template variables by default", () => {
    const res = legacyResolveTemplateString({
      string: 'foo $${"${}"} ${bar}',
      context: new TestContext({ bar: "bar" }),
      contextOpts: {},
    })
    expect(res).to.equal('foo ${"${}"} bar')
  })

  it("should allow nesting escaped strings within normal strings", () => {
    const res = legacyResolveTemplateString({
      string: "${foo == 'yes' ? '$${bar}' : 'fail' }",
      context: new TestContext({ foo: "yes" }),
      contextOpts: {},
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
          const res = legacyResolveTemplateString({
            string: "$${env" + envFormat.delimiter + "TEST_ENV}",
            context: new TestContext({}),
            contextOpts: {},
          })
          expect(res).to.equal("${env" + envFormat.delimiter + "TEST_ENV}")
        })

        it("for env vars in argument lists", () => {
          const res = legacyResolveTemplateString({
            string: "foo $${env" + envFormat.delimiter + "TEST_ENV} bar",
            context: new TestContext({}),
            contextOpts: {},
          })
          expect(res).to.equal("foo ${env" + envFormat.delimiter + "TEST_ENV} bar")
        })

        it("for env vars that are parts of another strings", () => {
          const res = legacyResolveTemplateString({
            string: "${foo}-$${env" + envFormat.delimiter + "TEST_ENV}",
            context: new TestContext({ foo: "foo" }),
            contextOpts: {},
          })
          expect(res).to.equal("foo-${env" + envFormat.delimiter + "TEST_ENV}")
        })
      })
    }
  })

  it("should allow mixing normal and escaped strings", () => {
    const res = legacyResolveTemplateString({
      string: "${foo}-and-$${var.nope}",
      context: new TestContext({ foo: "yes" }),
      contextOpts: {},
    })
    expect(res).to.equal("yes-and-${var.nope}")
  })

  it("should interpolate a format string with a prefix", () => {
    const res = legacyResolveTemplateString({
      string: "prefix-${some}",
      context: new TestContext({ some: "value" }),
    })
    expect(res).to.equal("prefix-value")
  })

  it("should interpolate a format string with a suffix", () => {
    const res = legacyResolveTemplateString({
      string: "${some}-suffix",
      context: new TestContext({ some: "value" }),
    })
    expect(res).to.equal("value-suffix")
  })

  it("should interpolate a format string with a prefix and a suffix", () => {
    const res = legacyResolveTemplateString({
      string: "prefix-${some}-suffix",
      context: new TestContext({ some: "value" }),
    })
    expect(res).to.equal("prefix-value-suffix")
  })

  it("should interpolate an optional format string with a prefix and a suffix", () => {
    const res = legacyResolveTemplateString({ string: "prefix-${some || ''}-suffix", context: new TestContext({}) })
    expect(res).to.equal("prefix--suffix")
  })

  it("should interpolate a format string with a prefix with whitespace", () => {
    const res = legacyResolveTemplateString({
      string: "prefix ${some}",
      context: new TestContext({ some: "value" }),
    })
    expect(res).to.equal("prefix value")
  })

  it("should interpolate a format string with a suffix with whitespace", () => {
    const res = legacyResolveTemplateString({
      string: "${some} suffix",
      context: new TestContext({ some: "value" }),
    })
    expect(res).to.equal("value suffix")
  })

  it("should correctly interpolate a format string with surrounding whitespace", () => {
    const res = legacyResolveTemplateString({
      string: "prefix ${some} suffix",
      context: new TestContext({ some: "value" }),
    })
    expect(res).to.equal("prefix value suffix")
  })

  it("should handle a nested key", () => {
    const res = legacyResolveTemplateString({
      string: "${some.nested}",
      context: new TestContext({ some: { nested: "value" } }),
    })
    expect(res).to.equal("value")
  })

  it("should handle multiple format strings", () => {
    const res = legacyResolveTemplateString({
      string: "prefix-${a}-${b}-suffix",
      context: new TestContext({ a: "value", b: "other" }),
    })
    expect(res).to.equal("prefix-value-other-suffix")
  })

  it("should handle consecutive format strings", () => {
    const res = legacyResolveTemplateString({
      string: "${a}${b}",
      context: new TestContext({ a: "value", b: "other" }),
    })
    expect(res).to.equal("valueother")
  })

  it("should throw when a key is not found", () => {
    void expectError(() => legacyResolveTemplateString({ string: "${some}", context: new TestContext({}) }), {
      contains: "Invalid template string (${some}): Could not find key some",
    })
  })

  it("should trim long template string in error messages", () => {
    const veryLongString = repeat("very ", 100)
    void expectError(
      () =>
        legacyResolveTemplateString({
          string: `\${some} ${veryLongString} template string`,
          context: new TestContext({}),
        }),
      (err) => expect(err.message.length).to.be.lessThan(350)
    )
  })

  it("should replace line breaks in template strings in error messages", () => {
    void expectError(
      () => legacyResolveTemplateString({ string: "${some}\nmulti\nline\nstring", context: new TestContext({}) }),
      {
        contains: "Invalid template string (${some}\\nmulti\\nline\\nstring): Could not find key some",
      }
    )
  })

  it("should throw when a nested key is not found", () => {
    void expectError(
      () => legacyResolveTemplateString({ string: "${some.other}", context: new TestContext({ some: {} }) }),
      {
        contains: "Invalid template string (${some.other}): Could not find key other under some",
      }
    )
  })

  it("should throw with an incomplete template string", () => {
    try {
      legacyResolveTemplateString({ string: "${some", context: new TestContext({ some: {} }) })
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
    void expectError(() => legacyResolveTemplateString({ string: "${resol${part}ed}", context: new TestContext({}) }), {
      contains: "Invalid template string (${resol${part}ed}): Unable to parse as valid template string.",
    })
  })

  it("if available, should include yaml context in error message", async () => {
    const command = "${resol${part}ed}"
    const yamlDoc = await loadAndValidateYaml({
      content: dedent`
      name: test,
      kind: Build
      spec:
        command: '${command}'
    `,
      sourceDescription: "test",
      filename: "bar/foo.yaml",
    })
    void expectError(
      () =>
        legacyResolveTemplateString({
          string: command,
          context: new TestContext({}),
          source: {
            yamlDoc: yamlDoc[0],
            path: ["spec", "command"],
          },
        }),
      {
        contains: dedent`
          bar/foo.yaml:4
          ...
          3  | spec:
          4  |   command: '\${resol\${part}ed}
          ----------------^
          unable to parse as valid template string.
        `,
      }
    )
  })

  it("should handle a single-quoted string", () => {
    const res = legacyResolveTemplateString({ string: "${'foo'}", context: new TestContext({}) })
    expect(res).to.equal("foo")
  })

  it("should handle a numeric literal and return it directly", () => {
    const res = legacyResolveTemplateString({ string: "${123}", context: new TestContext({}) })
    expect(res).to.equal(123)
  })

  it("should handle a boolean true literal and return it directly", () => {
    const res = legacyResolveTemplateString({ string: "${true}", context: new TestContext({}) })
    expect(res).to.equal(true)
  })

  it("should handle a boolean false literal and return it directly", () => {
    const res = legacyResolveTemplateString({ string: "${false}", context: new TestContext({}) })
    expect(res).to.equal(false)
  })

  it("should allow unclosed conditional blocks expressions (true)", () => {
    const res = legacyResolveTemplateString({ string: "${if true}", context: new TestContext({}) })
    expect(res).to.equal(true)
  })

  it("should allow unclosed conditional blocks expressions (false)", () => {
    const res = legacyResolveTemplateString({ string: "${if false}", context: new TestContext({}) })
    expect(res).to.equal(false)
  })

  it("should allow unclosed conditional blocks expressions (any value)", () => {
    const res = legacyResolveTemplateString({ string: '${if "something"}', context: new TestContext({}) })
    expect(res).to.equal("something")
  })

  it("empty conditional blocks expressions evaluate to empty string", () => {
    const res = legacyResolveTemplateString({ string: "${if true}${endif}", context: new TestContext({}) })
    expect(res).to.equal("")
  })

  it("should handle a null literal and return it directly", () => {
    const res = legacyResolveTemplateString({ string: "${null}", context: new TestContext({}) })
    expect(res).to.equal(null)
  })

  it("should handle a numeric literal in a logical OR and return it directly", () => {
    const res = legacyResolveTemplateString({ string: "${a || 123}", context: new TestContext({}) })
    expect(res).to.equal(123)
  })

  it("should handle a boolean true literal in a logical OR and return it directly", () => {
    const res = legacyResolveTemplateString({ string: "${a || true}", context: new TestContext({}) })
    expect(res).to.equal(true)
  })

  it("should handle a boolean false literal in a logical OR and return it directly", () => {
    const res = legacyResolveTemplateString({ string: "${a || false}", context: new TestContext({}) })
    expect(res).to.equal(false)
  })

  it("should handle a null literal in a logical OR and return it directly", () => {
    const res = legacyResolveTemplateString({ string: "${a || null}", context: new TestContext({}) })
    expect(res).to.equal(null)
  })

  it("should handle a double-quoted string", () => {
    const res = legacyResolveTemplateString({ string: '${"foo"}', context: new TestContext({}) })
    expect(res).to.equal("foo")
  })

  it("should throw on invalid single-quoted string", () => {
    void expectError(() => legacyResolveTemplateString({ string: "${'foo}", context: new TestContext({}) }), {
      contains: "Invalid template string (${'foo}): Unable to parse as valid template string.",
    })
  })

  it("should throw on invalid double-quoted string", () => {
    void expectError(() => legacyResolveTemplateString({ string: '${"foo}', context: new TestContext({}) }), {
      contains: 'Invalid template string (${"foo}): Unable to parse as valid template string.',
    })
  })

  it("should handle a logical OR between two identifiers", () => {
    const res = legacyResolveTemplateString({
      string: "${a || b}",
      context: new TestContext({ a: undefined, b: "abc" }),
    })
    expect(res).to.equal("abc")
  })

  it("should handle a logical OR between two nested identifiers", () => {
    const res = legacyResolveTemplateString({
      string: "${a.b || c.d}",
      context: new TestContext({
        a: { b: undefined },
        c: { d: "abc" },
      }),
    })
    expect(res).to.equal("abc")
  })

  it("should handle a logical OR between two nested identifiers where the first resolves", () => {
    const res = legacyResolveTemplateString({
      string: "${a.b || c.d}",
      context: new TestContext({
        a: { b: "abc" },
        c: { d: undefined },
      }),
    })
    expect(res).to.equal("abc")
  })

  it("should handle a logical OR between two identifiers without spaces with first value undefined", () => {
    const res = legacyResolveTemplateString({
      string: "${a||b}",
      context: new TestContext({ a: undefined, b: "abc" }),
    })
    expect(res).to.equal("abc")
  })

  it("should handle a logical OR between two identifiers with first value undefined and string fallback", () => {
    const res = legacyResolveTemplateString({ string: '${a || "foo"}', context: new TestContext({ a: undefined }) })
    expect(res).to.equal("foo")
  })

  it("should handle a logical OR with undefined nested value and string fallback", () => {
    const res = legacyResolveTemplateString({ string: "${a.b || 'foo'}", context: new TestContext({ a: {} }) })
    expect(res).to.equal("foo")
  })

  it("should handle chained logical OR with string fallback", () => {
    const res = legacyResolveTemplateString({
      string: "${a.b || c.d || e.f || 'foo'}",
      context: new TestContext({ a: {}, c: {}, e: {} }),
    })
    expect(res).to.equal("foo")
  })

  it("should handle a logical OR between two identifiers without spaces with first value set", () => {
    const res = legacyResolveTemplateString({
      string: "${a||b}",
      context: new TestContext({ a: "abc", b: undefined }),
    })
    expect(res).to.equal("abc")
  })

  it("should throw if neither key in logical OR is valid", () => {
    void expectError(() => legacyResolveTemplateString({ string: "${a || b}", context: new TestContext({}) }), {
      contains: "Invalid template string (${a || b}): Could not find key b",
    })
  })

  it("should throw on invalid logical OR string", () => {
    void expectError(() => legacyResolveTemplateString({ string: "${a || 'b}", context: new TestContext({}) }), {
      contains: "Invalid template string (${a || 'b}): Unable to parse as valid template string.",
    })
  })

  it("should handle a logical OR between a string and a string", () => {
    const res = legacyResolveTemplateString({ string: "${'a' || 'b'}", context: new TestContext({ a: undefined }) })
    expect(res).to.equal("a")
  })

  it("should handle a logical OR between an empty string and a string", () => {
    const res = legacyResolveTemplateString({ string: "${a || 'b'}", context: new TestContext({ a: "" }) })
    expect(res).to.equal("b")
  })

  context("logical AND (&& operator)", () => {
    it("true literal and true variable reference", () => {
      const res = legacyResolveTemplateString({ string: "${true && a}", context: new TestContext({ a: true }) })
      expect(res).to.equal(true)
    })

    it("two true variable references", () => {
      const res = legacyResolveTemplateString({
        string: "${var.a && var.b}",
        context: new TestContext({ var: { a: true, b: true } }),
      })
      expect(res).to.equal(true)
    })

    it("first part is false but the second part is not resolvable", () => {
      // i.e. the 2nd clause should not need to be evaluated
      const res = legacyResolveTemplateString({ string: "${false && a}", context: new TestContext({}) })
      expect(res).to.equal(false)
    })

    it("an empty string as the first clause", () => {
      const res = legacyResolveTemplateString({ string: "${'' && true}", context: new TestContext({}) })
      expect(res).to.equal("")
    })

    it("an empty string as the second clause", () => {
      const res = legacyResolveTemplateString({ string: "${true && ''}", context: new TestContext({}) })
      expect(res).to.equal("")
    })

    it("a missing reference as the first clause", () => {
      const res = legacyResolveTemplateString({ string: "${var.foo && 'a'}", context: new TestContext({ var: {} }) })
      expect(res).to.equal(false)
    })

    it("a missing reference as the second clause", () => {
      const res = legacyResolveTemplateString({ string: "${'a' && var.foo}", context: new TestContext({ var: {} }) })
      expect(res).to.equal(false)
    })
  })

  it("should handle a positive equality comparison between equal resolved values", () => {
    const res = legacyResolveTemplateString({ string: "${a == b}", context: new TestContext({ a: "a", b: "a" }) })
    expect(res).to.equal(true)
  })

  it("should handle a positive equality comparison between equal string literals", () => {
    const res = legacyResolveTemplateString({ string: "${'a' == 'a'}", context: new TestContext({}) })
    expect(res).to.equal(true)
  })

  it("should handle a positive equality comparison between equal numeric literals", () => {
    const res = legacyResolveTemplateString({ string: "${123 == 123}", context: new TestContext({}) })
    expect(res).to.equal(true)
  })

  it("should handle a positive equality comparison between equal boolean literals", () => {
    const res = legacyResolveTemplateString({ string: "${true == true}", context: new TestContext({}) })
    expect(res).to.equal(true)
  })

  it("should handle a positive equality comparison between different resolved values", () => {
    const res = legacyResolveTemplateString({ string: "${a == b}", context: new TestContext({ a: "a", b: "b" }) })
    expect(res).to.equal(false)
  })

  it("should handle a positive equality comparison between different string literals", () => {
    const res = legacyResolveTemplateString({ string: "${'a' == 'b'}", context: new TestContext({}) })
    expect(res).to.equal(false)
  })

  it("should handle a positive equality comparison between different numeric literals", () => {
    const res = legacyResolveTemplateString({ string: "${123 == 456}", context: new TestContext({}) })
    expect(res).to.equal(false)
  })

  it("should handle a positive equality comparison between different boolean literals", () => {
    const res = legacyResolveTemplateString({ string: "${true == false}", context: new TestContext({}) })
    expect(res).to.equal(false)
  })

  it("should handle a negative equality comparison between equal resolved values", () => {
    const res = legacyResolveTemplateString({ string: "${a != b}", context: new TestContext({ a: "a", b: "a" }) })
    expect(res).to.equal(false)
  })

  it("should handle a negative equality comparison between equal string literals", () => {
    const res = legacyResolveTemplateString({ string: "${'a' != 'a'}", context: new TestContext({}) })
    expect(res).to.equal(false)
  })

  it("should handle a negative equality comparison between equal numeric literals", () => {
    const res = legacyResolveTemplateString({ string: "${123 != 123}", context: new TestContext({}) })
    expect(res).to.equal(false)
  })

  it("should handle a negative equality comparison between equal boolean literals", () => {
    const res = legacyResolveTemplateString({ string: "${false != false}", context: new TestContext({}) })
    expect(res).to.equal(false)
  })

  it("should handle a negative equality comparison between different resolved values", () => {
    const res = legacyResolveTemplateString({ string: "${a != b}", context: new TestContext({ a: "a", b: "b" }) })
    expect(res).to.equal(true)
  })

  it("should handle a negative equality comparison between different string literals", () => {
    const res = legacyResolveTemplateString({ string: "${'a' != 'b'}", context: new TestContext({}) })
    expect(res).to.equal(true)
  })

  it("should handle a negative equality comparison between different numeric literals", () => {
    const res = legacyResolveTemplateString({ string: "${123 != 456}", context: new TestContext({}) })
    expect(res).to.equal(true)
  })

  it("should handle a negative equality comparison between different boolean literals", () => {
    const res = legacyResolveTemplateString({ string: "${true != false}", context: new TestContext({}) })
    expect(res).to.equal(true)
  })

  it("should handle a positive equality comparison between different value types", () => {
    const res = legacyResolveTemplateString({ string: "${true == 'foo'}", context: new TestContext({}) })
    expect(res).to.equal(false)
  })

  it("should handle a negative equality comparison between different value types", () => {
    const res = legacyResolveTemplateString({ string: "${123 != false}", context: new TestContext({}) })
    expect(res).to.equal(true)
  })

  it("should handle negations on booleans", () => {
    const res = legacyResolveTemplateString({ string: "${!true}", context: new TestContext({}) })
    expect(res).to.equal(false)
  })

  it("should handle negations on nulls", () => {
    const res = legacyResolveTemplateString({ string: "${!null}", context: new TestContext({}) })
    expect(res).to.equal(true)
  })

  it("should handle negations on empty strings", () => {
    const res = legacyResolveTemplateString({ string: "${!''}", context: new TestContext({}) })
    expect(res).to.equal(true)
  })

  it("should handle negations on resolved keys", () => {
    const res = legacyResolveTemplateString({ string: "${!a}", context: new TestContext({ a: false }) })
    expect(res).to.equal(true)
  })

  it("should handle the typeof operator for resolved booleans", () => {
    const res = legacyResolveTemplateString({ string: "${typeof a}", context: new TestContext({ a: false }) })
    expect(res).to.equal("boolean")
  })

  it("should handle the typeof operator for resolved numbers", () => {
    const res = legacyResolveTemplateString({ string: "${typeof foo}", context: new TestContext({ foo: 1234 }) })
    expect(res).to.equal("number")
  })

  it("should handle the typeof operator for strings", () => {
    const res = legacyResolveTemplateString({ string: "${typeof 'foo'}", context: new TestContext({}) })
    expect(res).to.equal("string")
  })

  it("should throw when using comparison operators on missing keys", () => {
    void expectError(() => legacyResolveTemplateString({ string: "${a >= b}", context: new TestContext({ a: 123 }) }), {
      contains: "Invalid template string (${a >= b}): Could not find key b. Available keys: a.",
    })
  })

  it("should concatenate two arrays", () => {
    const res = legacyResolveTemplateString({ string: "${a + b}", context: new TestContext({ a: [1], b: [2, 3] }) })
    expect(res).to.eql([1, 2, 3])
  })

  it("should concatenate two strings", () => {
    const res = legacyResolveTemplateString({ string: "${a + b}", context: new TestContext({ a: "foo", b: "bar" }) })
    expect(res).to.eql("foobar")
  })

  it("should add two numbers together", () => {
    const res = legacyResolveTemplateString({ string: "${1 + a}", context: new TestContext({ a: 2 }) })
    expect(res).to.equal(3)
  })

  it("should throw when using + on number and array", () => {
    void expectError(
      () => legacyResolveTemplateString({ string: "${a + b}", context: new TestContext({ a: 123, b: ["a"] }) }),
      {
        contains:
          "Invalid template string (${a + b}): Both terms need to be either arrays or strings or numbers for + operator (got number and object).",
      }
    )
  })

  it("should correctly evaluate clauses in parentheses", () => {
    const res = legacyResolveTemplateString({ string: "${(1 + 2) * (3 + 4)}", context: new TestContext({}) })
    expect(res).to.equal(21)
  })

  it("should handle member lookup with bracket notation", () => {
    const res = legacyResolveTemplateString({
      string: "${foo['bar']}",
      context: new TestContext({ foo: { bar: true } }),
    })
    expect(res).to.equal(true)
  })

  it("should handle member lookup with bracket notation, single quotes and dot in key name", () => {
    const res = legacyResolveTemplateString({
      string: "${foo['bar.baz']}",
      context: new TestContext({ foo: { "bar.baz": true } }),
    })
    expect(res).to.equal(true)
  })

  it("should handle member lookup with bracket notation, double quotes and dot in key name", () => {
    const res = legacyResolveTemplateString({
      string: '${foo.bar["bla.ble"]}',
      context: new TestContext({ foo: { bar: { "bla.ble": 123 } } }),
    })
    expect(res).to.equal(123)
  })

  it("should handle numeric member lookup with bracket notation", () => {
    const res = legacyResolveTemplateString({
      string: "${foo[1]}",
      context: new TestContext({ foo: [false, true] }),
    })
    expect(res).to.equal(true)
  })

  it("should handle consecutive member lookups with bracket notation", () => {
    const res = legacyResolveTemplateString({
      string: "${foo['bar']['baz']}",
      context: new TestContext({ foo: { bar: { baz: true } } }),
    })
    expect(res).to.equal(true)
  })

  it("should handle dot member after bracket member", () => {
    const res = legacyResolveTemplateString({
      string: "${foo['bar'].baz}",
      context: new TestContext({ foo: { bar: { baz: true } } }),
    })
    expect(res).to.equal(true)
  })

  it("should handle template expression within brackets", () => {
    const res = legacyResolveTemplateString({
      string: "${foo['${bar}']}",
      context: new TestContext({
        foo: { baz: true },
        bar: "baz",
      }),
    })
    expect(res).to.equal(true)
  })

  it("should handle identifiers within brackets", () => {
    const res = legacyResolveTemplateString({
      string: "${foo[bar]}",
      context: new TestContext({
        foo: { baz: true },
        bar: "baz",
      }),
    })
    expect(res).to.equal(true)
  })

  it("should handle nested identifiers within brackets", () => {
    const res = legacyResolveTemplateString({
      string: "${foo[a.b]}",
      context: new TestContext({
        foo: { baz: true },
        a: { b: "baz" },
      }),
    })
    expect(res).to.equal(true)
  })

  it("should throw if bracket expression resolves to a non-primitive", () => {
    void expectError(
      () => legacyResolveTemplateString({ string: "${foo[bar]}", context: new TestContext({ foo: {}, bar: {} }) }),
      {
        contains:
          "Invalid template string (${foo[bar]}): Expression in brackets must resolve to a string or number (got object).",
      }
    )
  })

  it("should throw if attempting to index a primitive with brackets", () => {
    void expectError(
      () => legacyResolveTemplateString({ string: "${foo[bar]}", context: new TestContext({ foo: 123, bar: "baz" }) }),
      {
        contains: "Invalid template string (${foo[bar]}): Attempted to look up key baz on primitive value foo.baz.",
      }
    )
  })

  it("should throw when using >= on non-numeric terms", () => {
    void expectError(
      () => legacyResolveTemplateString({ string: "${a >= b}", context: new TestContext({ a: 123, b: "foo" }) }),
      {
        contains:
          "Invalid template string (${a >= b}): Both terms need to be numbers for >= operator (got number and string).",
      }
    )
  })

  it("should handle a positive ternary expression", () => {
    const res = legacyResolveTemplateString({
      string: "${foo ? true : false}",
      context: new TestContext({ foo: true }),
    })
    expect(res).to.equal(true)
  })

  it("should handle a negative ternary expression", () => {
    const res = legacyResolveTemplateString({
      string: "${foo ? true : false}",
      context: new TestContext({ foo: false }),
    })
    expect(res).to.equal(false)
  })

  it("should handle a ternary expression with an expression as a test", () => {
    const res = legacyResolveTemplateString({
      string: "${foo == 'bar' ? a : b}",
      context: new TestContext({ foo: "bar", a: true, b: false }),
    })
    expect(res).to.equal(true)
  })

  it("should ignore errors in a value not returned by a ternary", () => {
    const res = legacyResolveTemplateString({
      string: "${var.foo ? replace(var.foo, ' ', ',') : null}",
      context: new TestContext({ var: {} }),
    })
    expect(res).to.equal(null)
  })

  it("should handle a ternary expression with an object as a test", () => {
    const res = legacyResolveTemplateString({
      string: "${a ? a.value : b}",
      context: new TestContext({ a: { value: true }, b: false }),
    })
    expect(res).to.equal(true)
  })

  it("should handle a ternary expression with template key values", () => {
    const res = legacyResolveTemplateString({
      string: "${foo == 'bar' ? '=${foo}' : b}",
      context: new TestContext({ foo: "bar", a: true, b: false }),
    })
    expect(res).to.equal("=bar")
  })

  it("should handle an expression in parentheses", () => {
    const res = legacyResolveTemplateString({
      string: "${foo || (a > 5)}",
      context: new TestContext({ foo: false, a: 10 }),
    })
    expect(res).to.equal(true)
  })

  it("should handle numeric indices on arrays", () => {
    const res = legacyResolveTemplateString({ string: "${foo.1}", context: new TestContext({ foo: [false, true] }) })
    expect(res).to.equal(true)
  })

  it("should resolve keys on objects in arrays", () => {
    const res = legacyResolveTemplateString({
      string: "${foo.1.bar}",
      context: new TestContext({ foo: [{}, { bar: true }] }),
    })
    expect(res).to.equal(true)
  })

  it("should correctly propagate errors from nested contexts", () => {
    void expectError(
      () =>
        legacyResolveTemplateString({
          string: "${nested.missing}",
          context: new TestContext({ nested: new TestContext({ foo: 123, bar: 456, baz: 789 }) }),
        }),
      {
        contains:
          "Invalid template string (${nested.missing}): Could not find key missing under nested. Available keys: foo, bar, baz.",
      }
    )
  })

  it("should correctly propagate errors from nested objects", () => {
    void expectError(
      () =>
        legacyResolveTemplateString({
          string: "${nested.missing}",
          context: new TestContext({ nested: { foo: 123, bar: 456 } }),
        }),
      {
        contains:
          "Invalid template string (${nested.missing}): Could not find key missing under nested. Available keys: foo, bar.",
      }
    )
  })

  it("should correctly propagate errors when resolving key on object in nested context", () => {
    const c = new TestContext({ nested: new TestContext({ deeper: {} }) })

    void expectError(() => legacyResolveTemplateString({ string: "${nested.deeper.missing}", context: c }), {
      contains: "Invalid template string (${nested.deeper.missing}): Could not find key missing under nested.deeper.",
    })
  })

  it("should correctly propagate errors from deeply nested contexts", () => {
    const c = new TestContext({ nested: new TestContext({ deeper: new TestContext({}) }) })

    void expectError(() => legacyResolveTemplateString({ string: "${nested.deeper.missing}", context: c }), {
      contains: "Invalid template string (${nested.deeper.missing}): Could not find key missing under nested.deeper.",
    })
  })

  it("should throw an error if var lookup fails combined with json encode", () => {
    const c = new TestContext({ var: {} })

    void expectError(() => legacyResolveTemplateString({ string: "${jsonEncode(var.missing)}", context: c }), {
      contains: "Invalid template string (${jsonEncode(var.missing)}): Could not find key missing under var.",
    })
  })

  it("We need to remain bug-compatible with older versions of garden and not throw when variable does not exist with certain operators", () => {
    const testCases = {
      "${!var.doesNotExist}": true,
      "${typeof var.doesNotExist}": "undefined",
      "${! (var.doesNotExistOne && var.doesNotExistTwo)}": true,
      "${var.doesNotExistOne && var.doesNotExistTwo}": false,
    }

    for (const [template, expectation] of Object.entries(testCases)) {
      const result = legacyResolveTemplateString({
        string: template,
        contextOpts: {},
        context: new TestContext({ var: {} }),
      })
      expect(result).to.eq(
        expectation,
        `Template "${template}" did not resolve to expected value ${JSON.stringify(expectation)}`
      )
    }
  })

  context("when the template string is the full input string", () => {
    it("should return a resolved number directly", () => {
      const res = legacyResolveTemplateString({ string: "${a}", context: new TestContext({ a: 100 }) })
      expect(res).to.equal(100)
    })

    it("should return a resolved boolean true directly", () => {
      const res = legacyResolveTemplateString({ string: "${a}", context: new TestContext({ a: true }) })
      expect(res).to.equal(true)
    })

    it("should return a resolved boolean false directly", () => {
      const res = legacyResolveTemplateString({ string: "${a}", context: new TestContext({ a: false }) })
      expect(res).to.equal(false)
    })

    it("should return a resolved null directly", () => {
      const res = legacyResolveTemplateString({ string: "${a}", context: new TestContext({ a: null }) })
      expect(res).to.equal(null)
    })

    it("should return a resolved object directly", () => {
      const res = legacyResolveTemplateString({ string: "${a}", context: new TestContext({ a: { b: 123 } }) })
      expect(res).to.eql({ b: 123 })
    })

    it("should return a resolved array directly", () => {
      const res = legacyResolveTemplateString({ string: "${a}", context: new TestContext({ a: [123] }) })
      expect(res).to.eql([123])
    })
  })

  context("when the template string is a part of a string", () => {
    it("should format a resolved number into the string", () => {
      const res = legacyResolveTemplateString({ string: "foo-${a}", context: new TestContext({ a: 100 }) })
      expect(res).to.equal("foo-100")
    })

    it("should format a resolved boolean true into the string", () => {
      const res = legacyResolveTemplateString({ string: "foo-${a}", context: new TestContext({ a: true }) })
      expect(res).to.equal("foo-true")
    })

    it("should format a resolved boolean false into the string", () => {
      const res = legacyResolveTemplateString({ string: "foo-${a}", context: new TestContext({ a: false }) })
      expect(res).to.equal("foo-false")
    })

    it("should format a resolved null into the string", () => {
      const res = legacyResolveTemplateString({ string: "foo-${a}", context: new TestContext({ a: null }) })
      expect(res).to.equal("foo-null")
    })
  })

  context("contains operator", () => {
    it("should throw when right-hand side is not a primitive", () => {
      const c = new TestContext({ a: [1, 2], b: [3, 4] })

      void expectError(() => legacyResolveTemplateString({ string: "${a contains b}", context: c }), {
        contains:
          "Invalid template string (${a contains b}): The right-hand side of a 'contains' operator must be a string, number, boolean or null (got object).",
      })
    })

    it("should throw when left-hand side is not a string, array or object", () => {
      const c = new TestContext({ a: "foo", b: null })

      void expectError(() => legacyResolveTemplateString({ string: "${b contains a}", context: c }), {
        contains:
          "Invalid template string (${b contains a}): The left-hand side of a 'contains' operator must be a string, array or object (got null).",
      })
    })

    it("positive string literal contains string literal", () => {
      const res = legacyResolveTemplateString({ string: "${'foobar' contains 'foo'}", context: new TestContext({}) })
      expect(res).to.equal(true)
    })

    it("string literal contains string literal (negative)", () => {
      const res = legacyResolveTemplateString({
        string: "${'blorg' contains 'blarg'}",
        context: new TestContext({}),
      })
      expect(res).to.equal(false)
    })

    it("string literal contains string reference", () => {
      const res = legacyResolveTemplateString({
        string: "${a contains 'foo'}",
        context: new TestContext({ a: "foobar" }),
      })
      expect(res).to.equal(true)
    })

    it("string reference contains string literal (negative)", () => {
      const res = legacyResolveTemplateString({
        string: "${a contains 'blarg'}",
        context: new TestContext({ a: "foobar" }),
      })
      expect(res).to.equal(false)
    })

    it("string contains number", () => {
      const res = legacyResolveTemplateString({
        string: "${a contains 0}",
        context: new TestContext({ a: "hmm-0" }),
      })
      expect(res).to.equal(true)
    })

    it("object contains string literal", () => {
      const res = legacyResolveTemplateString({
        string: "${a contains 'foo'}",
        context: new TestContext({ a: { foo: 123 } }),
      })
      expect(res).to.equal(true)
    })

    it("object contains string literal (negative)", () => {
      const res = legacyResolveTemplateString({
        string: "${a contains 'bar'}",
        context: new TestContext({ a: { foo: 123 } }),
      })
      expect(res).to.equal(false)
    })

    it("object contains string reference", () => {
      const res = legacyResolveTemplateString({
        string: "${a contains b}",
        context: new TestContext({ a: { foo: 123 }, b: "foo" }),
      })
      expect(res).to.equal(true)
    })

    it("object contains number reference", () => {
      const res = legacyResolveTemplateString({
        string: "${a contains b}",
        context: new TestContext({ a: { 123: 456 }, b: 123 }),
      })
      expect(res).to.equal(true)
    })

    it("object contains number literal", () => {
      const res = legacyResolveTemplateString({
        string: "${a contains 123}",
        context: new TestContext({ a: { 123: 456 } }),
      })
      expect(res).to.equal(true)
    })

    it("array contains string reference", () => {
      const res = legacyResolveTemplateString({
        string: "${a contains b}",
        context: new TestContext({ a: ["foo"], b: "foo" }),
      })
      expect(res).to.equal(true)
    })

    it("array contains string reference (negative)", () => {
      const res = legacyResolveTemplateString({
        string: "${a contains b}",
        context: new TestContext({ a: ["foo"], b: "bar" }),
      })
      expect(res).to.equal(false)
    })

    it("array contains string literal", () => {
      const res = legacyResolveTemplateString({
        string: "${a contains 'foo'}",
        context: new TestContext({ a: ["foo"] }),
      })
      expect(res).to.equal(true)
    })

    it("array contains number", () => {
      const res = legacyResolveTemplateString({ string: "${a contains 1}", context: new TestContext({ a: [0, 1] }) })
      expect(res).to.equal(true)
    })

    it("array contains numeric index (negative)", () => {
      const res = legacyResolveTemplateString({ string: "${a contains 1}", context: new TestContext({ a: [0] }) })
      expect(res).to.equal(false)
    })
  })

  context("conditional blocks", () => {
    it("One single-line if block (positive)", () => {
      const res = legacyResolveTemplateString({
        string: "prefix ${if a}content ${endif}suffix",
        context: new TestContext({ a: true }),
      })
      expect(res).to.equal("prefix content suffix")
    })

    it("One single-line if block (negative)", () => {
      const res = legacyResolveTemplateString({
        string: "prefix ${if a}content ${endif}suffix",
        context: new TestContext({ a: false }),
      })
      expect(res).to.equal("prefix suffix")
    })

    it("One single-line if/else statement (positive)", () => {
      const res = legacyResolveTemplateString({
        string: "prefix ${if a == 123}content ${else}other ${endif}suffix",
        context: new TestContext({ a: 123 }),
      })
      expect(res).to.equal("prefix content suffix")
    })

    it("One single-line if/else statement (negative)", () => {
      const res = legacyResolveTemplateString({
        string: "prefix ${if a}content ${else}other ${endif}suffix",
        context: new TestContext({ a: false }),
      })
      expect(res).to.equal("prefix other suffix")
    })

    it("Two single-line if block (positive)", () => {
      const res = legacyResolveTemplateString({
        string: "prefix ${if a}content ${endif}suffixprefix ${if a}content ${endif}suffix",
        context: new TestContext({ a: true }),
      })
      expect(res).to.equal("prefix content suffixprefix content suffix")
    })

    it("Two single-line if block (negative)", () => {
      const res = legacyResolveTemplateString({
        string: "prefix ${if a}content ${endif}suffixprefix ${if a}content ${endif}suffix",
        context: new TestContext({ a: false }),
      })
      expect(res).to.equal("prefix suffixprefix suffix")
    })

    it("Two single-line if/else statement (positive)", () => {
      const res = legacyResolveTemplateString({
        string:
          "prefix ${if a == 123}content ${else}other ${endif}suffixprefix ${if a == 123}content ${else}other ${endif}suffix",
        context: new TestContext({ a: 123 }),
      })
      expect(res).to.equal("prefix content suffixprefix content suffix")
    })

    it("Two single-line if/else statement (negative)", () => {
      const res = legacyResolveTemplateString({
        string: "prefix ${if a}content ${else}other ${endif}suffixprefix ${if a}content ${else}other ${endif}suffix",
        context: new TestContext({ a: false }),
      })
      expect(res).to.equal("prefix other suffixprefix other suffix")
    })

    it("multi-line if block (positive)", () => {
      const res = legacyResolveTemplateString({
        string: "prefix\n${if a}content\n${endif}suffix",
        context: new TestContext({ a: true }),
      })
      expect(res).to.equal(dedent`
        prefix
        content
        suffix
      `)
    })

    it("template string within if block", () => {
      const res = legacyResolveTemplateString({
        string: "prefix\n${if a}templated: ${b}\n${endif}suffix",
        context: new TestContext({ a: true, b: "content" }),
      })
      expect(res).to.equal(dedent`
        prefix
        templated: content
        suffix
      `)
    })

    it("nested if block (both positive)", () => {
      const res = legacyResolveTemplateString({
        string: "prefix\n${if a}some ${if b}content\n${endif}${endif}suffix",
        context: new TestContext({ a: true, b: true }),
      })
      expect(res).to.equal(dedent`
        prefix
        some content
        suffix
      `)
    })

    it("nested if block (outer negative)", () => {
      const res = legacyResolveTemplateString({
        string: "prefix\n${if a}some ${if b}content\n${endif}${endif}suffix",
        context: new TestContext({ a: false, b: true }),
      })
      expect(res).to.equal(dedent`
        prefix
        suffix
      `)
    })

    it("nested if block (inner negative)", () => {
      const res = legacyResolveTemplateString({
        string: "prefix\n${if a}some\n${if b}content\n${endif}${endif}suffix",
        context: new TestContext({ a: true, b: false }),
      })
      expect(res).to.equal(dedent`
        prefix
        some
        suffix
      `)
    })

    it("if/else statement inside if block", () => {
      const res = legacyResolveTemplateString({
        string: "prefix\n${if a}some\n${if b}nope${else}content\n${endif}${endif}suffix",
        context: new TestContext({ a: true, b: false }),
      })
      expect(res).to.equal(dedent`
        prefix
        some
        content
        suffix
      `)
    })

    it("if block inside if/else statement", () => {
      const res = legacyResolveTemplateString({
        string: "prefix\n${if a}some\n${if b}content\n${endif}${else}nope ${endif}suffix",
        context: new TestContext({ a: true, b: false }),
      })
      expect(res).to.equal(dedent`
        prefix
        some
        suffix
      `)
    })

    it("it ignores ? after an if block", () => {
      const res = legacyResolveTemplateString({
        string: "prefix ${if a}?content${endif}",
        context: new TestContext({ a: true }),
      })
      expect(res).to.equal("prefix ?content")
    })

    it("throws if an if block doesn't have a matching endif", () => {
      void expectError(
        () => legacyResolveTemplateString({ string: "prefix ${if a}content", context: new TestContext({ a: true }) }),
        {
          contains: "Invalid template string (prefix ${if a}content): Missing ${endif} after ${if ...} block.",
        }
      )
    })
    it("throws if an if block doesn't have a matching endif inside another if block that is closed", () => {
      void expectError(
        () =>
          legacyResolveTemplateString({
            string: '${if "foo"}${if "this is bananas!"}${endif}',
            context: new TestContext({ a: true }),
          }),
        {
          contains:
            'Invalid template string (${if "foo"}${if "this is bananas!"}${endif}): Missing ${endif} after ${if ...} block.',
        }
      )
    })

    it("throws if an endif block doesn't have a matching if", () => {
      void expectError(
        () => legacyResolveTemplateString({ string: "prefix content ${endif}", context: new TestContext({ a: true }) }),
        {
          contains:
            "Invalid template string (prefix content ${endif}): Found ${endif} block without a preceding ${if...} block.",
        }
      )
    })

    it("throws if an if block doesn't have a matching endif and there is content", () => {
      void expectError(
        () => legacyResolveTemplateString({ string: "${if a}content", context: new TestContext({ a: true }) }),
        {
          contains: "Invalid template string (${if a}content): Missing ${endif} after ${if ...} block.",
        }
      )
    })
  })

  context("helper functions", () => {
    it("resolves a helper function with a string literal", () => {
      const res = legacyResolveTemplateString({ string: "${base64Encode('foo')}", context: new TestContext({}) })
      expect(res).to.equal("Zm9v")
    })

    it("resolves a template string in a helper argument", () => {
      const res = legacyResolveTemplateString({
        string: "${base64Encode('${a}')}",
        context: new TestContext({ a: "foo" }),
      })
      expect(res).to.equal("Zm9v")
    })

    it("resolves a helper function with multiple arguments", () => {
      const res = legacyResolveTemplateString({ string: "${split('a,b,c', ',')}", context: new TestContext({}) })
      expect(res).to.eql(["a", "b", "c"])
    })

    it("resolves a helper function with a template key reference", () => {
      const res = legacyResolveTemplateString({
        string: "${base64Encode(a)}",
        context: new TestContext({ a: "foo" }),
      })
      expect(res).to.equal("Zm9v")
    })

    it("generates a correct hash with a string literal from the sha256 helper function", () => {
      const res = legacyResolveTemplateString({
        string: "${sha256('This Is A Test String')}",
        context: new TestContext({}),
      })
      expect(res).to.equal("9a058284378d1cc6b4348aacb6ba847918376054b094bbe06eb5302defc52685")
    })

    it("throws if an argument is missing", () => {
      void expectError(
        () => legacyResolveTemplateString({ string: "${base64Decode()}", context: new TestContext({}) }),
        {
          contains:
            "Invalid template string (${base64Decode()}): Missing argument 'string' (at index 0) for base64Decode helper function.",
        }
      )
    })

    it("throws if a wrong argument type is passed", () => {
      void expectError(
        () => legacyResolveTemplateString({ string: "${base64Decode(a)}", context: new TestContext({ a: 1234 }) }),
        {
          contains:
            "Invalid template string (${base64Decode(a)}): Error validating argument 'string' for base64Decode helper function:\n\nvalue must be a string",
        }
      )
    })

    it("throws if the function can't be found", () => {
      void expectError(
        () => legacyResolveTemplateString({ string: "${floop('blop')}", context: new TestContext({}) }),
        {
          contains:
            "Invalid template string (${floop('blop')}): Could not find helper function 'floop'. Available helper functions:",
        }
      )
    })

    it("throws if the function fails", () => {
      void expectError(
        () => legacyResolveTemplateString({ string: "${jsonDecode('{]}')}", context: new TestContext({}) }),
        {
          contains:
            "Invalid template string (${jsonDecode('{]}')}): Error from helper function jsonDecode: SyntaxError",
        }
      )
    })

    context("concat", () => {
      it("allows empty strings", () => {
        const res = legacyResolveTemplateString({ string: "${concat('', '')}", context: new TestContext({}) })
        expect(res).to.equal("")
      })

      context("throws when", () => {
        function expectArgTypeError({
          template,
          GenericContextVars = {},
          errorMessage,
        }: {
          template: string
          GenericContextVars?: Collection<ParsedTemplate | ConfigContext> | ParsedTemplate
          errorMessage: string
        }) {
          void expectError(
            () => legacyResolveTemplateString({ string: template, context: new TestContext(GenericContextVars) }),
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
          const res = legacyResolveTemplateString({ string: "${isEmpty(null)}", context: new TestContext({}) })
          expect(res).to.be.true
        })

        it("resolves references to null as 'true'", () => {
          const res = legacyResolveTemplateString({ string: "${isEmpty(a)}", context: new TestContext({ a: null }) })
          expect(res).to.be.true
        })
      })

      context("allows empty strings", () => {
        it("resolves an empty string as 'true'", () => {
          const res = legacyResolveTemplateString({ string: "${isEmpty('')}", context: new TestContext({}) })
          expect(res).to.be.true
        })

        it("resolves a reference to an empty string as 'true'", () => {
          const res = legacyResolveTemplateString({ string: "${isEmpty(a)}", context: new TestContext({ a: "" }) })
          expect(res).to.be.true
        })
      })
    })

    context("slice", () => {
      it("allows numeric indices", () => {
        const res = legacyResolveTemplateString({
          string: "${slice(foo, 0, 3)}",
          context: new TestContext({ foo: "abcdef" }),
        })
        expect(res).to.equal("abc")
      })

      it("allows numeric strings as indices", () => {
        const res = legacyResolveTemplateString({
          string: "${slice(foo, '0', '3')}",
          context: new TestContext({ foo: "abcdef" }),
        })
        expect(res).to.equal("abc")
      })

      it("throws on invalid string in the start index", () => {
        void expectError(
          () =>
            legacyResolveTemplateString({
              string: "${slice(foo, 'a', 3)}",
              context: new TestContext({ foo: "abcdef" }),
            }),
          {
            contains: `Invalid template string (\${slice(foo, 'a', 3)}): Error from helper function slice: Error: start index must be a number or a numeric string (got "a")`,
          }
        )
      })

      it("throws on invalid string in the end index", () => {
        void expectError(
          () =>
            legacyResolveTemplateString({
              string: "${slice(foo, 0, 'b')}",
              context: new TestContext({ foo: "abcdef" }),
            }),
          {
            contains: `Invalid template string (\${slice(foo, 0, 'b')}): Error from helper function slice: Error: end index must be a number or a numeric string (got "b")`,
          }
        )
      })
    })
  })

  context("array literals", () => {
    it("returns an empty array literal back", () => {
      const res = legacyResolveTemplateString({ string: "${[]}", context: new TestContext({}) })
      expect(res).to.eql([])
    })

    it("returns an array literal of literals back", () => {
      const res = legacyResolveTemplateString({
        string: "${['foo', \"bar\", 123, true, false]}",
        context: new TestContext({}),
      })
      expect(res).to.eql(["foo", "bar", 123, true, false])
    })

    it("resolves a key in an array literal", () => {
      const res = legacyResolveTemplateString({ string: "${[foo]}", context: new TestContext({ foo: "bar" }) })
      expect(res).to.eql(["bar"])
    })

    it("resolves a nested key in an array literal", () => {
      const res = legacyResolveTemplateString({
        string: "${[foo.bar]}",
        context: new TestContext({ foo: { bar: "baz" } }),
      })
      expect(res).to.eql(["baz"])
    })

    it("calls a helper in an array literal", () => {
      const res = legacyResolveTemplateString({
        string: "${[foo, base64Encode('foo')]}",
        context: new TestContext({ foo: "bar" }),
      })
      expect(res).to.eql(["bar", "Zm9v"])
    })

    it("calls a helper with an array literal argument", () => {
      const res = legacyResolveTemplateString({
        string: "${join(['foo', 'bar'], ',')}",
        context: new TestContext({}),
      })
      expect(res).to.eql("foo,bar")
    })

    it("allows empty string separator in join helper function", () => {
      const res = legacyResolveTemplateString({
        string: "${join(['foo', 'bar'], '')}",
        context: new TestContext({}),
      })
      expect(res).to.eql("foobar")
    })
  })
})

describe("parse and evaluate template collections", () => {
  it("should resolve all template strings in an object with the given context", () => {
    const obj = {
      some: "${key}",
      other: {
        nested: "${something}",
        noTemplate: "at-all",
      },
    }
    const context = new TestContext({
      key: "value",
      something: "else",
    })

    const parsed = parseTemplateCollection({ source: { path: [] }, value: obj })
    const result = deepEvaluate(parsed, { context, opts: {} })

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
      some: "${key || null}",
      other: "${missing || null}",
    }
    const context = new TestContext({
      key: "value",
    })

    const parsed = parseTemplateCollection({ source: { path: [] }, value: obj })
    const result = deepEvaluate(parsed, { context, opts: {} })

    expect(result).to.eql({
      some: "value",
      other: null,
    })
  })

  it("should collapse merge operator keys on objects", () => {
    const obj = {
      $merge: { a: "a", b: "b" },
      b: "B",
      c: "c",
    }
    const context = new TestContext({})

    const parsed = parseTemplateCollection({ source: { path: [] }, value: obj })
    const result = deepEvaluate(parsed, { context, opts: {} })

    expect(result).to.eql({
      a: "a",
      b: "B",
      c: "c",
    })
  })

  it("should collapse merge operator keys based on position on object", () => {
    const obj = {
      b: "B",
      c: "c",
      $merge: { a: "a", b: "b" },
    }
    const context = new TestContext({})

    const parsed = parseTemplateCollection({ source: { path: [] }, value: obj })
    const result = deepEvaluate(parsed, { context, opts: {} })

    expect(result).to.eql({
      a: "a",
      b: "b",
      c: "c",
    })
  })

  it("should resolve merge operator before collapsing", () => {
    const obj = {
      $merge: "${obj}",
      b: "B",
      c: "c",
    }
    const context = new TestContext({ obj: { a: "a", b: "b" } })

    const parsed = parseTemplateCollection({ source: { path: [] }, value: obj })
    const result = deepEvaluate(parsed, { context, opts: {} })

    expect(result).to.eql({
      a: "a",
      b: "B",
      c: "c",
    })
  })

  it("should resolve merge operators depth-first", () => {
    const obj = {
      b: "B",
      c: "c",
      $merge: {
        $merge: "${obj}",
        a: "a",
      },
    }
    const context = new TestContext({ obj: { b: "b" } })

    const parsed = parseTemplateCollection({ source: { path: [] }, value: obj })
    const result = deepEvaluate(parsed, { context, opts: {} })

    expect(result).to.eql({
      a: "a",
      b: "b",
      c: "c",
    })
  })

  it("should resolve merge operator if one object is undefined but it can fall back to another object", () => {
    const obj = {
      $merge: "${var.doesnotexist || var.obj}",
      c: "c",
    }
    const context = new TestContext({ var: { obj: { a: "a", b: "b" } } })

    const parsed = parseTemplateCollection({ value: obj, source: { path: [] } })
    const result = deepEvaluate(parsed, { context, opts: {} })

    expect(result).to.eql({
      a: "a",
      b: "b",
      c: "c",
    })
  })

  it("should resolve merge operator if a dependency cannot be resolved but there's a fallback", () => {
    const obj = {
      "key-value-array": {
        $forEach: "${inputs.merged-object || []}",
        $return: {
          name: "${item.key}",
          value: "${item.value}",
        },
      },
    }
    const context = new TestContext(
      parseTemplateCollection({
        source: { path: [] },
        value: {
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
        },
      })
    )

    const parsed = parseTemplateCollection({ value: obj, source: { path: [] } })
    const result = deepEvaluate(parsed, { context, opts: {} })

    expect(result).to.eql({
      "key-value-array": [
        { name: "EXTERNAL_VAR_1", value: "EXTERNAL_VAR_1" },
        { name: "INTERNAL_VAR_1", value: "INTERNAL_VAR_1" },
      ],
    })
  })

  it("should ignore merge operator if the object to be merged is undefined", () => {
    const context = new TestContext({ var: { obj: { a: "a", b: "b" } } })

    const parsed = parseTemplateCollection({
      value: {
        $merge: "${var.doesnotexist}",
        c: "c",
      },
      source: { path: [] },
    })

    expect(() => deepEvaluate(parsed, { context, opts: {} })).to.throw("Invalid template string")
  })

  context("$concat", () => {
    it("handles array concatenation", () => {
      const obj = {
        foo: ["a", { $concat: ["b", "c"] }, "d"],
      }
      const context = new TestContext({})
      const parsed = parseTemplateCollection({ source: { path: [] }, value: obj })
      const res = deepEvaluate(parsed, { context, opts: {} })
      expect(res).to.eql({
        foo: ["a", "b", "c", "d"],
      })
    })

    it("resolves $concat value before spreading", () => {
      const obj = {
        foo: ["a", { $concat: "${foo}" }, "d"],
      }
      const context = new TestContext({ foo: ["b", "c"] })
      const parsed = parseTemplateCollection({
        source: { path: [] },
        value: obj,
      })
      const res = deepEvaluate(parsed, { context, opts: {} })
      expect(res).to.eql({
        foo: ["a", "b", "c", "d"],
      })
    })

    it("resolves a $forEach in the $concat clause", () => {
      const obj = {
        foo: ["a", { $concat: { $forEach: ["B", "C"], $return: "${lower(item.value)}" } }, "d"],
      }
      const context = new TestContext({ foo: ["b", "c"] })
      const parsed = parseTemplateCollection({
        source: { path: [] },
        value: obj,
      })
      const res = deepEvaluate(parsed, { context, opts: {} })

      expect(res).to.eql({
        foo: ["a", "b", "c", "d"],
      })
    })

    it("throws if $concat value is not an array", () => {
      const obj = {
        foo: ["a", { $concat: "b" }, "d"],
      }

      const context = new TestContext({})
      const parsed = parseTemplateCollection({ source: { path: [] }, value: obj })

      void expectError(() => deepEvaluate(parsed, { context, opts: {} }), {
        contains: "Value of $concat key must be (or resolve to) an array (got string)",
      })
    })

    it("throws if object with $concat key contains other keys as well", () => {
      const obj = {
        foo: ["a", { $concat: "b", nope: "nay", oops: "derp" }, "d"],
      }

      const context = new TestContext({})
      const parsed = parseTemplateCollection({ source: { path: [] }, value: obj })

      void expectError(() => deepEvaluate(parsed, { context, opts: {} }), {
        contains: 'A list item with a $concat key cannot have any other keys (found "nope" and "oops")',
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
      const context = new TestContext({ foo: 1 })
      const parsed = parseTemplateCollection({
        source: { path: [] },
        value: obj,
      })
      const res = deepEvaluate(parsed, { context, opts: {} })
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
      const context = new TestContext({ foo: 2 })
      const parsed = parseTemplateCollection({
        source: { path: [] },
        value: obj,
      })
      const res = deepEvaluate(parsed, { context, opts: {} })
      expect(res).to.eql({ bar: 456 })
    })

    it("resolves to undefined if $if is false and $else is missing", () => {
      const obj = {
        bar: {
          $if: "${foo == 1}",
          $then: 123,
        },
      }
      const context = new TestContext({ foo: 2 })
      const parsed = parseTemplateCollection({
        source: { path: [] },
        value: obj,
      })
      const res = deepEvaluate(parsed, { context, opts: {} })
      expect(res).to.eql({ bar: undefined })
    })

    it("throws if $if doesn't resolve to boolean", () => {
      const obj = {
        bar: {
          $if: "${foo}",
          $then: 123,
        },
      }

      const context = new TestContext({ foo: "bla" })
      const parsed = parseTemplateCollection({ source: { path: [] }, value: obj })

      void expectError(() => deepEvaluate(parsed, { context, opts: {} }), {
        contains: "Value of $if key must be (or resolve to) a boolean (got string)",
      })
    })

    it("throws if $then key is missing", () => {
      const obj = {
        bar: {
          $if: "${foo == 1}",
        },
      }

      void expectError(() => parseTemplateCollection({ source: { path: [] }, value: obj }), {
        contains: "Missing $then field next to $if field",
      })
    })

    it("throws if extra keys are found", () => {
      const obj = {
        bar: {
          $if: "${foo == 1}",
          $then: 123,
          foo: "bla",
        },
      }

      void expectError(() => parseTemplateCollection({ source: { path: [] }, value: obj }), {
        contains: 'Found one or more unexpected keys on $if object: "foo"',
      })
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
      const context = new TestContext({})
      const parsed = parseTemplateCollection({ source: { path: [] }, value: obj })
      const res = deepEvaluate(parsed, { context, opts: {} })
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
      const context = new TestContext({})
      const parsed = parseTemplateCollection({ source: { path: [] }, value: obj })
      const res = deepEvaluate(parsed, { context, opts: {} })
      expect(res).to.eql({
        foo: ["a: 1", "b: 2", "c: 3"],
      })
    })

    it("throws if the input isn't a list or object", () => {
      const obj = {
        foo: {
          $forEach: "foo",
          $return: "foo",
        },
      }
      const context = new TestContext({})
      const parsed = parseTemplateCollection({ source: { path: [] }, value: obj })
      void expectError(() => deepEvaluate(parsed, { context, opts: {} }), {
        contains: "Value of $forEach key must be (or resolve to) an array or mapping object (got string)",
      })
    })

    it("throws if there's no $return clause", () => {
      const obj = {
        foo: {
          $forEach: [1, 2, 3],
        },
      }

      void expectError(() => parseTemplateCollection({ source: { path: [] }, value: obj }), {
        contains: "Missing $return field next to $forEach field.",
      })
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

      void expectError(() => parseTemplateCollection({ source: { path: [] }, value: obj }), {
        contains: 'Found one or more unexpected keys on $forEach object: "$concat" and "foo"',
      })
    })

    it("exposes item.value and item.key when resolving the $return clause", () => {
      const obj = {
        foo: {
          $forEach: "${foo}",
          $return: "${item.key}: ${item.value}",
        },
      }
      const context = new TestContext({ foo: ["a", "b", "c"] })
      const parsed = parseTemplateCollection({
        source: { path: [] },
        value: obj,
      })
      const res = deepEvaluate(parsed, { context, opts: {} })

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
      const context = new TestContext({ foo: ["a", "b", "c"] })
      const parsed = parseTemplateCollection({
        source: { path: [] },
        value: obj,
      })
      const res = deepEvaluate(parsed, { context, opts: {} })

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
      const context = new TestContext({ foo: ["a", "b", "c"] })
      const parsed = parseTemplateCollection({
        source: { path: [] },
        value: obj,
      })
      const res = deepEvaluate(parsed, { context, opts: {} })

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
      const context = new TestContext({})
      const parsed = parseTemplateCollection({ source: { path: [] }, value: obj })
      void expectError(() => deepEvaluate(parsed, { context, opts: {} }), {
        contains: "$filter clause in $forEach loop must resolve to a boolean value (got string)",
      })
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
      const context = new TestContext({})
      const parsed = parseTemplateCollection({ source: { path: [] }, value: obj })
      const res = deepEvaluate(parsed, { context, opts: {} })

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
      const context = new TestContext({})
      const parsed = parseTemplateCollection({ source: { path: [] }, value: obj })
      const res = deepEvaluate(parsed, { context, opts: {} })

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
      const context = new TestContext({})
      const parsed = parseTemplateCollection({ source: { path: [] }, value: obj })
      const res = deepEvaluate(parsed, { context, opts: {} })

      expect(res).to.eql({
        foo: [],
      })
    })

    it("merge operator should correctly merge objects with overlapping property names inside $forEach loop", () => {
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

      const context = new TestContext({ services })
      const parsed = parseTemplateCollection({
        source: { path: [] },
        value: obj,
      })
      const res = deepEvaluate(parsed, { context, opts: {} })

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
    const obj = parseTemplateCollection({
      value: {
        foo: "${my.reference}",
        nested: {
          boo: "${moo}",
          foo: "lalalla${moo}${moo}",
          banana: "${banana.rama.llama}",
        },
      },
      source: { path: [] },
    })

    const result = Array.from(
      getContextLookupReferences(
        visitAll({
          value: obj,
          opts: defaultVisitorOpts,
        }),
        new TestContext({}),
        {}
      )
    )
    const expected: Partial<ContextLookupReferenceFinding>[] = [
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
    expect(result.map((r) => pick(r, "keyPath", "type", "yamlSource"))).to.eql(expected)
  })

  const unresolvableMemberTestCases = [
    {
      name: "templated key with dots",
      expression: "some ${templated['key.with.dots']}",
      expectation: () => [
        {
          type: "resolvable",
          keyPath: ["templated", "key.with.dots"],
          yamlSource: {
            path: [],
          },
        },
      ],
    },
    {
      name: "unresolvable property",
      expression: "${more.stuff}",
      expectation: () => [
        {
          type: "resolvable",
          keyPath: ["more", "stuff"],
          yamlSource: {
            path: [],
          },
        },
      ],
    },
    {
      name: "direct unresolvable indexed access",
      expression: "${keyThatIs[unresolvable]}",
      expectation: (foundKeys: ContextLookupReferenceFinding[]) => {
        const unresolvable = foundKeys[0].keyPath[1] as UnresolvableValue
        expect(unresolvable).to.be.instanceOf(UnresolvableValue)
        expectFuzzyMatch(
          unresolvable.getError().message,
          "invalid template string (${keythatis[unresolvable]}): could not find key unresolvable."
        )

        return [
          {
            type: "unresolvable",
            keyPath: ["keyThatIs", foundKeys[0].keyPath[1]],
            yamlSource: {
              path: [],
            },
          },
          {
            type: "resolvable",
            keyPath: ["unresolvable"],
            yamlSource: {
              path: [],
            },
          },
        ]
      },
    },
    {
      name: "nested unresolvable indexed access",
      expression: '${keyThatIs["${unresolvable}"]}',
      expectation: (foundKeys: ContextLookupReferenceFinding[]) => {
        const unresolvable = foundKeys[0].keyPath[1] as UnresolvableValue
        expect(unresolvable).to.be.instanceOf(UnresolvableValue)
        expectFuzzyMatch(
          unresolvable.getError().message,
          "invalid template string (${unresolvable}): could not find key unresolvable."
        )

        return [
          {
            type: "unresolvable",
            keyPath: ["keyThatIs", foundKeys[0].keyPath[1]],
            yamlSource: {
              path: [],
            },
          },
          {
            type: "resolvable",
            keyPath: ["unresolvable"],
            yamlSource: {
              path: [],
            },
          },
        ]
      },
    },
    {
      name: "optional and unresolvable",
      expression: "${optionalAndUnresolvable}?",
      expectation: () => [
        {
          type: "resolvable",
          keyPath: ["optionalAndUnresolvable"],
          yamlSource: {
            path: [],
          },
        },
      ],
    },
  ]

  for (const testCase of unresolvableMemberTestCases) {
    it(`should handle keys with dots and unresolvable member expressions correctly (${testCase.name})`, async () => {
      const obj = parseTemplateCollection({
        value: testCase.expression,
        source: {
          path: [],
        },
      })
      const foundKeys = Array.from(
        getContextLookupReferences(
          visitAll({
            value: obj,
            opts: defaultVisitorOpts,
          }),
          new TestContext({}),
          {}
        )
      )

      expect(foundKeys.map((r) => pick(r, "keyPath", "type", "yamlSource"))).to.eql(testCase.expectation(foundKeys))
    })
  }

  const branchTestCases = [
    // logical OR
    {
      name: "logical OR - true",
      expression: "${true || unreachable}",
      expectedReferences: [],
    },
    {
      name: "logical OR - false",
      expression: "${false || reachable}",
      expectedReferences: [
        {
          keyPath: ["reachable"],
        },
      ],
    },
    {
      name: "logical OR - failed lookup",
      expression: "${doesNotExist || reachable}",
      expectedReferences: [
        {
          keyPath: ["doesNotExist"],
        },
        {
          keyPath: ["reachable"],
        },
      ],
    },

    // logical AND
    {
      name: "logical AND - false",
      expression: "${false && unreachable}",
      expectedReferences: [],
    },
    {
      name: "logical AND - true",
      expression: "${true && reachable}",
      expectedReferences: [
        {
          keyPath: ["reachable"],
        },
      ],
    },
    {
      name: "logical AND - failed lookup",
      expression: "${doesNotExist && unreachable}",
      expectedReferences: [
        {
          keyPath: ["doesNotExist"],
        },
      ],
    },

    // ternary expression
    {
      name: "ternary expression - true",
      expression: "${ true ? reachableConsequent : unreachableAlternate }",
      expectedReferences: [
        {
          keyPath: ["reachableConsequent"],
        },
      ],
    },
    {
      name: "ternary expression - false",
      expression: "${ false ? unreachableConsequent : reachableAlternate }",
      expectedReferences: [
        {
          keyPath: ["reachableAlternate"],
        },
      ],
    },
    {
      name: "ternary expression - failed lookup",
      expression: "${ doesNotExist ? unreachableConsequent : reachableAlternate }",
      expectedReferences: [
        {
          keyPath: ["doesNotExist"],
        },
        {
          keyPath: ["reachableAlternate"],
        },
      ],
    },

    // if block expression
    {
      name: "if block expression - true",
      expression: "${if true}${reachableConsequent}${else}${unreachableAlternate}${endif}",
      expectedReferences: [
        {
          keyPath: ["reachableConsequent"],
        },
      ],
    },
    {
      name: "if block expression - false",
      expression: "${if false}${unreachableConsequent}${else}${reachableAlternate}${endif}",
      expectedReferences: [
        {
          keyPath: ["reachableAlternate"],
        },
      ],
    },
    {
      name: "if block expression - failed lookup",
      expression: "${if doesNotExist}${reachableConsequent}${else}${reachableAlternate}${endif}",
      expectedReferences: [
        {
          keyPath: ["doesNotExist"],
        },
        {
          keyPath: ["reachableConsequent"],
        },
        {
          keyPath: ["reachableAlternate"],
        },
      ],
    },
    {
      name: "if block expression without consequent",
      expression: "${if doesNotExist}",
      expectedReferences: [
        {
          keyPath: ["doesNotExist"],
        },
      ],
    },

    // if structural operator
    {
      name: "if structural operator - true",
      expression: {
        $if: "${true}",
        $then: "${reachableConsequent}",
        $else: "${unreachableAlternate}",
      },
      expectedReferences: [
        {
          keyPath: ["reachableConsequent"],
        },
      ],
    },
    {
      name: "if structural operator - false",
      expression: {
        $if: "${false}",
        $then: "${unreachableConsequent}",
        $else: "${reachableAlternate}",
      },
      expectedReferences: [
        {
          keyPath: ["reachableAlternate"],
        },
      ],
    },
    {
      name: "if structural operator - non-boolean",
      expression: {
        $if: "non-boolean value",
        $then: "${unreachableConsequent}",
        $else: "${unreachableAlternate}",
      },
      expectedReferences: [],
    },
    {
      name: "if structural operator - failed lookup",
      expression: {
        $if: "${doesNotExist}",
        $then: "${reachableConsequent}",
        $else: "${reachableAlternate}",
      },
      expectedReferences: [
        {
          keyPath: ["doesNotExist"],
        },
        {
          keyPath: ["reachableConsequent"],
        },
        {
          keyPath: ["reachableAlternate"],
        },
      ],
    },
  ]
  for (const testCase of branchTestCases) {
    it(`correctly avoids dead code branches (test case: ${testCase.name})`, () => {
      const obj = parseTemplateCollection({
        value: testCase.expression,
        source: {
          path: [],
        },
      })
      const foundKeys = Array.from(
        getContextLookupReferences(
          visitAll({
            value: obj,
            opts: defaultVisitorOpts,
          }),
          new TestContext({}),
          {}
        )
      )

      expect(foundKeys.map((r) => pick(r, "keyPath"))).to.eql(testCase.expectedReferences)
    })
  }
})

describe("getActionTemplateReferences", () => {
  function prepareActionTemplateReferences(config) {
    const parsedConfig = parseTemplateCollection({
      value: config,
      source: { path: [] },
    })
    return Array.from(getActionTemplateReferences(parsedConfig as any, new TestContext({})))
  }

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
      const actionTemplateReferences = prepareActionTemplateReferences(config)
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
      void expectError(() => prepareActionTemplateReferences(config), {
        contains: "Found invalid action reference (missing kind)",
      })
    })

    it("throws if action ref has invalid kind", () => {
      const config = {
        foo: '${actions["badkind"].some-name}',
      }
      void expectError(() => prepareActionTemplateReferences(config), {
        contains: "Found invalid action reference (invalid kind 'badkind')",
      })
    })

    it("throws if action kind is not a string", () => {
      const config = {
        foo: "${actions[123]}",
      }
      void expectError(() => prepareActionTemplateReferences(config), {
        contains: "Found invalid action reference (kind is not a string)",
      })
    })

    it("throws if action kind is not resolvable", () => {
      const config = {
        foo: "${actions[foo.bar].some-name}",
      }
      void expectError(() => prepareActionTemplateReferences(config), {
        contains:
          "found invalid action reference: invalid template string (${actions[foo.bar].some-name}) at path foo: could not find key foo. available keys: (none)",
      })
    })

    it("throws if dynamic action kind is invalid", () => {
      const config = {
        foo: '${actions[foo.bar || "hello"].some-name}',
      }
      void expectError(() => prepareActionTemplateReferences(config), {
        contains: "found invalid action reference (invalid kind 'hello')",
      })
    })

    it("throws if action ref has no name", () => {
      const config = {
        foo: '${actions["build"]}',
      }
      void expectError(() => prepareActionTemplateReferences(config), {
        contains: "Found invalid action reference (missing name)",
      })
    })

    it("throws if action name is not a string in identifier expression", () => {
      const config = {
        foo: '${actions["build"].123}',
      }
      void expectError(() => prepareActionTemplateReferences(config), {
        contains: "Found invalid action reference (name is not a string)",
      })
    })

    it("throws if action name is not a string in member expression", () => {
      const config = {
        foo: '${actions["build"][123]}',
      }
      void expectError(() => prepareActionTemplateReferences(config), {
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
      const actionTemplateReferences = prepareActionTemplateReferences(config)
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
      void expectError(() => prepareActionTemplateReferences(config), {
        contains: "Found invalid runtime reference (missing kind)",
      })
    })

    it("throws if runtime ref has invalid kind", () => {
      const config = {
        foo: '${runtime["badkind"].some-name}',
      }
      void expectError(() => prepareActionTemplateReferences(config), {
        contains: "Found invalid runtime reference (invalid kind 'badkind')",
      })
    })

    it("throws if runtime kind is not a string", () => {
      const config = {
        foo: "${runtime[123]}",
      }
      void expectError(() => prepareActionTemplateReferences(config), {
        contains: "Found invalid runtime reference (kind is not a string)",
      })
    })

    it("throws if runtime kind is not resolvable", () => {
      const config = {
        foo: "${runtime[foo.bar].some-name}",
      }
      void expectError(() => prepareActionTemplateReferences(config), {
        contains:
          "found invalid runtime reference: invalid template string (${runtime[foo.bar].some-name}) at path foo: could not find key foo. available keys: (none).",
      })
    })

    it("throws if runtime ref has no name", () => {
      const config = {
        foo: '${runtime["tasks"]}',
      }
      void expectError(() => prepareActionTemplateReferences(config), {
        contains: "Found invalid runtime reference (missing name)",
      })
    })

    it("throws if runtime ref name is not a string", () => {
      const config = {
        foo: '${runtime["tasks"].123}',
      }
      void expectError(() => prepareActionTemplateReferences(config), {
        contains: "Found invalid runtime reference (name is not a string)",
      })
    })
  })
})

describe("throwOnMissingSecretKeys", () => {
  const cloudBackendDomain = "https://example.com"
  it("should not throw an error if no secrets are referenced", () => {
    const configs = parseTemplateCollection({
      value: [
        {
          name: "foo",
          foo: "${banana.llama}",
          nested: { boo: "${moo}" },
        },
      ],
      source: { path: [] },
    } as const)

    try {
      throwOnMissingSecretKeys({
        configs,
        context: new TestContext({}),
        secrets: {},
        prefix: "Module",
        isLoggedIn: true,
        cloudBackendDomain,
      })
      throwOnMissingSecretKeys({
        configs,
        context: new TestContext({}),
        secrets: { someSecret: "123" },
        prefix: "Module",
        isLoggedIn: true,
        cloudBackendDomain,
      })
    } catch (err) {
      expect.fail("Expected throwOnMissingSecretKeys not to throw")
    }
  })

  it("should not throw an error if secrets are optional in an expression", () => {
    const configs = parseTemplateCollection({
      value: [
        {
          name: "foo",
          foo: "${secret.banana || 'default-banana'}",
          nested: { boo: "${secret.moo ? 1 : 2}" },
        },
      ],
      source: { path: [] },
    } as const)

    try {
      throwOnMissingSecretKeys({
        configs,
        context: new TestContext({}),
        secrets: {},
        prefix: "Module",
        isLoggedIn: true,
        cloudBackendDomain,
      })
      throwOnMissingSecretKeys({
        configs,
        context: new TestContext({}),
        secrets: { someSecret: "123" },
        prefix: "Module",
        isLoggedIn: true,
        cloudBackendDomain,
      })
    } catch (err) {
      expect.fail("Expected throwOnMissingSecretKeys not to throw")
    }
  })

  it("should throw an error if one or more secrets is missing", () => {
    const configs = parseTemplateCollection({
      value: [
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
      ],
      source: { path: [] },
    } as const)

    // The `isLoggedIn` flag affects the error message, assume we're logged in here
    void expectError(
      () =>
        throwOnMissingSecretKeys({
          configs,
          context: new TestContext({}),
          secrets: { b: "123" },
          prefix: "Module",
          isLoggedIn: true,
          cloudBackendDomain,
        }),
      (err) => {
        expect(err.message).to.match(/Module moduleA: a/)
        expect(err.message).to.match(/Module moduleB: a, c/)
        expect(err.message).to.match(/Secret keys with loaded values: b/)
      }
    )

    // The `isLoggedIn` flag affects the error message, assume we're logged in here
    void expectError(
      () =>
        throwOnMissingSecretKeys({
          configs,
          context: new TestContext({}),
          secrets: {},
          prefix: "Module",
          isLoggedIn: true,
          cloudBackendDomain,
        }),
      (err) => {
        expect(err.message).to.match(/Module moduleA: a, b/)
        expect(err.message).to.match(/Module moduleB: a, b, c/)
        expect(err.message).to.match(/Note: You can manage secrets in Garden Cloud./)
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
