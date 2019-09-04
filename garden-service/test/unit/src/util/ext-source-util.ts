import { expect } from "chai"

import {
  getRemoteSourcesDirname,
  getLinkedSources,
  addLinkedSources,
  removeLinkedSources,
  getRemoteSourceRelPath,
  hashRepoUrl,
} from "../../../../src/util/ext-source-util"
import { expectError, makeTestGardenA } from "../../../helpers"
import { Garden } from "../../../../src/garden"
import { join } from "path"

describe("ext-source-util", () => {
  let garden: Garden
  const sources = [{ name: "name-a", path: "path-a" }, { name: "name-b", path: "path-b" }]

  beforeEach(async () => {
    garden = await makeTestGardenA()
  })

  describe("getExtSourcesDirName", () => {
    it("should return the relative path to the remote projects directory", () => {
      const dirName = getRemoteSourcesDirname("project")
      expect(dirName).to.equal(join("sources", "project"))
    })

    it("should return the relative path to the remote modules directory", () => {
      const dirName = getRemoteSourcesDirname("module")
      expect(dirName).to.equal(join("sources", "module"))
    })
  })

  describe("getRemoteSourceRelPath", () => {
    it("should return the relative path to a remote project source", () => {
      const url = "banana"
      const urlHash = hashRepoUrl(url)

      const path = getRemoteSourceRelPath({
        url,
        name: "my-source",
        sourceType: "project",
      })
      expect(path).to.equal(join("sources", "project", `my-source--${urlHash}`))
    })

    it("should return the relative path to a remote module source", () => {
      const url = "banana"
      const urlHash = hashRepoUrl(url)

      const path = getRemoteSourceRelPath({
        url,
        name: "my-module",
        sourceType: "module",
      })
      expect(path).to.equal(join("sources", "module", `my-module--${urlHash}`))
    })
  })

  describe("getLinkedSources", () => {
    it("should get linked project sources", async () => {
      await garden.configStore.set(["linkedProjectSources"], sources)
      expect(await getLinkedSources(garden, "project")).to.eql(sources)
    })

    it("should get linked module sources", async () => {
      await garden.configStore.set(["linkedModuleSources"], sources)
      expect(await getLinkedSources(garden, "module")).to.eql(sources)
    })
  })

  describe("addLinkedSources", () => {
    it("should add linked project sources to local config", async () => {
      await addLinkedSources({ garden, sourceType: "project", sources })
      expect(await garden.configStore.get(["linkedProjectSources"])).to.eql(sources)
    })

    it("should add linked module sources to local config", async () => {
      await addLinkedSources({ garden, sourceType: "module", sources })
      expect(await garden.configStore.get(["linkedModuleSources"])).to.eql(sources)
    })

    it("should append sources to local config if key already has value", async () => {
      const { configStore: localConfigStore } = garden
      await localConfigStore.set(["linkedModuleSources"], sources)

      const newSources = [{ name: "name-c", path: "path-c" }]
      await addLinkedSources({
        garden,
        sourceType: "module",
        sources: newSources,
      })

      expect(await garden.configStore.get(["linkedModuleSources"])).to.eql(sources.concat(newSources))
    })
  })

  describe("removeLinkedSources", () => {
    it("should remove linked project sources from local config", async () => {
      await garden.configStore.set(["linkedModuleSources"], sources)

      const names = ["name-a"]
      await removeLinkedSources({ garden, sourceType: "module", names })

      expect(await garden.configStore.get(["linkedModuleSources"])).to.eql([
        {
          name: "name-b",
          path: "path-b",
        },
      ])
    })

    it("should remove linked module sources from local config", async () => {
      await garden.configStore.set(["linkedProjectSources"], sources)

      const names = ["name-a"]
      await removeLinkedSources({ garden, sourceType: "project", names })

      expect(await garden.configStore.get(["linkedProjectSources"])).to.eql([
        {
          name: "name-b",
          path: "path-b",
        },
      ])
    })

    it("should remove multiple sources from local config", async () => {
      await garden.configStore.set(["linkedModuleSources"], sources.concat({ name: "name-c", path: "path-c" }))

      const names = ["name-a", "name-b"]
      await removeLinkedSources({ garden, sourceType: "module", names })

      expect(await garden.configStore.get(["linkedModuleSources"])).to.eql([
        {
          name: "name-c",
          path: "path-c",
        },
      ])
    })

    it("should throw if source not currently linked", async () => {
      const names = ["banana"]
      await expectError(async () => await removeLinkedSources({ garden, sourceType: "project", names }), "parameter")
    })
  })
})
