import { expect } from "chai"
import {
  expectError,
  makeTestContextA,
} from "../helpers"

describe("PluginContext", () => {
  describe("setConfig", () => {
    it("should set a valid key in the 'project' namespace", async () => {
      const ctx = await makeTestContextA()

      const key = ["project", "my", "variable"]
      const value = "myvalue"

      await ctx.setConfig(key, value)
      expect(await ctx.getConfig(key)).to.equal(value)
    })

    it("should throw with an invalid namespace in the key", async () => {
      const ctx = await makeTestContextA()

      const key = ["bla", "my", "variable"]
      const value = "myvalue"

      await expectError(async () => await ctx.setConfig(key, value), "parameter")
    })

    it("should throw with malformatted key", async () => {
      const ctx = await makeTestContextA()

      const key = ["project", "!4215"]
      const value = "myvalue"

      await expectError(async () => await ctx.setConfig(key, value), "parameter")
    })
  })

  describe("getConfig", () => {
    it("should get a valid key in the 'project' namespace", async () => {
      const ctx = await makeTestContextA()

      const key = ["project", "my", "variable"]
      const value = "myvalue"

      await ctx.setConfig(key, value)
      expect(await ctx.getConfig(key)).to.equal(value)
    })

    it("should throw if key does not exist", async () => {
      const ctx = await makeTestContextA()

      const key = ["project", "my", "variable"]

      await expectError(async () => await ctx.getConfig(key), "not-found")
    })

    it("should throw with an invalid namespace in the key", async () => {
      const ctx = await makeTestContextA()

      const key = ["bla", "my", "variable"]

      await expectError(async () => await ctx.getConfig(key), "parameter")
    })

    it("should throw with malformatted key", async () => {
      const ctx = await makeTestContextA()

      const key = ["project", "!4215"]

      await expectError(async () => await ctx.getConfig(key), "parameter")
    })
  })

  describe("deleteConfig", () => {
    it("should delete a valid key in the 'project' namespace", async () => {
      const ctx = await makeTestContextA()

      const key = ["project", "my", "variable"]
      const value = "myvalue"

      await ctx.setConfig(key, value)
      expect(await ctx.deleteConfig(key)).to.eql({ found: true })
    })

    it("should return {found:false} if key does not exist", async () => {
      const ctx = await makeTestContextA()

      const key = ["project", "my", "variable"]

      await expectError(async () => await ctx.deleteConfig(key), "not-found")
    })

    it("should throw with an invalid namespace in the key", async () => {
      const ctx = await makeTestContextA()

      const key = ["bla", "my", "variable"]

      await expectError(async () => await ctx.deleteConfig(key), "parameter")
    })

    it("should throw with malformatted key", async () => {
      const ctx = await makeTestContextA()

      const key = ["project", "!4215"]

      await expectError(async () => await ctx.deleteConfig(key), "parameter")
    })
  })
})
