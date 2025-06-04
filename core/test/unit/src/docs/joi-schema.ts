/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import type { JoiDescription } from "../../../../src/config/common.js"
import { joi } from "../../../../src/config/common.js"
import { JoiKeyDescription } from "../../../../src/docs/joi-schema.js"
import { testJsonSchema } from "./json-schema.js"

describe("JoiKeyDescription", () => {
  it("correctly set the basic attributes of an object schema", () => {
    const joiSchema = joi
      .string()
      .required()
      .allow("a", "b")
      .only()
      // here we pick an arbitrary available deprecation to ensure the deprecated flag value on the JoiKeyDescription
      .meta({ internal: true, deprecation: "containerDeployActionHostPort", experimental: true })
      .description("some description")

    const desc = new JoiKeyDescription({
      joiDescription: joiSchema.describe() as JoiDescription,
      name: "foo",
      level: 0,
    })

    expect(desc.formatAllowedValues()).to.equal('"a", "b"')
    expect(desc.type).to.equal("string")
    expect(desc.required).to.be.true
    expect(desc.internal).to.be.true
    expect(desc.deprecated).to.be.true
    expect(desc.experimental).to.be.true
    expect(desc.description).to.equal("some description")
  })

  describe("getChildren", () => {
    it("should correctly handle array schemas", () => {
      const schema = joi.array().items(joi.object().keys({ a: joi.string().description("array object key") }))
      const desc = new JoiKeyDescription({
        joiDescription: schema.describe() as JoiDescription,
        name: undefined,
        level: 0,
      })
      const children = desc.getChildren(true)

      expect(children.length).to.equal(1)
      expect(children[0].type).to.equal("object")
      expect(children[0].parent).to.equal(desc)
    })

    it("should correctly handle joi.object().jsonSchema() schemas", () => {
      const schema = joi.object().jsonSchema(testJsonSchema)
      const desc = new JoiKeyDescription({
        joiDescription: schema.describe() as JoiDescription,
        name: "foo",
        level: 0,
      })
      const children = desc.getChildren(true)

      expect(children.length).to.equal(3)
      expect(children[0].name).to.equal("apiVersion")
      expect(children[1].name).to.equal("kind")
      expect(children[2].name).to.equal("metadata")

      for (const c of children) {
        expect(c.parent).to.equal(desc)
        expect(c.level).to.equal(1)
      }
    })
  })

  describe("getDefaultValue", () => {
    it("should get the default value", () => {
      const schema = joi.number().default("result")
      const desc = new JoiKeyDescription({
        joiDescription: schema.describe() as JoiDescription,
        name: undefined,
        level: 0,
      })
      const value = desc.getDefaultValue()
      expect(value).to.equal("result")
    })

    it("should get the default return of the function over the param", () => {
      const schema = joi
        .number()
        .default(() => "result")
        .description("description")

      const desc = new JoiKeyDescription({
        joiDescription: schema.describe() as JoiDescription,
        name: undefined,
        level: 0,
      })
      const value = desc.getDefaultValue()
      expect(value).to.equal("result")
    })
  })
})
