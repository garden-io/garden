/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
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
  ContextResolveParams,
} from "../../../../../src/config/template-contexts/base.js"
import {
  GenericContext,
  getUnavailableReason,
  LayeredContext,
} from "../../../../../src/config/template-contexts/base.js"
import { ContextWithSchema, schema } from "../../../../../src/config/template-contexts/base.js"
import { expectError } from "../../../../helpers.js"
import { joi } from "../../../../../src/config/common.js"
import { parseTemplateString } from "../../../../../src/template/templated-strings.js"
import { deepEvaluate } from "../../../../../src/template/evaluate.js"
import { isPlainObject } from "../../../../../src/util/objects.js"
import { InternalError } from "../../../../../src/exceptions.js"
import { parseTemplateCollection } from "../../../../../src/template/templated-collections.js"

type TestValue = string | ConfigContext | TestValues

interface TestValues {
  [key: string]: TestValue
}

describe("ConfigContext", () => {
  class TestContext extends GenericContext {
    constructor(obj: TestValues) {
      super(obj)
    }

    addValues(obj: TestValues) {
      if (!isPlainObject(this.data)) {
        throw new InternalError({
          message: "TestContext expects data to be a plain object",
        })
      }
      Object.assign(this.data, obj)
    }
  }

  describe("resolve", () => {
    // just a shorthand to aid in testing
    function resolveKey(c: ConfigContext, key: ContextKey, opts = {}) {
      return c.resolve({ key, opts })
    }

    it("should resolve simple keys", async () => {
      const c = new GenericContext({ basic: "value" })
      expect(resolveKey(c, ["basic"])).to.eql({ found: true, resolved: "value" })
    })

    it("should return found: false for missing key", async () => {
      const c = new GenericContext({})
      const result = resolveKey(c, ["basic"])
      expect(result.found).to.be.equal(false)
      expect(stripAnsi(getUnavailableReason(result))).to.include("Could not find key basic")
    })

    // context("allowPartial=true", () => {
    //   it("should return CONTEXT_RESOLVE_KEY_AVAILABLE_LATER symbol on missing key", async () => {
    //     const c = new GenericContext({})
    //     const result = resolveKey(c, ["basic"], { allowPartial: true })
    //     expect(result.resolved).to.eql(CONTEXT_RESOLVE_KEY_AVAILABLE_LATER)
    //   })

    //   it("should return CONTEXT_RESOLVE_KEY_AVAILABLE_LATER symbol on missing key on nested context", async () => {
    //     const c = new GenericContext({
    //       nested: new GenericContext({ key: "value" }),
    //     })
    //     const result = resolveKey(c, ["nested", "bla"], { allowPartial: true })
    //     expect(result.resolved).to.eql(CONTEXT_RESOLVE_KEY_AVAILABLE_LATER)
    //   })
    // })

    it("should throw when looking for nested value on primitive", async () => {
      const c = new GenericContext({ basic: "value" })
      const result = resolveKey(c, ["basic", "nested"])
      expect(stripAnsi(getUnavailableReason(result))).to.equal("Cannot lookup key nested on primitive value basic.")
    })

    it("should resolve nested keys", async () => {
      const c = new GenericContext({ nested: { key: "value" } })
      expect(resolveKey(c, ["nested", "key"])).eql({ found: true, resolved: "value" })
    })

    it("should resolve keys on nested contexts", async () => {
      const c = new GenericContext({
        nested: new GenericContext({ key: "value" }),
      })
      expect(resolveKey(c, ["nested", "key"])).eql({ found: true, resolved: "value" })
    })

    it("should return found: false for missing keys on nested context", async () => {
      const c = new GenericContext({
        nested: new GenericContext({ key: "value" }),
      })
      const result = resolveKey(c, ["basic", "bla"])
      expect(result.found).to.be.equal(false)
      expect(stripAnsi(getUnavailableReason(result))).to.equal("Could not find key basic. Available keys: nested.")
    })

    it("should cache resolved values", async () => {
      const nested = new TestContext({ key: "value" })
      const c = new GenericContext({
        nested,
      })
      resolveKey(c, ["nested", "key"])

      nested.addValues({
        key: "foo",
      })

      expect(resolveKey(c, ["nested", "key"])).to.eql({ found: true, resolved: "value" })
    })

    it("should detect a circular reference from a nested context", async () => {
      class NestedContext extends ContextWithSchema {
        override resolve({ opts, rootContext }: ContextResolveParams) {
          return c.resolve({ key: ["nested", "bla"], opts, rootContext })
        }
      }

      const c = new GenericContext({
        nested: new NestedContext(),
      })
      await expectError(() => resolveKey(c, ["nested", "bla"]), "crash")
    })

    it("should return helpful message when unable to resolve nested key in map", async () => {
      class Context extends ContextWithSchema {
        nested: Map<string, string>

        constructor() {
          super()
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
          super()
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
          super()
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
          super()
          this.nested = new Nested()
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
      const nested = new GenericContext(parseTemplateCollection({ value: { key: "${foo}" }, source: { path: [] } }))
      c.addValues({ nested })
      expect(resolveKey(c, ["nested", "key"])).to.eql({ found: true, resolved: "value" })
    })

    it("should resolve template strings with nested context", async () => {
      const c = new TestContext({
        foo: "bar",
      })
      const nested = new GenericContext(
        parseTemplateCollection({ value: { key: "${nested.foo}", foo: "value" }, source: { path: [] } })
      )
      c.addValues({ nested })
      expect(resolveKey(c, ["nested", "key"])).to.eql({ found: true, resolved: "value" })
    })

    it("should detect a self-reference when resolving a template string", async () => {
      const c = new GenericContext(parseTemplateCollection({ value: { key: "${key}" }, source: { path: [] } }))
      await expectError(() => resolveKey(c, ["key"]), "template-string")
    })

    it("should detect a nested self-reference when resolving a template string", async () => {
      const c = new TestContext({
        foo: "bar",
      })
      const nested = new GenericContext({ key: "${nested.key}" })
      c.addValues({ nested })
      await expectError(() => resolveKey(c, ["nested", "key"]), "template-string")
    })

    it("should detect a circular reference when resolving a template string", async () => {
      const c = new TestContext({
        foo: "bar",
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nested: any = new GenericContext({ key: "${nested.foo}", foo: "${nested.key}" })
      c.addValues({ nested })
      await expectError(() => resolveKey(c, ["nested", "key"]), "template-string")
    })

    it("should detect a circular reference when resolving a nested template string", async () => {
      const c = new TestContext({
        foo: "bar",
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nested: any = new GenericContext({ key: "${nested.foo}", foo: "${'${nested.key}'}" })
      c.addValues({ nested })
      await expectError(() => resolveKey(c, ["nested", "key"]), "template-string")
    })

    it("should detect a circular reference when nested template string resolves to self", async () => {
      const c = new TestContext({
        foo: "bar",
      })
      const nested = new GenericContext({ key: "${'${nested.key}'}" })
      c.addValues({ nested })
      await expectError(() => resolveKey(c, ["nested", "key"]), {
        contains:
          "Invalid template string (${nested.key}): Circular reference detected when resolving key nested.key (nested -> nested.key)",
      })
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
      new GenericContext({
        foo: "foo",
      }),
      new GenericContext({
        bar: "bar",
      })
    )

    const tpl = parseTemplateString({ rawTemplateString: "${var.foo}-${var.bar}", source: { path: [] } })

    const res = deepEvaluate(tpl, {
      context: new GenericContext({
        var: variables,
      }),
      opts: {},
    })

    expect(res).to.eq("foo-bar")
  })
})
