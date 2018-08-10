import { expect } from "chai"

import {
  getRemoteSourcesDirName,
  getLinkedSources,
  addLinkedSources,
  removeLinkedSources,
} from "../../../src/util/ext-source-util"
import { makeTestContextA, cleanProject, expectError } from "../../helpers"
import { PluginContext } from "../../../src/plugin-context"

describe("ext-source-util", () => {

  let ctx: PluginContext
  const sources = [{ name: "name-a", path: "path-a" }, { name: "name-b", path: "path-b" }]
  beforeEach(async () => {
    ctx = await makeTestContextA()
  })

  afterEach(async () => {
    cleanProject(ctx.projectRoot)
  })

  describe("getExtSourcesDirName", () => {
    it("should should return the project sources dir name", () => {
      const dirName = getRemoteSourcesDirName("project")
      expect(dirName).to.equal(".garden/sources/project")
    })

    it("should should return the modules sources dir name", () => {
      const dirName = getRemoteSourcesDirName("module")
      expect(dirName).to.equal(".garden/sources/module")
    })
  })

  describe("getLinkedSources", () => {

    it("should get linked project sources", async () => {
      await ctx.localConfigStore.set(["linkedProjectSources"], sources)
      expect(await getLinkedSources(ctx, "project")).to.eql(sources)
    })

    it("should get linked module sources", async () => {
      await ctx.localConfigStore.set(["linkedModuleSources"], sources)
      expect(await getLinkedSources(ctx, "module")).to.eql(sources)
    })

  })

  describe("addLinkedSources", () => {

    it("should add linked project sources to local config", async () => {
      await addLinkedSources({ ctx, sourceType: "project", sources })
      expect(await ctx.localConfigStore.get(["linkedProjectSources"])).to.eql(sources)
    })

    it("should add linked module sources to local config", async () => {
      await addLinkedSources({ ctx, sourceType: "module", sources })
      expect(await ctx.localConfigStore.get(["linkedModuleSources"])).to.eql(sources)
    })

    it("should append sources to local config if key already has value", async () => {
      const { localConfigStore } = ctx
      await localConfigStore.set(["linkedModuleSources"], sources)

      const newSources = [{ name: "name-c", path: "path-c" }]
      await addLinkedSources({ ctx, sourceType: "module", sources: newSources })

      expect(await ctx.localConfigStore.get(["linkedModuleSources"])).to.eql(sources.concat(newSources))

    })

  })

  describe("removeLinkedSources", () => {

    it("should remove linked project sources from local config", async () => {
      await ctx.localConfigStore.set(["linkedModuleSources"], sources)

      const names = ["name-a"]
      await removeLinkedSources({ ctx, sourceType: "module", names })

      expect(await ctx.localConfigStore.get(["linkedModuleSources"])).to.eql([{
        name: "name-b", path: "path-b",
      }])
    })

    it("should remove linked module sources from local config", async () => {
      await ctx.localConfigStore.set(["linkedProjectSources"], sources)

      const names = ["name-a"]
      await removeLinkedSources({ ctx, sourceType: "project", names })

      expect(await ctx.localConfigStore.get(["linkedProjectSources"])).to.eql([{
        name: "name-b", path: "path-b",
      }])
    })

    it("should remove multiple sources from local config", async () => {
      await ctx.localConfigStore.set(["linkedModuleSources"], sources.concat({ name: "name-c", path: "path-c" }))

      const names = ["name-a", "name-b"]
      await removeLinkedSources({ ctx, sourceType: "module", names })

      expect(await ctx.localConfigStore.get(["linkedModuleSources"])).to.eql([{
        name: "name-c", path: "path-c",
      }])
    })

    it("should throw if source not currently linked", async () => {
      const names = ["banana"]
      await expectError(
        async () => await removeLinkedSources({ ctx, sourceType: "project", names }),
        "parameter",
      )

    })

  })
})
