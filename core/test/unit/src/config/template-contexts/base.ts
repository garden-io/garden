/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import stripAnsi = require("strip-ansi")
import {
  ConfigContext,
  ContextKey,
  ContextResolveParams,
  schema,
  ScanContext,
} from "../../../../../src/config/template-contexts/base"
import { expectError } from "../../../../helpers"
import { joi } from "../../../../../src/config/common"
import { resolveTemplateStrings } from "../../../../../src/template-string"

type TestValue = string | ConfigContext | TestValues | TestValueFunction
type TestValueFunction = () => TestValue | Promise<TestValue>
interface TestValues {
  [key: string]: TestValue
}

describe("ConfigContext", () => {
  class TestContext extends ConfigContext {
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
      const c = new TestContext({ basic: "value" })
      expect(resolveKey(c, ["basic"])).to.eql({ resolved: "value" })
    })

    it("should return undefined for missing key", async () => {
      const c = new TestContext({})
      const { resolved, message } = resolveKey(c, ["basic"])
      expect(resolved).to.be.undefined
      expect(stripAnsi(message!)).to.equal("Could not find key basic.")
    })

    context("allowPartial=true", () => {
      it("should throw on missing key when allowPartial=true", async () => {
        const c = new TestContext({})
        expectError(
          () => resolveKey(c, ["basic"], { allowPartial: true }),
          (err) => expect(stripAnsi(err.message)).to.equal("Could not find key basic.")
        )
      })

      it("should throw on missing key on nested context", async () => {
        const c = new TestContext({
          nested: new TestContext({ key: "value" }),
        })
        expectError(
          () => resolveKey(c, ["nested", "bla"], { allowPartial: true }),
          (err) => expect(stripAnsi(err.message)).to.equal("Could not find key bla under nested. Available keys: key.")
        )
      })
    })

    it("should throw when looking for nested value on primitive", async () => {
      const c = new TestContext({ basic: "value" })
      expectError(() => resolveKey(c, ["basic", "nested"]), "configuration")
    })

    it("should resolve nested keys", async () => {
      const c = new TestContext({ nested: { key: "value" } })
      expect(resolveKey(c, ["nested", "key"])).eql({ resolved: "value" })
    })

    it("should resolve keys on nested contexts", async () => {
      const c = new TestContext({
        nested: new TestContext({ key: "value" }),
      })
      expect(resolveKey(c, ["nested", "key"])).eql({ resolved: "value" })
    })

    it("should return undefined for missing keys on nested context", async () => {
      const c = new TestContext({
        nested: new TestContext({ key: "value" }),
      })
      const { resolved, message } = resolveKey(c, ["basic", "bla"])
      expect(resolved).to.be.undefined
      expect(stripAnsi(message!)).to.equal("Could not find key basic. Available keys: nested.")
    })

    it("should resolve keys with value behind callable", async () => {
      const c = new TestContext({ basic: () => "value" })
      expect(resolveKey(c, ["basic"])).to.eql({ resolved: "value" })
    })

    it("should resolve keys on nested contexts where context is behind callable", async () => {
      const c = new TestContext({
        nested: () => new TestContext({ key: "value" }),
      })
      expect(resolveKey(c, ["nested", "key"])).to.eql({ resolved: "value" })
    })

    it("should cache resolved values", async () => {
      const nested: any = new TestContext({ key: "value" })
      const c = new TestContext({
        nested,
      })
      resolveKey(c, ["nested", "key"])

      nested.key = "foo"

      expect(resolveKey(c, ["nested", "key"])).to.eql({ resolved: "value" })
    })

    it("should throw if resolving a key that's already in the lookup stack", async () => {
      const c = new TestContext({
        nested: new TestContext({ key: "value" }),
      })
      const key = ["nested", "key"]
      const stack = [key.join(".")]
      expectError(() => c.resolve({ key, nodePath: [], opts: { stack } }), "configuration")
    })

    it("should detect a circular reference from a nested context", async () => {
      class NestedContext extends ConfigContext {
        resolve({ key, nodePath, opts }: ContextResolveParams) {
          const circularKey = nodePath.concat(key)
          opts.stack!.push(circularKey.join("."))
          return c.resolve({ key: circularKey, nodePath: [], opts })
        }
      }
      const c = new TestContext({
        nested: new NestedContext(),
      })
      expectError(() => resolveKey(c, ["nested", "bla"]), "configuration")
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
      const { message } = resolveKey(c, ["nested", "bla"])
      expect(stripAnsi(message!)).to.equal("Could not find key bla under nested.")
    })

    it("should show helpful error when unable to resolve nested key in object", async () => {
      class Context extends ConfigContext {
        nested: any

        constructor(parent?: ConfigContext) {
          super(parent)
          this.nested = {}
        }
      }
      const c = new Context()
      const { message } = resolveKey(c, ["nested", "bla"])
      expect(stripAnsi(message!)).to.equal("Could not find key bla under nested.")
    })

    it("should show helpful error when unable to resolve two-level nested key in object", async () => {
      class Context extends ConfigContext {
        nested: any

        constructor(parent?: ConfigContext) {
          super(parent)
          this.nested = { deeper: {} }
        }
      }
      const c = new Context()
      const { message } = resolveKey(c, ["nested", "deeper", "bla"])
      expect(stripAnsi(message!)).to.equal("Could not find key bla under nested.deeper.")
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
      const { message } = resolveKey(c, ["nested", "bla"])
      expect(stripAnsi(message!)).to.equal("Could not find key bla under nested.")
    })

    it("should resolve template strings", async () => {
      const c = new TestContext({
        foo: "value",
      })
      const nested: any = new TestContext({ key: "${foo}" }, c)
      c.addValues({ nested })
      expect(resolveKey(c, ["nested", "key"])).to.eql({ resolved: "value" })
    })

    it("should resolve template strings with nested context", async () => {
      const c = new TestContext({
        foo: "bar",
      })
      const nested: any = new TestContext({ key: "${nested.foo}", foo: "value" }, c)
      c.addValues({ nested })
      expect(resolveKey(c, ["nested", "key"])).to.eql({ resolved: "value" })
    })

    it("should detect a self-reference when resolving a template string", async () => {
      const c = new TestContext({ key: "${key}" })
      expectError(() => resolveKey(c, ["key"]), "template-string")
    })

    it("should detect a nested self-reference when resolving a template string", async () => {
      const c = new TestContext({
        foo: "bar",
      })
      const nested = new TestContext({ key: "${nested.key}" }, c)
      c.addValues({ nested })
      expectError(() => resolveKey(c, ["nested", "key"]), "template-string")
    })

    it("should detect a circular reference when resolving a template string", async () => {
      const c = new TestContext({
        foo: "bar",
      })
      const nested: any = new TestContext({ key: "${nested.foo}", foo: "${nested.key}" }, c)
      c.addValues({ nested })
      expectError(() => resolveKey(c, ["nested", "key"]), "template-string")
    })

    it("should detect a circular reference when resolving a nested template string", async () => {
      const c = new TestContext({
        foo: "bar",
      })
      const nested: any = new TestContext({ key: "${nested.foo}", foo: "${'${nested.key}'}" }, c)
      c.addValues({ nested })
      expectError(() => resolveKey(c, ["nested", "key"]), "template-string")
    })

    it("should detect a circular reference when nested template string resolves to self", async () => {
      const c = new TestContext({
        foo: "bar",
      })
      const nested: any = new TestContext({ key: "${'${nested.key}'}" }, c)
      c.addValues({ nested })
      expectError(
        () => resolveKey(c, ["nested", "key"]),
        (err) =>
          expect(err.message).to.equal(
            "Invalid template string (${'${nested.key}'}): Invalid template string (${nested.key}): Circular reference detected when resolving key nested.key (nested -> nested.key)"
          )
      )
    })
  })

  describe("getSchema", () => {
    it("should return a Joi object schema with all described attributes", () => {
      class Nested extends ConfigContext {
        @schema(joi.string().description("Nested description"))
        nestedKey: string
      }

      class Context extends ConfigContext {
        @schema(joi.string().description("Some description"))
        key: string

        @schema(Nested.getSchema().description("A nested context"))
        nested: Nested

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

describe("ScanContext", () => {
  it("should collect found keys in an object", () => {
    const context = new ScanContext()
    const obj = {
      a: "some ${templated.string}",
      b: "${more.stuff}",
    }
    resolveTemplateStrings(obj, context)
    expect(context.foundKeys.entries()).to.eql([
      ["templated", "string"],
      ["more", "stuff"],
    ])
  })

  it("should handle keys with dots correctly", () => {
    const context = new ScanContext()
    const obj = {
      a: "some ${templated['key.with.dots']}",
      b: "${more.stuff}",
    }
    resolveTemplateStrings(obj, context)
    expect(context.foundKeys.entries()).to.eql([
      ["templated", "key.with.dots"],
      ["more", "stuff"],
    ])
  })
})
