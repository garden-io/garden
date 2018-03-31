import { expect } from "chai"
import { identifierRegex } from "../../../src/types/common"

describe("identifierRegex", () => {
  it("should accept a valid identifier", () => {
    expect(identifierRegex.test("my-name")).to.be.true
  })

  it("should allow numbers in middle of the string", () => {
    expect(identifierRegex.test("my9-9name")).to.be.true
  })

  it("should disallow ending with a dash", () => {
    expect(identifierRegex.test("my-name-")).to.be.false
  })

  it("should disallow uppercase characters", () => {
    expect(identifierRegex.test("myName")).to.be.false
  })

  it("should disallow starting with a dash", () => {
    expect(identifierRegex.test("-my-name")).to.be.false
  })

  it("should disallow starting with a number", () => {
    expect(identifierRegex.test("9name")).to.be.false
  })

  it("should disallow consecutive dashes", () => {
    expect(identifierRegex.test("my--name")).to.be.false
  })
})
