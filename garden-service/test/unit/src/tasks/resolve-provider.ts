/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { PluginMap, createGardenPlugin } from "../../../../src/types/plugin/plugin"
import { getPluginBases } from "../../../../src/plugins"
import { expect } from "chai"
import { sortBy } from "lodash"
import { makeTempDir, TempDirectory, TestGarden, makeTestGarden, stubAction } from "../../../helpers"
import { DEFAULT_API_VERSION } from "../../../../src/constants"
import execa from "execa"
import { ResolveProviderTask } from "../../../../src/tasks/resolve-provider"
import { pathExists, writeFile, remove } from "fs-extra"
import { join } from "path"
import { serialize } from "v8"
import moment from "moment"

describe("ResolveProviderTask", () => {
  let tmpDir: TempDirectory
  let garden: TestGarden
  let task: ResolveProviderTask

  before(async () => {
    tmpDir = await makeTempDir()
    const path = tmpDir.path

    await execa("git", ["init"], { cwd: path })
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  beforeEach(async () => {
    await remove(join(tmpDir.path, "cache"))

    garden = await makeTestGarden(tmpDir.path, {
      config: {
        apiVersion: DEFAULT_API_VERSION,
        kind: "Project",
        name: "test",
        path: tmpDir.path,
        defaultEnvironment: "default",
        dotIgnoreFiles: [],
        environments: [{ name: "default", variables: {} }],
        providers: [{ name: "test-plugin" }],
        variables: {},
      },
    })

    const plugin = await garden.getPlugin("test-plugin")
    const config = garden.getRawProviderConfigs(["test-plugin"])[0]

    task = new ResolveProviderTask({
      garden,
      log: garden.log,
      plugin,
      config,
      version: garden.version,
      forceRefresh: false,
      forceInit: false,
    })
  })

  it("should resolve status if no cached status exists", async () => {
    const provider = await task.process({})
    expect(provider.status.cached).to.be.undefined
  })

  it("should cache the provider status", async () => {
    await task.process({})
    const cachePath = task["getCachePath"]()
    expect(await pathExists(cachePath)).to.be.true
  })

  it("should not cache the provider status if disableCache=true", async () => {
    await stubAction(garden, "test-plugin", "getEnvironmentStatus", async () => {
      return { ready: true, disableCache: true, outputs: {} }
    })
    await task.process({})
    const cachePath = task["getCachePath"]()
    expect(await pathExists(cachePath)).to.be.true
  })

  it("should return with cached provider status if the config hash matches and TTL is within range", async () => {
    await task.process({})
    const provider = await task.process({})
    expect(provider.status.cached).to.be.true
  })

  it("should not use cached status if the cached data is invalid", async () => {
    const cachePath = task["getCachePath"]()
    await writeFile(cachePath, serialize({ foo: "bla" }))

    const provider = await task.process({})
    expect(provider.status.cached).to.be.undefined
  })

  it("should not use cached status if the config hash doesn't match", async () => {
    let provider = await task.process({})

    const cachedStatus = await task["getCachedStatus"](provider.config)

    const cachePath = task["getCachePath"]()
    await writeFile(cachePath, serialize({ ...cachedStatus, configHash: "abcdef", resolvedAt: new Date() }))

    provider = await task.process({})
    expect(provider.status.cached).to.be.undefined
  })

  it("should use cached status if the cache is just within the TTL", async () => {
    let provider = await task.process({})

    const cachedStatus = await task["getCachedStatus"](provider.config)

    // Just over one hour, which is the default TTL
    const resolvedAt = moment()
      .subtract(3500, "seconds")
      .toDate()

    const configHash = task["hashConfig"](provider.config)

    const cachePath = task["getCachePath"]()
    await writeFile(cachePath, serialize({ ...cachedStatus, configHash, resolvedAt }))

    provider = await task.process({})
    expect(provider.status.cached).to.be.true
  })

  it("should not use cached status if the cache is expired", async () => {
    let provider = await task.process({})

    const cachedStatus = await task["getCachedStatus"](provider.config)

    // Just over one hour, which is the default TTL
    const resolvedAt = moment()
      .subtract(3601, "seconds")
      .toDate()

    const configHash = task["hashConfig"](provider.config)

    const cachePath = task["getCachePath"]()
    await writeFile(cachePath, serialize({ ...cachedStatus, configHash, resolvedAt }))

    provider = await task.process({})
    expect(provider.status.cached).to.be.undefined
  })

  it("should not use cached status if forceRefresh=true", async () => {
    await task.process({})

    task["forceRefresh"] = true

    const provider = await task.process({})
    expect(provider.status.cached).to.be.undefined
  })
})

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
