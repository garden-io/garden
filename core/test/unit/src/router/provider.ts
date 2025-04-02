/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { providerFromConfig } from "../../../../src/config/provider.js"
import type { ConfigGraph } from "../../../../src/graph/config-graph.js"
import type { Log } from "../../../../src/logger/log-entry.js"
import type { DashboardPage } from "../../../../src/plugin/handlers/Provider/getDashboardPage.js"
import type { ActionRouter } from "../../../../src/router/router.js"
import type { TestGarden } from "../../../helpers.js"
import { getRouterTestData } from "./_helpers.js"

describe("provider actions", async () => {
  let garden: TestGarden
  let actionRouter: ActionRouter
  let log: Log
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
      const config = { name: "test-plugin-a", foo: "bar", dependencies: [] }
      const result = await actionRouter.provider.configureProvider({
        ctx: await garden.getPluginContext({
          provider: providerFromConfig({
            plugin: await garden.getPlugin("test-plugin-a"),
            config,
            dependencies: {},
            moduleConfigs: [],
            status: { ready: false, outputs: {} },
          }),
          templateContext: undefined,
          events: undefined,
        }),
        namespace: "default",
        environmentName: "default",
        pluginName: "test-plugin-a",
        log,
        config,
        configStore: garden.localConfigStore,
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
      const providers = await garden.resolveProviders({ log: garden.log })
      const result = await actionRouter.provider.augmentGraph({
        log,
        pluginName: "test-plugin-a",
        actions: graph.getActions(),
        providers,
        events: undefined,
      })

      expect(result.addDependencies).to.eql([
        {
          by: {
            kind: "Deploy",
            name: "added-by-test-plugin-a",
          },
          on: {
            kind: "Build",
            name: "added-by-test-plugin-a",
          },
        },
      ])
      expect(result.addActions?.map((a) => ({ name: a.name, kind: a.kind }))).to.eql([
        {
          name: "added-by-test-plugin-a",
          kind: "Build",
        },
        {
          name: "added-by-test-plugin-a",
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
      const result = await actionRouter.provider.getDashboardPage({
        log,
        pluginName: "test-plugin-a",
        page,
        events: undefined,
      })
      expect(result).to.eql({
        url: "http://foo",
      })
    })
  })

  describe("getEnvironmentStatus", () => {
    it("should return the environment status for a provider", async () => {
      const result = await actionRouter.provider.getEnvironmentStatus({
        log,
        pluginName: "test-plugin-a",
        events: undefined,
      })
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
        pluginName: "test-plugin-a",
        force: false,
        events: undefined,
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
      const result = await actionRouter.provider.cleanupEnvironment({
        log,
        pluginName: "test-plugin-a",
        events: undefined,
      })
      expect(result).to.eql({})
    })
  })
})
