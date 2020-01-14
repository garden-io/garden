import { PluginMap, createGardenPlugin } from "../../../../src/types/plugin/plugin"
import { getPluginBases } from "../../../../src/plugins"
import { expect } from "chai"
import { sortBy } from "lodash"

describe("getPluginBases", () => {
  it("should return an empty list if plugin has no base", () => {
    const plugin = createGardenPlugin({
      name: "foo",
    })
    const plugins: PluginMap = {
      foo: plugin,
    }
    expect(getPluginBases(plugin, plugins)).to.eql([])
  })

  it("should return the base if there is a single base", () => {
    const base = createGardenPlugin({
      name: "base",
    })
    const plugin = createGardenPlugin({
      name: "foo",
      base: "base",
    })
    const plugins: PluginMap = {
      foo: plugin,
      base,
    }
    expect(getPluginBases(plugin, plugins)).to.eql([base])
  })

  it("should recursively return all bases for a plugin", () => {
    const baseA = createGardenPlugin({
      name: "base-a",
    })
    const baseB = createGardenPlugin({
      name: "base-b",
      base: "base-a",
    })
    const plugin = createGardenPlugin({
      name: "foo",
      base: "base-b",
    })
    const plugins: PluginMap = {
      "foo": plugin,
      "base-a": baseA,
      "base-b": baseB,
    }
    expect(sortBy(getPluginBases(plugin, plugins), "name")).to.eql([baseA, baseB])
  })
})
