/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { JoiDescription } from "../../../../src/config/common.js"
import { joi } from "../../../../src/config/common.js"
import { JoiKeyDescription } from "../../../../src/docs/joi-schema.js"
import { flattenSchema } from "../../../../src/docs/common.js"
import { expect } from "chai"

describe("flattenSchema", () => {
  it("should return all keys in an object schema", async () => {
    const schema = joi.object().keys({
      a: joi.string(),
      b: joi.number(),
      c: joi.object().keys({
        c1: joi.string(),
        c2: joi.number(),
      }),
    })

    const desc = new JoiKeyDescription({
      joiDescription: schema.describe() as JoiDescription,
      name: undefined,
      level: 0,
    })

    const result = flattenSchema(desc)

    expect(result.length).to.equal(5)
    expect(result[0].fullKey()).to.equal("a")
    expect(result[1].fullKey()).to.equal("b")
    expect(result[2].fullKey()).to.equal("c")
    expect(result[3].fullKey()).to.equal("c.c1")
    expect(result[4].fullKey()).to.equal("c.c2")
  })

  it("should correctly handle nested object schemas on arrays", async () => {
    const schema = joi.object().keys({
      a: joi.string(),
      b: joi.array().items(
        joi.object().keys({
          b1: joi.string(),
          b2: joi.number(),
        })
      ),
    })

    const desc = new JoiKeyDescription({
      joiDescription: schema.describe() as JoiDescription,
      name: undefined,
      level: 0,
    })

    const result = flattenSchema(desc)

    expect(result.length).to.equal(4)
    expect(result[0].fullKey()).to.equal("a")
    expect(result[1].fullKey()).to.equal("b[]")
    expect(result[2].parent).to.equal(result[1])
    expect(result[3].parent).to.equal(result[1])
    expect(result[2].fullKey()).to.equal("b[].b1")
    expect(result[3].fullKey()).to.equal("b[].b2")
  })
})
