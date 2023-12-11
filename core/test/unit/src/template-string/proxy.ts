/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { GenericContext } from "../../../../src/config/template-contexts/base.js"
import { getCollectionSymbol, getLazyConfigProxy } from "../../../../src/template-string/proxy.js"
import { parseTemplateString, parseTemplateCollection } from "../../../../src/template-string/template-string.js"
import type { CollectionOrValue } from "../../../../src/util/objects.js"
import { isArray } from "../../../../src/util/objects.js"
import { type TemplatePrimitive } from "../../../../src/template-string/inputs.js"

describe("getLazyConfigProxy", () => {
  it("makes it easier to access template values", () => {
    const obj = {
      fruits: ["apple", "banana"],
    }

    const proxy = getLazyConfigProxy({
      parsedConfig: parseTemplateCollection({ value: obj, source: { source: undefined } }),
      context: new GenericContext({}),
      opts: {},
    })

    expect(proxy["fruits"][0]).to.equal("apple")
    expect(proxy["fruits"][1]).to.equal("banana")
  })

  it("only supports instantiating the proxy with collection values, not primitives, even if they are hidden behind lazy values", () => {
    const proxy = getLazyConfigProxy({
      parsedConfig: parseTemplateString({ string: "${1234}" }),
      context: new GenericContext({}),
      opts: {},
    })

    expect(() => {
      proxy["foo"]
    }).to.throw()
  })

  it("should unwrap a leaf value", () => {
    const parsedConfig = parseTemplateCollection({
      value: {
        my: {
          deep: {
            structure: {
              withAnArray: [{ containing: "different" }, "stuff"],
            },
          },
        },
      },
      source: { source: undefined },
    })

    const proxy = getLazyConfigProxy({
      parsedConfig,
      context: new GenericContext({}),
      opts: {},
    })

    expect(proxy).to.deep.equal({
      my: {
        deep: {
          structure: {
            withAnArray: [{ containing: "different" }, "stuff"],
          },
        },
      },
    })
  })

  it("should have array methods and properties", () => {
    const parsedConfig = parseTemplateCollection({
      value: {
        myArray: [1, 2, 3],
        myDeeperArray: [{ foo: "${[10,9,8,7]}" }, { foo: "baz" }],
      },
      source: { source: undefined },
    })

    const proxy = getLazyConfigProxy({
      parsedConfig,
      context: new GenericContext({}),
      opts: {},
    })

    expect(proxy["myArray"].length).to.equal(3)
    expect(proxy["myDeeperArray"].length).to.equal(2)
    expect(proxy["myDeeperArray"]).to.be.an("array")
    expect(proxy["myDeeperArray"][0].foo.length).to.equal(4)
    expect(proxy["myDeeperArray"][0].foo).to.be.an("array")
    expect(isArray(proxy)).to.equal(false)
  })

  it("should support iteration over proxied array values", () => {
    const parsedConfig = parseTemplateCollection({
      value: ["Hello 1", "Hello 2", "Hello 3"],
      source: { source: undefined },
    })

    const proxy = getLazyConfigProxy({
      parsedConfig,
      expectedCollectionType: "array",
      context: new GenericContext({}),
      opts: {},
    }) as string[]

    const iterated1: string[] = []
    for (const item of proxy) {
      iterated1.push(item)
    }
    const iterated2 = proxy.map((item) => item)
    const iterated3: string[] = []
    proxy.forEach((item) => iterated3.push(item))

    expect(proxy.length).to.equal(3)
    expect(proxy).to.be.an("array")
    expect(iterated1).to.deep.equal(["Hello 1", "Hello 2", "Hello 3"])
    expect(iterated2).to.deep.equal(["Hello 1", "Hello 2", "Hello 3"])
    expect(iterated3).to.deep.equal(["Hello 1", "Hello 2", "Hello 3"])
  })

  it("should support iteration over proxied Object.entries", () => {
    const parsedConfig = parseTemplateCollection({
      value: {
        foo: "bar",
        baz: "qux",
      },
      source: { source: undefined },
    })

    const proxy = getLazyConfigProxy({
      parsedConfig,
      context: new GenericContext({}),
      opts: {},
    })

    const iterated1: string[] = []
    for (const [k, v] of Object.entries(proxy)) {
      iterated1.push(`${k}=${v}`)
    }
    const iterated2 = Object.entries(proxy).map(([k, v]) => `${k}=${v}`)
    const iterated3: string[] = []
    Object.entries(proxy).forEach(([k, v]) => iterated3.push(`${k}=${v}`))

    expect(iterated1).to.deep.equal(["foo=bar", "baz=qux"])
    expect(iterated2).to.deep.equal(["foo=bar", "baz=qux"])
    expect(iterated3).to.deep.equal(["foo=bar", "baz=qux"])
  })

  it("should work with forEach", () => {
    const parsedConfig = parseTemplateCollection({
      value: {
        $forEach: "${[1,2,3]}",
        $return: "Hello ${item.value}",
      },
      source: { source: undefined },
    })

    const proxy = getLazyConfigProxy({
      parsedConfig,
      context: new GenericContext({}),
      expectedCollectionType: "array",
      opts: {},
    })

    expect(proxy).to.deep.equal(["Hello 1", "Hello 2", "Hello 3"])
    expect(proxy).to.be.an("array")
    expect(proxy.length).to.equal(3)
  })

  it("it only lazily evaluates even the outermost lazy value", () => {
    const context = new GenericContext({})
    const parsedConfig = parseTemplateCollection({
      value: {
        $merge: "${var.willExistLater}",
      },
      source: { source: undefined },
    })

    let proxy: CollectionOrValue<TemplatePrimitive>
    expect(() => {
      proxy = getLazyConfigProxy({
        parsedConfig,
        context,
        opts: {},
      })
    }).to.not.throw()

    context["var"] = {
      willExistLater: {
        foo: "bar",
      },
    }

    expect(proxy).to.deep.equal({ foo: "bar" })
  })

  it("evaluates lazily when values are accessed", () => {
    const context = new GenericContext({})
    const parsedConfig = parseTemplateCollection({
      value: {
        spec: "${var.willExistLater}",
      },
      source: { source: undefined },
    })

    let proxy: CollectionOrValue<TemplatePrimitive>
    expect(() => {
      proxy = getLazyConfigProxy({
        parsedConfig,
        context,
        opts: {},
      })
    }).to.not.throw()

    context["var"] = {
      willExistLater: {
        foo: "bar",
      },
    }

    expect(proxy).to.deep.equal({ spec: { foo: "bar" } })
  })

  it("evaluates lazily when values are accessed", () => {
    const context = new GenericContext({
      var: {
        alreadyExists: "I am here",
      },
    })
    const parsedConfig = parseTemplateCollection({
      value: {
        cannotResolveYet: "${var.willExistLater}",
        alreadyResolvable: "${var.alreadyExists}",
      },
      source: { source: undefined },
    })

    const proxy = getLazyConfigProxy({
      parsedConfig,
      context,
      opts: {},
    })

    expect(Object.keys(proxy)).to.eql(["cannotResolveYet", "alreadyResolvable"])

    expect(proxy["alreadyResolvable"]).to.equal("I am here")

    expect(() => {
      proxy["cannotResolveYet"]
    }).to.throw()

    context["var"]["willExistLater"] = {
      foo: "bar",
    }

    expect(proxy["cannotResolveYet"]).to.deep.equal({ foo: "bar" })
  })

  it("allows variables referencing other variables even when they are declared together in the same scope", () => {
    const projectConfig = parseTemplateCollection({
      value: {
        variables: {
          variable_one: "${var.variable_two}",
          variable_two: '${join(["H", "e", "l", "l", "o"], "")}',
        },
      },
      source: { source: undefined },
    })

    const context = new GenericContext({
      var: {
        ...projectConfig["variables"],
      },
    })

    const actionConfig = parseTemplateCollection({
      value: {
        kind: "Build",
        name: "my-action",
        spec: {
          image: "${var.variable_one}",
        },
      },
      source: { source: undefined },
    })

    const proxy = getLazyConfigProxy({
      parsedConfig: actionConfig,
      context,
      opts: {},
    })

    expect(proxy).to.deep.equal({
      kind: "Build",
      name: "my-action",
      spec: {
        image: "Hello",
      },
    })
  })

  it("allows optional proxies, that do not throw but return undefined, if something can't be resolved", () => {
    const context = new GenericContext({})
    const parsedConfig = parseTemplateCollection({
      value: {
        myOptionalValue: "${var.willExistLater}",
      },
      source: { source: undefined },
    })

    const proxy = getLazyConfigProxy({
      parsedConfig,
      context,
      opts: {
        // TODO: rename this to optional
        allowPartial: true,
      },
    })

    expect(proxy["myOptionalValue"]).to.equal(undefined)

    context["var"] = {
      willExistLater: {
        foo: "bar",
      },
    }

    expect(proxy).to.deep.equal({ myOptionalValue: { foo: "bar" } })
  })

  it("partial returns undefined even for && and || clauses", () => {
    const context = new GenericContext({})
    const parsedConfig = parseTemplateCollection({
      value: {
        orClause: "${var.willExistLater || 'defaultValue'}",
        andClause: "${var.willExistLater && 'conclusionValue'}",
      },
      source: { source: undefined },
    })

    const partialProxy = getLazyConfigProxy({
      parsedConfig,
      context,
      opts: {
        // TODO: rename this to optional
        allowPartial: true,
      },
    })

    const strictProxy = getLazyConfigProxy({
      parsedConfig,
      context,
      opts: {},
    })

    expect(partialProxy["orClause"]).to.equal(undefined)
    expect(partialProxy["andClause"]).to.equal(undefined)

    expect(strictProxy["orClause"]).to.equal("defaultValue")
    expect(strictProxy["andClause"]).to.equal(false)

    context["var"] = {
      willExistLater: {
        foo: "bar",
      },
    }

    expect(partialProxy["orClause"]).to.deep.equal({ foo: "bar" })
    expect(strictProxy["orClause"]).to.deep.equal({ foo: "bar" })
    expect(partialProxy["andClause"]).to.deep.equal("conclusionValue")
    expect(strictProxy["andClause"]).to.deep.equal("conclusionValue")
  })

  it("allows getting the underlying collection back", () => {
    const context = new GenericContext({})
    const parsedConfig = parseTemplateCollection({
      value: {
        myOptionalValue: "${var.willExistLater}",
      },
      source: { source: undefined },
    })

    const proxy = getLazyConfigProxy({
      parsedConfig,
      context,
      opts: {},
    })

    const underlyingConfig = proxy[getCollectionSymbol]

    expect(underlyingConfig).to.deep.equal(parsedConfig)
  })

  it("allows getting the underlying collection back for arrays", () => {
    const context = new GenericContext({})
    const parsedConfig = parseTemplateCollection({
      value: ["Hello 1", "Hello 2", "Hello 3"],
      source: { source: undefined },
    })

    const proxy = getLazyConfigProxy({
      parsedConfig,
      expectedCollectionType: "array",
      context,
      opts: {},
    })

    const underlyingConfig = proxy[getCollectionSymbol]

    expect(underlyingConfig).to.deep.equal(parsedConfig)
  })

  it("forbids mutating the proxy", () => {
    const context = new GenericContext({})
    const parsedConfig = parseTemplateCollection({
      value: {
        luckyNumber: "${3}",
      },
      source: { source: undefined },
    })

    const proxy = getLazyConfigProxy({
      parsedConfig,
      context,
      opts: {},
    })

    expect(() => {
      proxy["luckyNumber"] = 13
    }).to.throw()

    expect(proxy["luckyNumber"]).to.equal(3)
  })
})
