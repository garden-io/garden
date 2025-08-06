/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import stripAnsi from "strip-ansi"
import type {
  ConfigContext,
  ContextKey,
  ContextResolveOutputNotFound,
  ContextResolveParams,
} from "../../../../../src/config/template-contexts/base.js"
import {
  ContextWithSchema,
  getUnavailableReason,
  LayeredContext,
  schema,
  GenericContext,
} from "../../../../../src/config/template-contexts/base.js"
import { expectError } from "../../../../helpers.js"
import { joi } from "../../../../../src/config/common.js"
import { parseTemplateString } from "../../../../../src/template/templated-strings.js"
import { deepEvaluate } from "../../../../../src/template/evaluate.js"
import type { Collection } from "../../../../../src/util/objects.js"
import { isPlainObject } from "../../../../../src/util/objects.js"
import { InternalError } from "../../../../../src/exceptions.js"
import { parseTemplateCollection } from "../../../../../src/template/templated-collections.js"
import type { ParsedTemplate, ResolvedTemplate } from "../../../../../src/template/types.js"

export class TestContext extends GenericContext {
  constructor(obj: ParsedTemplate | Collection<ParsedTemplate | ConfigContext>) {
    super("test", obj)
  }

  /**
   * Helper to test contexts with fewer lines of code.
   */
  eval(rawTemplateString: string): ResolvedTemplate {
    const parsed = parseTemplateString({
      rawTemplateString,
      source: {
        path: [],
      },
    })
    return deepEvaluate(parsed, { context: this, opts: {} })
  }

  addValues(obj: Collection<ParsedTemplate | ConfigContext>) {
    if (!isPlainObject(this.data)) {
      throw new InternalError({
        message: "TestContext expects data to be a plain object",
      })
    }
    Object.assign(this.data, obj)
  }
}

describe("ConfigContext", () => {
  describe("resolve", () => {
    // just a shorthand to aid in testing
    function resolveKey(c: ConfigContext, key: ContextKey, opts = {}) {
      return c.resolve({ nodePath: [], key, opts })
    }

    it("should resolve simple keys", async () => {
      const c = new TestContext({ basic: "value" })
      expect(resolveKey(c, ["basic"])).to.eql({ found: true, resolved: "value" })
    })

    it("should return found: false for missing key", async () => {
      const c = new TestContext({})
      const result = resolveKey(c, ["basic"])
      expect(result.found).to.be.equal(false)
      expect(stripAnsi(getUnavailableReason(result))).to.include("Could not find key basic")
    })

    it("should throw when looking for nested value on primitive", async () => {
      const c = new TestContext({ basic: "value" })
      await expectError(() => resolveKey(c, ["basic", "nested"]), "context-resolve")
    })

    it("should resolve nested keys", async () => {
      const c = new TestContext({ nested: { key: "value" } })
      expect(resolveKey(c, ["nested", "key"])).eql({ found: true, resolved: "value" })
    })

    it("should resolve keys on nested contexts", async () => {
      const c = new TestContext({
        nested: new TestContext({ key: "value" }),
      })
      expect(resolveKey(c, ["nested", "key"])).eql({ found: true, resolved: "value" })
    })

    it("should return found: false for missing keys on nested context", async () => {
      const c = new TestContext({
        nested: new TestContext({ key: "value" }),
      })
      const result = resolveKey(c, ["basic", "bla"])
      expect(result.found).to.be.equal(false)
      expect(stripAnsi(getUnavailableReason(result))).to.equal("Could not find key basic. Available keys: nested.")
    })

    it("should cache resolved values", async () => {
      const nested = new TestContext({ key: "value" })
      const c = new TestContext({
        nested,
      })
      resolveKey(c, ["nested", "key"])

      nested.addValues({
        key: "foo",
      })

      expect(resolveKey(c, ["nested", "key"])).to.eql({ found: true, resolved: "value" })
    })

    it("should detect a circular reference from a nested context", async () => {
      class NestedContextOne extends ContextWithSchema {
        override resolve({ opts, rootContext }: ContextResolveParams) {
          return c.resolve({ nodePath: [], key: ["nestedOne", "bla"], opts, rootContext })
        }
      }

      const nestedTwo = new TestContext({})
      nestedTwo.addValues({
        bla: nestedTwo,
      })

      const c = new TestContext({
        nestedOne: new NestedContextOne("nestedOne"),
        nestedTwo,
      })

      await expectError(() => resolveKey(c, ["nestedOne", "bla"]), "context-resolve")
      await expectError(() => resolveKey(c, ["nestedTwo", "bla"]), "context-resolve")
    })

    it("should return helpful message when unable to resolve nested key in map", async () => {
      class Context extends ContextWithSchema {
        nested: Map<string, string>

        constructor() {
          super("context")
          this.nested = new Map()
        }
      }

      const c = new Context()
      const result = resolveKey(c, ["nested", "bla"])
      expect(stripAnsi(getUnavailableReason(result))).to.include("Could not find key bla under nested.")
    })

    it("should show helpful error when unable to resolve nested key in object", async () => {
      class Context extends ContextWithSchema {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nested: any

        constructor() {
          super("context")
          this.nested = {}
        }
      }

      const c = new Context()
      const result = resolveKey(c, ["nested", "bla"])
      expect(stripAnsi(getUnavailableReason(result))).to.include("Could not find key bla under nested.")
    })

    it("should show helpful error when unable to resolve two-level nested key in object", async () => {
      class Context extends ContextWithSchema {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nested: any

        constructor() {
          super("context")
          this.nested = { deeper: {} }
        }
      }

      const c = new Context()
      const result = resolveKey(c, ["nested", "deeper", "bla"])
      expect(stripAnsi(getUnavailableReason(result))).to.include("Could not find key bla under nested.deeper.")
    })

    it("should show helpful error when unable to resolve in nested context", async () => {
      class Nested extends ContextWithSchema {}

      class Context extends ContextWithSchema {
        nested: ContextWithSchema

        constructor() {
          super("context")
          this.nested = new Nested("nested")
        }
      }

      const c = new Context()
      const result = resolveKey(c, ["nested", "bla"])
      expect(stripAnsi(getUnavailableReason(result))).to.include("Could not find key bla under nested.")
    })

    it("should resolve template strings", async () => {
      const c = new TestContext({
        foo: "value",
      })
      const nested = new TestContext(parseTemplateCollection({ value: { key: "${foo}" }, source: { path: [] } }))
      c.addValues({ nested })
      expect(resolveKey(c, ["nested", "key"])).to.eql({ found: true, resolved: "value" })
    })

    it("should resolve template strings with nested context", async () => {
      const c = new TestContext({
        foo: "bar",
      })
      const nested = new TestContext(
        parseTemplateCollection({ value: { key: "${nested.foo}", foo: "value" }, source: { path: [] } })
      )
      c.addValues({ nested })
      expect(resolveKey(c, ["nested", "key"])).to.eql({ found: true, resolved: "value" })
    })

    it("should return a not-found value when a self-reference is encountered", async () => {
      const c = new TestContext(parseTemplateCollection({ value: { key: "${key}" }, source: { path: [] } }))
      const res = resolveKey(c, ["key"])
      expect(res.found).to.be.equal(false)
    })

    it("should detect a nested self-reference when resolving a template string", async () => {
      const c = new TestContext({
        foo: "bar",
      })
      const nested = new TestContext(parseTemplateCollection({ value: { key: "${nested.key}" }, source: { path: [] } }))
      c.addValues({ nested })
      expect(resolveKey(c, ["nested", "key"]).found).to.eql(false)
    })

    it("should detect a circular reference when resolving a template string", async () => {
      const c = new TestContext({
        foo: "bar",
      })
      const nested = new TestContext(
        parseTemplateCollection({ value: { key: "${nested.foo}", foo: "${nested.key}" }, source: { path: [] } })
      )
      c.addValues({ nested })
      expect(resolveKey(c, ["nested", "key"]).found).to.eql(false)
    })

    it("should return a not-found value when a circular reference is detected in a nested template string", async () => {
      const c = new TestContext({
        foo: "bar",
      })
      const nested = new TestContext(
        parseTemplateCollection({ value: { key: "${nested.foo}", foo: "${'${nested.key}'}" }, source: { path: [] } })
      )
      c.addValues({ nested })
      expect(resolveKey(c, ["nested", "key"]).found).to.eql(false)
    })

    it("should detect a not-found when nested template string resolves to self", async () => {
      const c = new TestContext({
        foo: "bar",
      })
      const nested = new TestContext(
        parseTemplateCollection({ value: { key: "${'${nested.key}'}" }, source: { path: [] } })
      )
      c.addValues({ nested })
      expect(resolveKey(c, ["nested", "key"]).found).to.eql(false)
    })
  })

  describe("getSchema", () => {
    it("should return a Joi object schema with all described attributes", () => {
      class Nested extends ContextWithSchema {
        @schema(joi.string().description("Nested description"))
        nestedKey?: string
      }

      class Context extends ContextWithSchema {
        @schema(joi.string().description("Some description"))
        key?: string

        @schema(Nested.getSchema().description("A nested context"))
        nested?: Nested

        // this should simply be ignored
        foo = "bar"
      }

      const contextSchema = Context.getSchema()
      const description = contextSchema.describe()

      expect(description).to.eql({
        type: "object",
        flags: { presence: "required" },
        keys: {
          key: { type: "string", flags: { description: "Some description" } },
          nested: {
            type: "object",
            flags: { presence: "required", description: "A nested context" },
            keys: { nestedKey: { type: "string", flags: { description: "Nested description" } } },
          },
        },
      })
    })
  })
})

describe("LayeredContext", () => {
  it("allows you to merge multiple contexts", () => {
    const variables = new LayeredContext(
      "test",
      new TestContext({
        foo: "foo",
      }),
      new TestContext({
        bar: "bar",
      })
    )

    const tpl = parseTemplateString({ rawTemplateString: "${var.foo}-${var.bar}", source: { path: [] } })

    const res = deepEvaluate(tpl, {
      context: new TestContext({
        var: variables,
      }),
      opts: {},
    })

    expect(res).to.eql("foo-bar")
  })

  it("takes the precedence from right to left when merging primitives", () => {
    const layeredContext = new LayeredContext(
      "test",
      new TestContext({
        foo: "foo",
      }),
      new TestContext({
        foo: "overriddenFoo",
      })
    )

    const res = layeredContext.resolve({ key: ["foo"], nodePath: [], opts: {} })
    expect(res).to.eql({ found: true, resolved: "overriddenFoo" })
  })

  it("takes the precedence from right to left when merging objects", () => {
    const layeredContext = new LayeredContext(
      "test",
      new TestContext({
        foo: "foo",
      }),
      new TestContext({
        foo: "overriddenFoo",
      })
    )

    const res = layeredContext.resolve({ key: [], nodePath: [], opts: {} })
    expect(res).to.eql({ found: true, resolved: { foo: "overriddenFoo" } })
  })

  it("show the available keys if attempt to resolve a non-existing key", () => {
    const layeredContext = new LayeredContext(
      "test",
      new TestContext({
        foo: "foo",
      }),
      new TestContext({
        bar: "bar",
      })
    )

    const res = layeredContext.resolve({ key: ["baz"], nodePath: [], opts: {} })
    expect(res.found).to.eql(false)

    const explanation = (res as ContextResolveOutputNotFound).explanation
    expect(explanation.key).to.eql("baz")
    expect(explanation.reason).to.eql("key_not_found")
    expect(explanation.getAvailableKeys().sort()).to.eql(["bar", "foo"])
  })
})
