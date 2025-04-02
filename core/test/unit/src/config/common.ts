/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import {
  identifierRegex,
  envVarRegex,
  userIdentifierRegex,
  joi,
  joiRepositoryUrl,
  joiPrimitive,
  joiSparseArray,
  allowUnknown,
  createSchema,
  metadataFromDescription,
  removeSchema,
} from "../../../../src/config/common.js"
import { validateSchema } from "../../../../src/config/validation.js"
import { expectError } from "../../../helpers.js"

describe("joiSparseArray", () => {
  it("should filter out undefined values", () => {
    const schema = joiSparseArray(joi.string()).sparse()
    const { value } = schema.validate(["foo", undefined, "bar"])
    expect(value).to.eql(["foo", "bar"])
  })

  it("should filter out null values", () => {
    const schema = joiSparseArray(joi.string()).sparse()
    const { value } = schema.validate(["foo", undefined, "bar", null, "baz"])
    expect(value).to.eql(["foo", "bar", "baz"])
  })
})

describe("envVarRegex", () => {
  it("should fail on invalid env variables", () => {
    const testCases = ["GARDEN", "garden", "GARDEN_ENV_VAR", "garden_", "123", ".", "MY-ENV_VAR"]
    for (const tc of testCases) {
      const result = envVarRegex.test(tc)
      expect(result, tc).to.be.false
    }
  })

  it("should pass on valid env variables", () => {
    const testCases = [
      "GAR",
      "_test_",
      "MY_ENV_VAR",
      "A_123",
      "_2134",
      "a_b_c",
      "A_B_C_",
      "some.var", // This is not strictly valid POSIX, but a bunch of Java services use this style
    ]
    for (const tc of testCases) {
      const result = envVarRegex.test(tc)
      expect(result, tc).to.be.true
    }
  })
})

const validIdentifiers = {
  "myname": "a valid identifier",
  "my-name": "a valid identifier with a dash",
  "my9-9name": "numbers in the middle of a string",
  "o12345670123456701234567012345670123456701234567012345670123456": "a 63 char identifier",
  "a": "a single char identifier",
}

const invalidIdentifiers = {
  "01010": "string with only numbers",
  "-abc": "starting with a dash",
  "abc-": "ending with a dash",
  "": "an empty string",
  "o123456701234567012345670123456701234567012345670123456701234567": "a 64 char identifier",
  "UPPER": "an uppercase string",
  "upPer": "a partially uppercase string",
}

describe("identifierRegex", () => {
  for (const [value, description] of Object.entries(validIdentifiers)) {
    it("should allow " + description, () => {
      expect(identifierRegex.test(value)).to.be.true
    })
  }

  for (const [value, description] of Object.entries(invalidIdentifiers)) {
    it("should disallow " + description, () => {
      expect(identifierRegex.test(value)).to.be.false
    })
  }

  it("should allow consecutive dashes", () => {
    expect(identifierRegex.test("my--name")).to.be.true
  })

  it("should allow starting with a number", () => {
    expect(identifierRegex.test("9name")).to.be.true
  })

  it("should allow strings starting with 'garden'", () => {
    expect(identifierRegex.test("garden-party")).to.be.true
  })
})

describe("userIdentifierRegex", () => {
  for (const [value, description] of Object.entries(validIdentifiers)) {
    it("should allow " + description, () => {
      expect(userIdentifierRegex.test(value)).to.be.true
    })
  }

  for (const [value, description] of Object.entries(invalidIdentifiers)) {
    it("should disallow " + description, () => {
      expect(userIdentifierRegex.test(value)).to.be.false
    })
  }

  it("should allow consecutive dashes", () => {
    expect(userIdentifierRegex.test("my--name")).to.be.false
  })

  it("should disallow starting with a number", () => {
    expect(userIdentifierRegex.test("9name")).to.be.false
  })

  it("should allow strings starting with 'garden'", () => {
    expect(userIdentifierRegex.test("garden-party")).to.be.false
  })
})

describe("validate", () => {
  it("should validate an object against a joi schema", () => {
    const obj = {
      my: "object",
    }

    validateSchema(obj, joi.object().keys({ my: joi.string() }))
  })

  it("should throw a nice error when keys are missing", async () => {
    const obj = { B: {} }
    const schema = joi.object().keys({
      A: joi.string().required(),
      B: joi
        .object()
        .keys({
          b: joi.string().required(),
        })
        .required(),
    })

    await expectError(() => validateSchema(obj, schema), {
      contains: ["A is required", "B.b is required"],
    })
  })

  it("should throw a nice error when keys are wrong in a pattern object", async () => {
    const obj = { A: { B: { c: {} } } }
    const schema = joi.object().keys({
      A: joi
        .object()
        .keys({
          B: joi
            .object()
            .pattern(
              /.+/,
              joi.object().keys({
                C: joi.string().required(),
              })
            )
            .required(),
        })
        .required(),
    })

    await expectError(() => validateSchema(obj, schema), {
      contains: "A.B[c].C is required",
    })
  })

  it("should throw a nice error when key is invalid", async () => {
    const obj = { 123: "abc" }
    const schema = joi
      .object()
      .pattern(/[a-z]+/, joi.string())
      .unknown(false)

    await expectError(() => validateSchema(obj, schema), {
      contains: 'key "123" is not allowed at path .',
    })
  })

  it("should throw a nice error when nested key is invalid", async () => {
    const obj = { a: { 123: "abc" } }
    const schema = joi.object().keys({ a: joi.object().pattern(/[a-z]+/, joi.string()) })

    await expectError(() => validateSchema(obj, schema), {
      contains: '"123" is not allowed at path a',
    })
  })

  it("should throw a nice error when xor rule fails", async () => {
    const obj = { a: 1, b: 2 }
    const schema = joi
      .object()
      .keys({
        a: joi.number(),
        b: joi.number(),
      })
      .xor("a", "b")

    await expectError(() => validateSchema(obj, schema), {
      contains: "object at . can only contain one of [a, b]",
    })
  })
})

describe("joi.posixPath", () => {
  it("should validate a POSIX-style path", () => {
    const path = "/foo/bar.js"
    const schema = joi.posixPath()
    const result = schema.validate(path)
    expect(result.error).to.be.undefined
  })

  it("should return error with a Windows-style path", () => {
    const path = "C:\\Something\\Blorg"
    const schema = joi.posixPath()
    const result = schema.validate(path)
    expect(result.error).to.exist
  })

  it("should respect absoluteOnly parameter", () => {
    const path = "foo/bar.js"
    const schema = joi.posixPath().absoluteOnly()
    const result = schema.validate(path)
    expect(result.error).to.exist
  })

  it("should respect relativeOnly parameter", () => {
    const path = "/foo/bar.js"
    const schema = joi.posixPath().relativeOnly()
    const result = schema.validate(path)
    expect(result.error).to.exist
  })

  it("should respect subPathOnly parameter by rejecting absolute paths", () => {
    const path = "/foo/bar.js"
    const schema = joi.posixPath().subPathOnly()
    const result = schema.validate(path)
    expect(result.error).to.exist
  })

  it("should respect subPathOnly parameter by rejecting paths with '..' segments", () => {
    const path = "foo/../../bar"
    const schema = joi.posixPath().subPathOnly()
    const result = schema.validate(path)
    expect(result.error).to.exist
  })

  it("should allow paths with '..' segments when subPathOnly=false", () => {
    const path = "foo/../../bar"
    const schema = joi.posixPath()
    const result = schema.validate(path)
    expect(result.error).to.be.undefined
  })

  it("should respect filenameOnly parameter", () => {
    const path = "foo/bar.js"
    const schema = joi.posixPath().filenameOnly()
    const result = schema.validate(path)
    expect(result.error).to.exist
  })
})

describe("joi.hostname", () => {
  const schema = joi.hostname()

  it("should accept valid hostnames", () => {
    const result = schema.validate("foo.bar.bas")
    expect(result.error).to.be.undefined
  })
  it("should accept hostnames with a wildcard in the first DNS label", () => {
    const result = schema.validate("*.bar.bas")
    expect(result.error).to.be.undefined
  })
  it("should reject hostnames with wildcard DNS labels that are not the first label", () => {
    const result = schema.validate("foo.*.bas")
    expect(result.error).to.exist
    expect(result!.error!.message).to.eql(`"value" only first DNS label may contain a wildcard.`)
  })
})

describe("joi.environment", () => {
  const schema = joi.environment()

  it("should accept a basic alphanumeric string", () => {
    const result = schema.validate("foo")
    expect(result.error).to.be.undefined
  })

  it("should accept a string with a dash", () => {
    const result = schema.validate("foo-bar")
    expect(result.error).to.be.undefined
  })

  it("should accept an env with a namespace", () => {
    const result = schema.validate("foo.bar")
    expect(result.error).to.be.undefined
  })

  it("should reject an env with multiple dots", () => {
    const result = schema.validate("foo.bar.baz")
    expect(result.error).to.exist
  })

  it("should reject an env invalid characters", () => {
    const result = schema.validate("$.%")
    expect(result.error).to.exist
  })
})

describe("joiRepositoryUrl", () => {
  it("should accept a git:// URL", () => {
    const url = "git://github.com/garden-io/garden-example-remote-sources-web-services.git#my-tag"
    const schema = joiRepositoryUrl()
    const result = schema.validate(url)
    expect(result.error).to.be.undefined
  })

  it("should accept a git:// URL not ending in .git", () => {
    const url = "git://github.com/garden-io/garden-example-remote-sources-web-services#my-tag"
    const schema = joiRepositoryUrl()
    const result = schema.validate(url)
    expect(result.error).to.be.undefined
  })

  it("should accept an HTTPS Git URL", () => {
    const url = "https://github.com/garden-io/garden-example-remote-sources-web-services.git#my-tag"
    const schema = joiRepositoryUrl()
    const result = schema.validate(url)
    expect(result.error).to.be.undefined
  })

  it("should accept an scp-like SSH GitHub URL", () => {
    const url = "git@github.com:garden-io/garden-example-remote-sources-web-services.git#my-tag"
    const schema = joiRepositoryUrl()
    const result = schema.validate(url)
    expect(result.error).to.be.undefined
  })

  it("should accept an ssh:// GitHub URL", () => {
    const url = "ssh://git@github.com/garden-io/garden-example-remote-sources-web-services.git#my-tag"
    const schema = joiRepositoryUrl()
    const result = schema.validate(url)
    expect(result.error).to.be.undefined
  })

  it("should accept a git+https// URL", () => {
    const url = "git+https://git@github.com:garden-io/garden-example-remote-sources-web-services.git#my-tag"
    const schema = joiRepositoryUrl()
    const result = schema.validate(url)
    expect(result.error).to.be.undefined
  })

  it("should accept a git+ssh// URL", () => {
    const url = "git+ssh://git@github.com:garden-io/garden-example-remote-sources-web-services.git#my-tag"
    const schema = joiRepositoryUrl()
    const result = schema.validate(url)
    expect(result.error).to.be.undefined
  })

  it("should accept a local file:// URL", () => {
    const url = "file:///some/dir"
    const schema = joiRepositoryUrl()
    const result = schema.validate(url)
    expect(result.error).to.be.undefined
  })

  it("should reject non-string values", () => {
    const url = 123
    const schema = joiRepositoryUrl()
    const result = schema.validate(url)
    expect(result.error).to.exist
  })

  it("should reject values missing a schema", () => {
    const url = "garden-io/garden-example-remote-sources-web-services.git#my-tag"
    const schema = joiRepositoryUrl()
    const result = schema.validate(url)
    expect(result.error).to.exist
  })

  it("should require a branch/tag name", () => {
    const url = "https://github.com/garden-io/garden-example-remote-sources-web-services.git"
    const schema = joiRepositoryUrl()
    const result = schema.validate(url)
    expect(result.error).to.exist
  })
})

describe("joiPrimitive", () => {
  it("should validate primitives without casting values", () => {
    const schema = joiPrimitive()
    const resStrNum = schema.validate("12345")
    const resStrBool = schema.validate("true")
    const resNum = schema.validate(12345)
    const resBool = schema.validate(true)
    const resArr = schema.validate([1, 2, 3, 4, 5])
    const resObj = schema.validate({ hello: "world" })
    const resFun = schema.validate(() => {})
    expect(resStrNum.value).to.equal("12345")
    expect(resStrBool.value).to.equal("true")
    expect(resNum.value).to.equal(12345)
    expect(resBool.value).to.equal(true)
    expect(resArr.error).to.exist
    expect(resObj.error).to.exist
    expect(resFun.error).to.exist
  })
})

describe("joi.customObject", () => {
  const jsonSchema = {
    type: "object",
    properties: {
      stringProperty: { type: "string" },
      numberProperty: { type: "integer", default: 999 },
    },
    additionalProperties: false,
    required: ["stringProperty"],
  }

  it("should validate an object with a JSON Schema", () => {
    const joiSchema = joi.object().jsonSchema(jsonSchema)
    const value = { stringProperty: "foo", numberProperty: 123 }
    const result = validateSchema(value, joiSchema)
    expect(result).to.eql({ stringProperty: "foo", numberProperty: 123 })
  })

  it("should apply default values based on the JSON Schema", () => {
    const joiSchema = joi.object().jsonSchema(jsonSchema)
    const result = validateSchema({ stringProperty: "foo" }, joiSchema)
    expect(result).to.eql({ stringProperty: "foo", numberProperty: 999 })
  })

  it("should give validation error if object doesn't match specified JSON Schema", async () => {
    const joiSchema = joi.object().jsonSchema(jsonSchema)
    await expectError(() => validateSchema({ numberProperty: "oops", blarg: "blorg" }, joiSchema), {
      contains: [
        "Validation error",
        "value at . must have required property 'stringProperty'",
        "value at . must NOT have additional properties",
        "value at ./numberProperty must be integer",
      ],
    })
  })

  it("should throw if schema with wrong type is passed to .jsonSchema()", async () => {
    await expectError(() => joi.object().jsonSchema({ type: "number" }), {
      contains: "jsonSchema must be a valid JSON Schema with type=object or reference",
    })
  })

  it("should throw if invalid schema is passed to .jsonSchema()", async () => {
    await expectError(() => joi.object().jsonSchema({ type: "banana", blorg: "blarg" }), {
      contains: "jsonSchema must be a valid JSON Schema with type=object or reference",
    })
  })
})

describe("allowUnknown", () => {
  it("allows unknown fields on an object schema", () => {
    const schema = joi.object().keys({ key: joi.number() }).unknown(false)
    const result = allowUnknown(schema).validate({ foo: 123 })
    expect(result.error).to.be.undefined
  })

  it("works with empty objects schemas", () => {
    const schema = joi.object().unknown(false)
    const result = allowUnknown(schema).validate({ foo: 123 })
    expect(result.error).to.be.undefined
  })

  it("works with empty array schemas", () => {
    const schema = joi.array()
    const result = allowUnknown(schema).validate([{ foo: 123 }])
    expect(result.error).to.be.undefined
  })

  it("allows unknown fields on nested object schemas on an object schema", () => {
    const schema = joi
      .object()
      .keys({ nested: joi.object().keys({ key: joi.number() }).unknown(false) })
      .unknown(false)
    const result = allowUnknown(schema).validate({ nested: { foo: 123 } })
    expect(result.error).to.be.undefined
  })

  it("allows unknown fields on object schemas in an array schema", () => {
    const schema = joi.array().items(joi.object().keys({ key: joi.number() }).unknown(false))
    const loose = allowUnknown(schema)
    const result = loose.validate([{ foo: 123 }])
    expect(result.error).to.be.undefined
  })
})

describe("createSchema", () => {
  afterEach(() => {
    removeSchema("foo")
    removeSchema("bar")
  })

  it("creates an object schema and sets its name", () => {
    const schema = createSchema({
      name: "foo",
      keys: () => ({
        foo: joi.boolean(),
      }),
    })
    // This will only work with a schema
    const metadata = metadataFromDescription(schema().describe())
    expect(metadata).to.eql({
      name: "foo",
    })
  })

  it("throws if a schema name is used twice", () => {
    createSchema({
      name: "foo",
      keys: () => ({
        foo: joi.boolean(),
      }),
    })
    return expectError(
      () =>
        createSchema({
          name: "foo",
          keys: () => ({
            foo: joi.boolean(),
          }),
        }),
      { contains: "Object schema foo defined multiple times" }
    )
  })

  it("applies metadata to schemas", () => {
    const schema = createSchema({
      name: "foo",
      keys: () => ({
        foo: joi.boolean(),
      }),
      meta: {
        internal: true,
      },
    })
    const metadata = metadataFromDescription(schema().describe())
    expect(metadata).to.eql({
      name: "foo",
      internal: true,
    })
  })

  it("extends another schema", () => {
    const base = createSchema({
      name: "foo",
      keys: () => ({
        foo: joi.boolean(),
      }),
    })
    const schema = createSchema({
      name: "bar",
      keys: () => ({
        bar: joi.string(),
      }),
      extend: base,
    })
    validateSchema({ foo: true, bar: "baz" }, schema())
  })

  it("caches the created schema", () => {
    const f = createSchema({
      name: "bar",
      keys: () => ({
        bar: joi.string(),
      }),
    })
    const a = f()
    const b = f()
    expect(a).to.equal(b)
  })
})
