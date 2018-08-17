import { expect } from "chai"
import { PluginContext } from "../../src/plugin-context"
import { expectError } from "../helpers"
import { Garden } from "../../src/garden"
import { makeTestGardenA } from "../helpers"

describe("PluginContext", () => {
  let garden: Garden
  let ctx: PluginContext

  beforeEach(async () => {
    garden = await makeTestGardenA()
    ctx = garden.getPluginContext()
  })

  describe("setConfig", () => {
    it("should set a valid key in the 'project' namespace", async () => {
      const key = ["project", "my", "variable"]
      const value = "myvalue"

      await ctx.setConfig({ key, value })
      expect(await ctx.getConfig({ key })).to.eql({ value })
    })

    it("should throw with an invalid namespace in the key", async () => {
      const key = ["bla", "my", "variable"]
      const value = "myvalue"

      await expectError(async () => await ctx.setConfig({ key, value }), "parameter")
    })

    it("should throw with malformatted key", async () => {
      const key = ["project", "!4215"]
      const value = "myvalue"

      await expectError(async () => await ctx.setConfig({ key, value }), "parameter")
    })
  })

  describe("getConfig", () => {
    it("should get a valid key in the 'project' namespace", async () => {
      const key = ["project", "my", "variable"]
      const value = "myvalue"

      await ctx.setConfig({ key, value })
      expect(await ctx.getConfig({ key })).to.eql({ value })
    })

    it("should throw with an invalid namespace in the key", async () => {
      const key = ["bla", "my", "variable"]

      await expectError(async () => await ctx.getConfig({ key }), "parameter")
    })

    it("should throw with malformatted key", async () => {
      const key = ["project", "!4215"]

      await expectError(async () => await ctx.getConfig({ key }), "parameter")
    })
  })

  describe("deleteConfig", () => {
    it("should delete a valid key in the 'project' namespace", async () => {
      const key = ["project", "my", "variable"]
      const value = "myvalue"

      await ctx.setConfig({ key, value })
      expect(await ctx.deleteConfig({ key })).to.eql({ found: true })
    })

    it("should return {found:false} if key does not exist", async () => {
      const key = ["project", "my", "variable"]

      expect(await ctx.deleteConfig({ key })).to.eql({ found: false })
    })

    it("should throw with an invalid namespace in the key", async () => {
      const key = ["bla", "my", "variable"]

      await expectError(async () => await ctx.deleteConfig({ key }), "parameter")
    })

    it("should throw with malformatted key", async () => {
      const key = ["project", "!4215"]

      await expectError(async () => await ctx.deleteConfig({ key }), "parameter")
    })
  })
})
