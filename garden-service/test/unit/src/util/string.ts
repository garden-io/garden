import { expect } from "chai"
import { tailString } from "../../../../src/util/string"

describe("tailString", () => {
  it("should return string unchanged if it's shorter than maxLength", () => {
    const str = "123456789"
    expect(tailString(str, 10)).to.equal(str)
  })

  it("should trim off first bytes if string is longer than maxLength", () => {
    const str = "1234567890"
    expect(tailString(str, 5)).to.equal("67890")
  })

  it("should trim until next newline if string is longer than maxLength and nextLine=true", () => {
    const str = "1234567\n890"
    expect(tailString(str, 5, true)).to.equal("890")
  })
})
