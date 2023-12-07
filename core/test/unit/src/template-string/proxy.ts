/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { GenericContext } from "../../../../src/config/template-contexts/base.js"
import { getDeepUnwrapProxy } from "../../../../src/template-string/proxy.js"
import {
  resolveTemplateStringWithInputs,
  resolveTemplateStringsWithInputs,
} from "../../../../src/template-string/template-string.js"
import { CollectionOrValue, isArray } from "../../../../src/util/objects.js"

describe("getDeepUnwrapProxy", () => {
  it("should throw an error if you instantiate it with a lazy value", () => {
    const proxy = getDeepUnwrapProxy({
      parsedConfig: resolveTemplateStringWithInputs({ string: "${1234}" }),
      context: new GenericContext({}),
      opts: {},
    })

    expect(() => proxy["foo"]).to.throw()
  })

  it("should unwrap a leaf value", () => {
    const parsedConfig = resolveTemplateStringsWithInputs({
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

    const proxy = getDeepUnwrapProxy({
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
    const parsedConfig = resolveTemplateStringsWithInputs({
      value: {
        myArray: [1, 2, 3],
        myDeeperArray: [{ foo: "${[10,9,8,7]}" }, { foo: "baz" }],
      },
      source: { source: undefined },
    })

    const proxy = getDeepUnwrapProxy({
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
    const parsedConfig = resolveTemplateStringsWithInputs({
      value: ["Hello 1", "Hello 2", "Hello 3"],
      source: { source: undefined },
    })

    const proxy = getDeepUnwrapProxy({
      parsedConfig,
      context: new GenericContext({}),
      expectedCollectionType: "array",
      opts: {},
    }) as string[]

    const iterated1: string[] = []
    for (const item of proxy) {
      iterated1.push(item)
    }
    const iterated2 = proxy.map((item) => item)
    const iterated3: string[] = []
    proxy.forEach((item) => iterated3.push(item))

    expect(iterated1).to.deep.equal(["Hello 1", "Hello 2", "Hello 3"])
    expect(iterated2).to.deep.equal(["Hello 1", "Hello 2", "Hello 3"])
    expect(iterated3).to.deep.equal(["Hello 1", "Hello 2", "Hello 3"])
    expect(proxy.length).to.equal(true)
    expect(isArray(proxy)).to.equal(false)
  })

  it("should work with forEach", () => {
    const parsedConfig = resolveTemplateStringsWithInputs({
      value: {
        $forEach: "${[1,2,3]}",
        $return: "Hello ${item.value}",
      },
      source: { source: undefined },
    })

    const proxy = getDeepUnwrapProxy({
      parsedConfig,
      context: new GenericContext({}),
      expectedCollectionType: "array",
      opts: {},
    })

    expect(proxy).to.deep.equal(["Hello 1", "Hello 2", "Hello 3"])
    expect(proxy).to.be.an("array")
    expect(proxy.length).to.equal(3)
  })

})
