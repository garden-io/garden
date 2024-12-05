/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import stripAnsi from "strip-ansi"
import type { ContextKey, ContextResolveParams } from "../../../../../src/config/template-contexts/base.js"
import {
  CONTEXT_RESOLVE_KEY_AVAILABLE_LATER,
  CONTEXT_RESOLVE_KEY_NOT_FOUND,
} from "../../../../../src/config/template-contexts/base.js"
import { ConfigContext, schema } from "../../../../../src/config/template-contexts/base.js"
import { expectError } from "../../../../helpers.js"
import { joi } from "../../../../../src/config/common.js"

type TestValue = string | ConfigContext | TestValues | TestValueFunction
type TestValueFunction = () => TestValue | Promise<TestValue>

interface TestValues {
  [key: string]: TestValue
}

describe("ConfigContext", () => {
  class GenericContext extends ConfigContext {
    constructor(obj: TestValues, root?: ConfigContext) {
      super(root)
      this.addValues(obj)
    }

    addValues(obj: TestValues) {
      Object.assign(this, obj)
    }
  }

  describe("resolve", () => {
    // just a shorthand to aid in testing
    function resolveKey(c: ConfigContext, key: ContextKey, opts = {}) {
      return c.resolve({ key, nodePath: [], opts })
    }

    it("should resolve simple keys", async () => {
      const c = new GenericContext({ basic: "value" })
      expect(resolveKey(c, ["basic"])).to.eql({ resolved: "value" })
    })

    it("should return CONTEXT_RESOLVE_KEY_NOT_FOUND for missing key", async () => {
      const c = new GenericContext({})
      const { resolved, getUnavailableReason: message } = resolveKey(c, ["basic"])
      expect(resolved).to.be.equal(CONTEXT_RESOLVE_KEY_NOT_FOUND)
      expect(stripAnsi(message!())).to.include("Could not find key basic")
    })

    context("allowPartial=true", () => {
      it("should return CONTEXT_RESOLVE_KEY_AVAILABLE_LATER symbol on missing key", async () => {
        const c = new GenericContext({})
        const result = resolveKey(c, ["basic"], { allowPartial: true })
        expect(result.resolved).to.eql(CONTEXT_RESOLVE_KEY_AVAILABLE_LATER)
      })

      it("should return CONTEXT_RESOLVE_KEY_AVAILABLE_LATER symbol on missing key on nested context", async () => {
        const c = new GenericContext({
          nested: new GenericContext({ key: "value" }),
        })
        const result = resolveKey(c, ["nested", "bla"], { allowPartial: true })
        expect(result.resolved).to.eql(CONTEXT_RESOLVE_KEY_AVAILABLE_LATER)
      })
    })

    it("should throw when looking for nested value on primitive", async () => {
      const c = new GenericContext({ basic: "value" })
      await expectError(() => resolveKey(c, ["basic", "nested"]), "context-resolve")
    })

    it("should resolve nested keys", async () => {
      const c = new GenericContext({ nested: { key: "value" } })
      expect(resolveKey(c, ["nested", "key"])).eql({ resolved: "value" })
    })

    it("should resolve keys on nested contexts", async () => {
      const c = new GenericContext({
        nested: new GenericContext({ key: "value" }),
      })
      expect(resolveKey(c, ["nested", "key"])).eql({ resolved: "value" })
    })

    it("should return CONTEXT_RESOLVE_KEY_NOT_FOUND for missing keys on nested context", async () => {
      const c = new GenericContext({
        nested: new GenericContext({ key: "value" }),
      })
      const { resolved, getUnavailableReason: message } = resolveKey(c, ["basic", "bla"])
      expect(resolved).to.be.equal(CONTEXT_RESOLVE_KEY_NOT_FOUND)
      expect(stripAnsi(message!())).to.equal("Could not find key basic. Available keys: nested.")
    })

    it("should resolve keys with value behind callable", async () => {
      const c = new GenericContext({ basic: () => "value" })
      expect(resolveKey(c, ["basic"])).to.eql({ resolved: "value" })
    })

    it("should resolve keys on nested contexts where context is behind callable", async () => {
      const c = new GenericContext({
        nested: () => new GenericContext({ key: "value" }),
      })
      expect(resolveKey(c, ["nested", "key"])).to.eql({ resolved: "value" })
    })

    it("should cache resolved values", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nested: any = new GenericContext({ key: "value" })
      const c = new GenericContext({
        nested,
      })
      resolveKey(c, ["nested", "key"])

      nested.key = "foo"

      expect(resolveKey(c, ["nested", "key"])).to.eql({ resolved: "value" })
    })

    it("should throw if resolving a key that's already in the lookup stack", async () => {
      const c = new GenericContext({
        nested: new GenericContext({ key: "value" }),
      })
      const key = ["nested", "key"]
      const stack = new Set([key.join(".")])
      await expectError(() => c.resolve({ key, nodePath: [], opts: { stack } }), "context-resolve")
    })

    it("should detect a circular reference from a nested context", async () => {
      class NestedContext extends ConfigContext {
        override resolve({ key, nodePath, opts }: ContextResolveParams) {
          const circularKey = nodePath.concat(key)
          opts.stack!.add(circularKey.join("."))
          return c.resolve({ key: circularKey, nodePath: [], opts })
        }
      }

      const c = new GenericContext({
        nested: new NestedContext(),
      })
      await expectError(() => resolveKey(c, ["nested", "bla"]), "context-resolve")
    })

    it("should return helpful message when unable to resolve nested key in map", async () => {
      class Context extends ConfigContext {
        nested: Map<string, string>

        constructor(parent?: ConfigContext) {
          super(parent)
          this.nested = new Map()
        }
      }

      const c = new Context()
      const { getUnavailableReason: message } = resolveKey(c, ["nested", "bla"])
      expect(stripAnsi(message!())).to.include("Could not find key bla under nested.")
    })

    it("should show helpful error when unable to resolve nested key in object", async () => {
      class Context extends ConfigContext {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nested: any

        constructor(parent?: ConfigContext) {
          super(parent)
          this.nested = {}
        }
      }

      const c = new Context()
      const { getUnavailableReason: message } = resolveKey(c, ["nested", "bla"])
      expect(stripAnsi(message!())).to.include("Could not find key bla under nested.")
    })

    it("should show helpful error when unable to resolve two-level nested key in object", async () => {
      class Context extends ConfigContext {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nested: any

        constructor(parent?: ConfigContext) {
          super(parent)
          this.nested = { deeper: {} }
        }
      }

      const c = new Context()
      const { getUnavailableReason: message } = resolveKey(c, ["nested", "deeper", "bla"])
      expect(stripAnsi(message!())).to.include("Could not find key bla under nested.deeper.")
    })

    it("should show helpful error when unable to resolve in nested context", async () => {
      class Nested extends ConfigContext {}

      class Context extends ConfigContext {
        nested: ConfigContext

        constructor(parent?: ConfigContext) {
          super(parent)
          this.nested = new Nested(this)
        }
      }

      const c = new Context()
      const { getUnavailableReason: message } = resolveKey(c, ["nested", "bla"])
      expect(stripAnsi(message!())).to.include("Could not find key bla under nested.")
    })

    it("should resolve template strings", async () => {
      const c = new GenericContext({
        foo: "value",
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nested: any = new GenericContext({ key: "${foo}" }, c)
      c.addValues({ nested })
      expect(resolveKey(c, ["nested", "key"])).to.eql({ resolved: "value" })
    })

    it("should resolve template strings with nested context", async () => {
      const c = new GenericContext({
        foo: "bar",
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nested: any = new GenericContext({ key: "${nested.foo}", foo: "value" }, c)
      c.addValues({ nested })
      expect(resolveKey(c, ["nested", "key"])).to.eql({ resolved: "value" })
    })

    it("should detect a self-reference when resolving a template string", async () => {
      const c = new GenericContext({ key: "${key}" })
      await expectError(() => resolveKey(c, ["key"]), "template-string")
    })

    it("should detect a nested self-reference when resolving a template string", async () => {
      const c = new GenericContext({
        foo: "bar",
      })
      const nested = new GenericContext({ key: "${nested.key}" }, c)
      c.addValues({ nested })
      await expectError(() => resolveKey(c, ["nested", "key"]), "template-string")
    })

    it("should detect a circular reference when resolving a template string", async () => {
      const c = new GenericContext({
        foo: "bar",
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nested: any = new GenericContext({ key: "${nested.foo}", foo: "${nested.key}" }, c)
      c.addValues({ nested })
      await expectError(() => resolveKey(c, ["nested", "key"]), "template-string")
    })

    it("should detect a circular reference when resolving a nested template string", async () => {
      const c = new GenericContext({
        foo: "bar",
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nested: any = new GenericContext({ key: "${nested.foo}", foo: "${'${nested.key}'}" }, c)
      c.addValues({ nested })
      await expectError(() => resolveKey(c, ["nested", "key"]), "template-string")
    })

    it("should detect a circular reference when nested template string resolves to self", async () => {
      const c = new GenericContext({
        foo: "bar",
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nested: any = new GenericContext({ key: "${'${nested.key}'}" }, c)
      c.addValues({ nested })
      await expectError(() => resolveKey(c, ["nested", "key"]), {
        contains:
          "Invalid template string (${nested.key}): Circular reference detected when resolving key nested.key (nested -> nested.key)",
      })
    })
  })

  describe("getSchema", () => {
    it("should return a Joi object schema with all described attributes", () => {
      class Nested extends ConfigContext {
        @schema(joi.string().description("Nested description"))
        nestedKey?: string
      }

      class Context extends ConfigContext {
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
