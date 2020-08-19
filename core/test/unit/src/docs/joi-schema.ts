/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { joi } from "../../../../src/config/common"
import { getJoiDefaultValue, JoiDescription, normalizeJoiSchemaDescription } from "../../../../src/docs/joi-schema"
import { testJsonSchema } from "./json-schema"
import { normalizeJsonSchema } from "../../../../src/docs/json-schema"

describe("normalizeJoiSchemaDescription", () => {
  it("should correctly handle joi.object().jsonSchema() schemas", async () => {
    const schema = joi.object().jsonSchema(testJsonSchema)
    const result = normalizeJoiSchemaDescription(schema.describe() as JoiDescription)
    expect(result).to.eql(normalizeJsonSchema(testJsonSchema))
  })
})

describe("getJoiDefaultValue", () => {
  const testDefaultSchema = joi
    .number()
    .default(() => "result")
    .description("description")

  it("should get the default return of the function over the param", () => {
    const value = getJoiDefaultValue(testDefaultSchema.describe() as JoiDescription)
    expect(value).to.equal("result")
  })
})
