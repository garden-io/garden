import { expect } from "chai"
import { getPort } from "../../../../src/util/network"

describe("getPort", () => {
  it("should fall back to random port if not allowed to bind to specified port", async () => {
    const port = await getPort({ port: 0 })
    expect(port).to.not.equal(1)
    expect(typeof port).to.equal("number")
  })
})
