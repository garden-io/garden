/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { PluginMap } from "../../../../src/plugin/plugin.js"
import { createGardenPlugin } from "../../../../src/plugin/plugin.js"
import { getPluginBases } from "../../../../src/plugins.js"
import { expect } from "chai"
import { sortBy } from "lodash-es"
import type { TempDirectory, TestGarden } from "../../../helpers.js"
import { makeTempDir, makeTestGarden, stubProviderAction, createProjectConfig } from "../../../helpers.js"
import { ResolveProviderTask } from "../../../../src/tasks/resolve-provider.js"
import fsExtra from "fs-extra"

const { pathExists, writeFile, remove } = fsExtra
import { join } from "path"
import { serialize } from "v8"
import moment from "moment"
import { GraphResults } from "../../../../src/graph/results.js"
import { CACHE_DIR_NAME } from "../../../../src/constants.js"

describe("ResolveProviderTask", () => {
  let tmpDir: TempDirectory
  let garden: TestGarden
  let task: ResolveProviderTask

  before(async () => {
    tmpDir = await makeTempDir({ git: true, initialCommit: false })
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  beforeEach(async () => {
    // TODO: it looks like this path never exists => fix it?
    await remove(join(tmpDir.path, CACHE_DIR_NAME))

    garden = await makeTestGarden(tmpDir.path, {
      config: createProjectConfig({
        path: tmpDir.path,
        providers: [{ name: "test-plugin" }],
      }),
    })

    const plugin = await garden.getPlugin("test-plugin")
    const config = garden.getUnresolvedProviderConfigs({ names: ["test-plugin"] })[0]

    task = new ResolveProviderTask({
      garden,
      log: garden.log,
      plugin,
      config,
      forceRefresh: false,
      forceInit: false,
      allPlugins: await garden.getAllPlugins(),
      force: false,
    })
  })

  afterEach(() => {
    garden.close()
  })

  it("should resolve status if no cached status exists", async () => {
    const provider = await task.process({ statusOnly: false, dependencyResults: new GraphResults([]) })
    expect(provider.status.cached).to.be.undefined
  })

  it("should cache the provider status", async () => {
    await task.process({ statusOnly: false, dependencyResults: new GraphResults([]) })
    const cachePath = task["getCachePath"]()
    expect(await pathExists(cachePath)).to.be.true
  })

  it("should not cache the provider status if disableCache=true", async () => {
    await stubProviderAction(garden, "test-plugin", "getEnvironmentStatus", async () => {
      return { ready: true, disableCache: true, outputs: {} }
    })
    await task.process({ statusOnly: false, dependencyResults: new GraphResults([]) })
    const cachePath = task["getCachePath"]()
    expect(await pathExists(cachePath)).to.be.true
  })

  it("should return with cached provider status if the config hash matches and TTL is within range", async () => {
    await task.process({ statusOnly: false, dependencyResults: new GraphResults([]) })
    const provider = await task.process({ statusOnly: false, dependencyResults: new GraphResults([]) })
    expect(provider.status.cached).to.be.true
  })

  it("should not use cached status if the cached data is invalid", async () => {
    const cachePath = task["getCachePath"]()
    await writeFile(cachePath, serialize({ foo: "bla" }))

    const provider = await task.process({ statusOnly: false, dependencyResults: new GraphResults([]) })
    expect(provider.status.cached).to.be.undefined
  })

  it("should not use cached status if the config hash doesn't match", async () => {
    let provider = await task.process({ statusOnly: false, dependencyResults: new GraphResults([]) })

    const cachedStatus = await task["getCachedStatus"](provider.config)

    const cachePath = task["getCachePath"]()
    await writeFile(cachePath, serialize({ ...cachedStatus, configHash: "abcdef", resolvedAt: new Date() }))

    provider = await task.process({ statusOnly: false, dependencyResults: new GraphResults([]) })
    expect(provider.status.cached).to.be.undefined
  })

  it("should use cached status if the cache is just within the TTL", async () => {
    let provider = await task.process({ statusOnly: false, dependencyResults: new GraphResults([]) })

    const cachedStatus = await task["getCachedStatus"](provider.config)

    // Just over one hour, which is the default TTL
    const resolvedAt = moment().subtract(3500, "seconds").toDate()

    const configHash = task["hashConfig"](provider.config)

    const cachePath = task["getCachePath"]()
    await writeFile(cachePath, serialize({ ...cachedStatus, configHash, resolvedAt }))

    provider = await task.process({ statusOnly: false, dependencyResults: new GraphResults([]) })
    expect(provider.status.cached).to.be.true
  })

  it("should not use cached status if the cache is expired", async () => {
    let provider = await task.process({ statusOnly: false, dependencyResults: new GraphResults([]) })

    const cachedStatus = await task["getCachedStatus"](provider.config)

    // Just over one hour, which is the default TTL
    const resolvedAt = moment().subtract(3601, "seconds").toDate()

    const configHash = task["hashConfig"](provider.config)

    const cachePath = task["getCachePath"]()
    await writeFile(cachePath, serialize({ ...cachedStatus, configHash, resolvedAt }))

    provider = await task.process({ statusOnly: false, dependencyResults: new GraphResults([]) })
    expect(provider.status.cached).to.be.undefined
  })

  it("should not use cached status if forceRefresh=true", async () => {
    await task.process({ statusOnly: false, dependencyResults: new GraphResults([]) })

    task["forceRefresh"] = true

    const provider = await task.process({ statusOnly: false, dependencyResults: new GraphResults([]) })
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
