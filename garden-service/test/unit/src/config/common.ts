import { expect } from "chai"
import * as Joi from "joi"
const stripAnsi = require("strip-ansi")
import { identifierRegex, validate, envVarRegex, userIdentifierRegex } from "../../../../src/config/common"
import { expectError } from "../../../helpers"

describe("envVarRegex", () => {
  it("should fail on invalid env variables", () => {
    const testCases = [
      "GARDEN",
      "garden",
      "GARDEN_ENV_VAR",
      "garden_",
      "123",
      ".",
      "MY-ENV_VAR",
    ]
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

    validate(obj, Joi.object().keys({ my: Joi.string() }))
  })

  it("should throw a nice error when keys are missing", async () => {
    const obj = { B: {} }
    const schema = Joi.object().keys({
      A: Joi.string().required(),
      B: Joi.object().keys({
        b: Joi.string().required(),
      }).required(),
    })

    await expectError(() => validate(obj, schema), (err) => {
      expect(stripAnsi(err.detail.errorDescription)).to.equal("key .A is required, key .B.b is required")
    })
  })

  it("should throw a nice error when keys are wrong in a pattern object", async () => {
    const obj = { A: { B: { c: {} } } }
    const schema = Joi.object().keys({
      A: Joi.object().keys({
        B: Joi.object().pattern(/.+/, Joi.object().keys({
          C: Joi.string().required(),
        })).required(),
      }).required(),
    })

    await expectError(() => validate(obj, schema), (err) => {
      expect(stripAnsi(err.detail.errorDescription)).to.equal("key .A.B[c].C is required")
    })
  })

  it("should throw a nice error when key is invalid", async () => {
    const obj = { 123: "abc" }
    const schema = Joi.object().pattern(/[a-z]+/, Joi.string())

    await expectError(() => validate(obj, schema), (err) => {
      expect(stripAnsi(err.detail.errorDescription)).to.equal("key \"123\" is not allowed at path .")
    })
  })

  it("should throw a nice error when nested key is invalid", async () => {
    const obj = { a: { 123: "abc" } }
    const schema = Joi.object().keys({ a: Joi.object().pattern(/[a-z]+/, Joi.string()) })

    await expectError(() => validate(obj, schema), (err) => {
      expect(stripAnsi(err.detail.errorDescription)).to.equal("key \"123\" is not allowed at path .a")
    })
  })

  it("should throw a nice error when xor rule fails", async () => {
    const obj = { a: 1, b: 2 }
    const schema = Joi.object().keys({
      a: Joi.number(),
      b: Joi.number(),
    }).xor("a", "b")

    await expectError(() => validate(obj, schema), (err) => {
      expect(stripAnsi(err.detail.errorDescription)).to.equal("object at . only allows one of [a, b]")
    })
  })
})
