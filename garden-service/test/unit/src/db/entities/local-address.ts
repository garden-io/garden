import { expect } from "chai"
import { LocalAddress } from "../../../../../src/db/entities/local-address"
import { randomString } from "../../../../../src/util/string"

describe("LocalAddress", () => {
  describe("resolve", () => {
    it("should create and return a record", async () => {
      const hostname = randomString()
      const values = {
        projectName: "test",
        moduleName: "test",
        serviceName: "test",
        hostname,
      }
      const address = await LocalAddress.resolve(values)

      try {
        expect(address._id).to.equal((await LocalAddress.findOneOrFail({ where: values }))._id)
      } finally {
        try {
          await address.remove()
        } catch (_) {}
      }
    })

    it("should return the same record on a second call", async () => {
      const hostname = randomString()
      const values = {
        projectName: "test",
        moduleName: "test",
        serviceName: "test",
        hostname,
      }
      const address = await LocalAddress.resolve(values)

      try {
        expect(address._id).to.equal((await LocalAddress.resolve(values))._id)
      } finally {
        try {
          await address.remove()
        } catch (_) {}
      }
    })
  })

  describe("getIp", () => {
    it("should correctly resolve IDs to IP addresses", () => {
      let address = new LocalAddress()

      address._id = 1
      expect(address.getIp()).to.equal("127.10.0.2")

      address._id = 2000
      expect(address.getIp()).to.equal("127.10.7.209")
    })
  })
})
