/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import {
  getLinkedSources,
  addLinkedSources,
  removeLinkedSources,
  getRemoteSourceLocalPath,
  hashRepoUrl,
} from "../../../../src/util/ext-source-util.js"
import { expectError, makeTestGardenA } from "../../../helpers.js"
import type { Garden } from "../../../../src/garden.js"
import { join } from "path"

describe("ext-source-util", () => {
  let garden: Garden
  const sourcesObj = {
    "name-a": { name: "name-a", path: "path-a" },
    "name-b": { name: "name-b", path: "path-b" },
  }
  const sourcesList = [
    { name: "name-a", path: "path-a" },
    { name: "name-b", path: "path-b" },
  ]

  beforeEach(async () => {
    garden = await makeTestGardenA()
  })

  describe("getRemoteSourceLocalPath", () => {
    it("should return the path to a remote project source", () => {
      const url = "banana"
      const urlHash = hashRepoUrl(url)

      const path = getRemoteSourceLocalPath({
        gardenDirPath: garden.gardenDirPath,
        url,
        name: "my-source",
        type: "project",
      })
      expect(path).to.equal(join(garden.gardenDirPath, "sources", "project", `my-source--${urlHash}`))
    })

    it("should return the relative path to a remote action source", () => {
      const url = "banana"
      const urlHash = hashRepoUrl(url)

      const path = getRemoteSourceLocalPath({
        gardenDirPath: garden.gardenDirPath,
        url,
        name: "my-action",
        type: "action",
      })
      expect(path).to.equal(join(garden.gardenDirPath, "sources", "action", `my-action--${urlHash}`))
    })

    it("should return the relative path to a remote module source", () => {
      const url = "banana"
      const urlHash = hashRepoUrl(url)

      const path = getRemoteSourceLocalPath({
        gardenDirPath: garden.gardenDirPath,
        url,
        name: "my-module",
        type: "module",
      })
      expect(path).to.equal(join(garden.gardenDirPath, "sources", "module", `my-module--${urlHash}`))
    })
  })

  describe("getLinkedSources", () => {
    it("should get linked project sources", async () => {
      await garden.localConfigStore.set("linkedProjectSources", sourcesObj)
      expect(await getLinkedSources(garden, "project")).to.eql(sourcesList)
    })

    it("should get linked module sources", async () => {
      await garden.localConfigStore.set("linkedModuleSources", sourcesObj)
      expect(await getLinkedSources(garden, "module")).to.eql(sourcesList)
    })
  })

  describe("addLinkedSources", () => {
    it("should add linked project sources to local config", async () => {
      await addLinkedSources({ garden, sourceType: "project", sources: sourcesList })
      expect(await garden.localConfigStore.get("linkedProjectSources")).to.eql(sourcesObj)
    })

    it("should add linked module sources to local config", async () => {
      await addLinkedSources({ garden, sourceType: "module", sources: sourcesList })
      expect(await garden.localConfigStore.get("linkedModuleSources")).to.eql(sourcesObj)
    })

    it("should append sources to local config if key already has value", async () => {
      const { localConfigStore: localConfigStore } = garden
      await localConfigStore.set("linkedModuleSources", sourcesObj)

      await addLinkedSources({
        garden,
        sourceType: "module",
        sources: [{ name: "name-c", path: "path-c" }],
      })

      expect(await garden.localConfigStore.get("linkedModuleSources")).to.eql({
        ...sourcesObj,
        "name-c": {
          name: "name-c",
          path: "path-c",
        },
      })
    })
  })

  describe("removeLinkedSources", () => {
    it("should remove linked project sources from local config", async () => {
      await garden.localConfigStore.set("linkedModuleSources", sourcesObj)

      const names = ["name-a"]
      await removeLinkedSources({ garden, sourceType: "module", names })

      expect(await garden.localConfigStore.get("linkedModuleSources")).to.eql({
        "name-b": {
          name: "name-b",
          path: "path-b",
        },
      })
    })

    it("should remove linked module sources from local config", async () => {
      await garden.localConfigStore.set("linkedProjectSources", sourcesObj)

      const names = ["name-a"]
      await removeLinkedSources({ garden, sourceType: "project", names })

      expect(await garden.localConfigStore.get("linkedProjectSources")).to.eql({
        "name-b": {
          name: "name-b",
          path: "path-b",
        },
      })
    })

    it("should remove multiple sources from local config", async () => {
      await garden.localConfigStore.set("linkedModuleSources", {
        ...sourcesObj,
        "name-c": {
          name: "name-c",
          path: "path-c",
        },
      })

      const names = ["name-a", "name-b"]
      await removeLinkedSources({ garden, sourceType: "module", names })

      expect(await garden.localConfigStore.get("linkedModuleSources")).to.eql({
        "name-c": {
          name: "name-c",
          path: "path-c",
        },
      })
    })

    it("should throw if source not currently linked", async () => {
      const names = ["banana"]
      await expectError(async () => await removeLinkedSources({ garden, sourceType: "project", names }), "parameter")
    })
  })
})
