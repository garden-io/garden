/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { providerFromConfig } from "../../../../src/config/provider"
import { ConfigGraph } from "../../../../src/graph/config-graph"
import { LogEntry } from "../../../../src/logger/log-entry"
import { DashboardPage } from "../../../../src/plugin/handlers/provider/getDashboardPage"
import { ActionRouter } from "../../../../src/router/router"
import { TestGarden } from "../../../helpers"
import { getRouterTestData } from "./_helpers"

describe("provider actions", async () => {
  let garden: TestGarden
  let actionRouter: ActionRouter
  let log: LogEntry
  let graph: ConfigGraph

  before(async () => {
    const data = await getRouterTestData()
    garden = data.garden
    actionRouter = data.actionRouter
    log = data.log
    graph = data.graph
  })

  describe("configureProvider", () => {
    it("should configure the provider", async () => {
      const config = { name: "test-plugin", foo: "bar", dependencies: [] }
      const result = await actionRouter.provider.configureProvider({
        ctx: await garden.getPluginContext(
          providerFromConfig({
            plugin: await garden.getPlugin("test-plugin"),
            config,
            dependencies: {},
            moduleConfigs: [],
            status: { ready: false, outputs: {} },
          })
        ),
        namespace: "default",
        environmentName: "default",
        pluginName: "test-plugin",
        log,
        config,
        configStore: garden.configStore,
        projectName: garden.projectName,
        projectRoot: garden.projectRoot,
        dependencies: {},
      })
      expect(result).to.eql({
        config,
        moduleConfigs: [],
      })
    })
  })

  describe("augmentGraph", () => {
    it("should return modules and/or dependency relations to add to the stack graph", async () => {
      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const providers = await garden.resolveProviders(garden.log)
      const result = await actionRouter.provider.augmentGraph({
        log,
        pluginName: "test-plugin",
        actions: graph.getActions(),
        providers,
      })

      const name = "added-by-test-plugin"
      expect(result.addDependencies).to.eql([
        {
          by: {
            kind: "Deploy",
            name: "added-by-test-plugin",
          },
          on: {
            kind: "Build",
            name: "added-by-test-plugin",
          },
        },
      ])
      expect(result.addActions?.map((a) => ({ name: a.name, kind: a.kind }))).to.eql([
        {
          name: "added-by-test-plugin",
          kind: "Build",
        },
        {
          name: "added-by-test-plugin",
          kind: "Deploy",
        },
      ])
    })
  })

  describe("getDashboardPage", () => {
    it("should resolve the URL for a dashboard page", async () => {
      const page: DashboardPage = {
        name: "foo",
        title: "Foo",
        description: "foodefoodefoo",
        newWindow: false,
      }
      const result = await actionRouter.provider.getDashboardPage({ log, pluginName: "test-plugin", page })
      expect(result).to.eql({
        url: "http://foo",
      })
    })
  })

  describe("getEnvironmentStatus", () => {
    it("should return the environment status for a provider", async () => {
      const result = await actionRouter.provider.getEnvironmentStatus({ log, pluginName: "test-plugin" })
      expect(result).to.eql({
        ready: false,
        outputs: {},
      })
    })
  })

  describe("prepareEnvironment", () => {
    it("should prepare the environment for a configured provider", async () => {
      const result = await actionRouter.provider.prepareEnvironment({
        log,
        pluginName: "test-plugin",
        force: false,
        status: { ready: true, outputs: {} },
      })
      expect(result).to.eql({
        status: {
          ready: true,
          outputs: {},
        },
      })
    })
  })

  describe("cleanupEnvironment", () => {
    it("should clean up environment for a provider", async () => {
      const result = await actionRouter.provider.cleanupEnvironment({ log, pluginName: "test-plugin" })
      expect(result).to.eql({})
    })
  })

  describe("getSecret", () => {
    it("should retrieve a secret from the specified provider", async () => {
      const result = await actionRouter.provider.getSecret({ log, pluginName: "test-plugin", key: "foo" })
      expect(result).to.eql({ value: "foo" })
    })
  })

  describe("setSecret", () => {
    it("should set a secret via the specified provider", async () => {
      const result = await actionRouter.provider.setSecret({
        log,
        pluginName: "test-plugin",
        key: "foo",
        value: "boo",
      })
      expect(result).to.eql({})
    })
  })

  describe("deleteSecret", () => {
    it("should delete a secret from the specified provider", async () => {
      const result = await actionRouter.provider.deleteSecret({ log, pluginName: "test-plugin", key: "foo" })
      expect(result).to.eql({ found: true })
    })
  })
})
