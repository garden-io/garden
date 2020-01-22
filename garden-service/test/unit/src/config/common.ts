import { expect } from "chai"
const stripAnsi = require("strip-ansi")
import { identifierRegex, envVarRegex, userIdentifierRegex, joi, joiRepositoryUrl } from "../../../../src/config/common"
import { validateSchema } from "../../../../src/config/validation"
import { expectError } from "../../../helpers"

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

    await expectError(
      () => validateSchema(obj, schema),
      (err) => {
        expect(stripAnsi(err.detail.errorDescription)).to.equal("key .A is required, key .B.b is required")
      }
    )
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

    await expectError(
      () => validateSchema(obj, schema),
      (err) => {
        expect(stripAnsi(err.detail.errorDescription)).to.equal("key .A.B[c].C is required")
      }
    )
  })

  it("should throw a nice error when key is invalid", async () => {
    const obj = { 123: "abc" }
    const schema = joi
      .object()
      .pattern(/[a-z]+/, joi.string())
      .unknown(false)

    await expectError(
      () => validateSchema(obj, schema),
      (err) => {
        expect(stripAnsi(err.detail.errorDescription)).to.equal('key "123" is not allowed at path .')
      }
    )
  })

  it("should throw a nice error when nested key is invalid", async () => {
    const obj = { a: { 123: "abc" } }
    const schema = joi.object().keys({ a: joi.object().pattern(/[a-z]+/, joi.string()) })

    await expectError(
      () => validateSchema(obj, schema),
      (err) => {
        expect(stripAnsi(err.detail.errorDescription)).to.equal('key "123" is not allowed at path .a')
      }
    )
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

    await expectError(
      () => validateSchema(obj, schema),
      (err) => {
        expect(stripAnsi(err.detail.errorDescription)).to.equal("object at . can only contain one of [a, b]")
      }
    )
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

describe("validateSchema", () => {
  it("should format a basic object validation error", async () => {
    const schema = joi.object().keys({ foo: joi.string() })
    const value = { foo: 123 }
    await expectError(
      () => validateSchema(value, schema),
      (err) => expect(stripAnsi(err.message)).to.equal("Validation error: key .foo must be a string")
    )
  })

  it("should format a nested object validation error", async () => {
    const schema = joi.object().keys({ foo: joi.object().keys({ bar: joi.string() }) })
    const value = { foo: { bar: 123 } }
    await expectError(
      () => validateSchema(value, schema),
      (err) => expect(stripAnsi(err.message)).to.equal("Validation error: key .foo.bar must be a string")
    )
  })

  it("should format a nested pattern object validation error", async () => {
    const schema = joi.object().keys({ foo: joi.object().pattern(/.+/, joi.string()) })
    const value = { foo: { bar: 123 } }
    await expectError(
      () => validateSchema(value, schema),
      (err) => expect(stripAnsi(err.message)).to.equal("Validation error: key .foo[bar] must be a string")
    )
  })
})
