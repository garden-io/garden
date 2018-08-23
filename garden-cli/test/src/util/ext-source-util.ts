import { expect } from "chai"

import {
  getRemoteSourcesDirname,
  getLinkedSources,
  addLinkedSources,
  removeLinkedSources,
  getRemoteSourcePath,
  hashRepoUrl,
} from "../../../src/util/ext-source-util"
import { makeTestContextA, cleanProject, expectError } from "../../helpers"
import { PluginContext } from "../../../src/plugin-context"

describe("ext-source-util", () => {
  let ctx: PluginContext
  const sources = [{ name: "name-a", path: "path-a" }, { name: "name-b", path: "path-b" }]

  describe("getExtSourcesDirName", () => {
    beforeEach(async () => {
      ctx = await makeTestContextA()
    })

    afterEach(async () => {
      await cleanProject(ctx.projectRoot)
    })

    it("should return the relative path to the remote projects directory", () => {
      const dirName = getRemoteSourcesDirname("project")
      expect(dirName).to.equal(".garden/sources/project")
    })

    it("should return the relative path to the remote modules directory", () => {
      const dirName = getRemoteSourcesDirname("module")
      expect(dirName).to.equal(".garden/sources/module")
    })
  })

  describe("getRemoteSourcePath", () => {
    it("should return the relative path to a remote project source", () => {
      const url = "banana"
      const urlHash = hashRepoUrl(url)

      const path = getRemoteSourcePath({ url, name: "my-source", sourceType: "project" })
      expect(path).to.equal(`.garden/sources/project/my-source--${urlHash}`)
    })

    it("should return the relative path to a remote module source", () => {
      const url = "banana"
      const urlHash = hashRepoUrl(url)

      const path = getRemoteSourcePath({ url, name: "my-module", sourceType: "module" })
      expect(path).to.equal(`.garden/sources/module/my-module--${urlHash}`)
    })
  })

  describe("getLinkedSources", () => {
    beforeEach(async () => {
      ctx = await makeTestContextA()
    })

    afterEach(async () => {
      await cleanProject(ctx.projectRoot)
    })

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
    beforeEach(async () => {
      ctx = await makeTestContextA()
    })

    afterEach(async () => {
      await cleanProject(ctx.projectRoot)
    })

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
    beforeEach(async () => {
      ctx = await makeTestContextA()
    })

    afterEach(async () => {
      await cleanProject(ctx.projectRoot)
    })

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
