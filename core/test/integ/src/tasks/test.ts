/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import nock from "nock"
import { Garden } from "../../../../src"
import { CloudApi } from "../../../../src/cloud/api"
import { GlobalConfigStore } from "../../../../src/config-store/global"
import { ConfigGraph } from "../../../../src/graph/config-graph"
import { getRootLogger } from "../../../../src/logger/logger"
import { PluginContext } from "../../../../src/plugin-context"
import { KubernetesProvider } from "../../../../src/plugins/kubernetes/config"
import { TestTask } from "../../../../src/tasks/test"
import { TestGarden, getDataDir, makeTestGarden } from "../../../helpers"

const mockProjectWithDistributedCache = {
  status: "success",
  data: {
    id: "0a13e025-1758-4054-9a99-0e82fc1ccab9",
    createdAt: "2023-11-06T10:50:42.066Z",
    updatedAt: "2023-11-06T10:50:42.066Z",
    name: "actions-no-cache-test",
    repositoryUrl: "",
    status: "connected",
    relativePathInRepo: "",
    organization: {
      id: "cf4466fc-ba76-4d1b-beb0-93c5248d9ae3",
      createdAt: "2023-11-06T10:30:50.930Z",
      updatedAt: "2023-11-06T10:30:50.930Z",
      name: "gardenio",
      currentPlan: "paid-dedicated",
      namespaceTenantId: null,
    },
    environments: [
      {
        id: "4760fae6-69eb-402c-a245-38dfdd317393",
        createdAt: "2023-11-06T10:50:42.393Z",
        updatedAt: "2023-11-06T10:50:42.393Z",
        name: "local",
        aecSettings: {},
        aecSettingsCreatedAt: null,
        initScript: null,
        lastCleanupAt: null,
        projectId: "0a13e025-1758-4054-9a99-0e82fc1ccab9",
        serviceAccountId: null,
      },
      {
        id: "42028af7-5391-4906-85f1-d37a183d7a1e",
        createdAt: "2023-11-06T10:55:40.248Z",
        updatedAt: "2023-11-06T10:55:40.248Z",
        name: "localnew",
        aecSettings: {},
        aecSettingsCreatedAt: null,
        initScript: null,
        lastCleanupAt: null,
        projectId: "0a13e025-1758-4054-9a99-0e82fc1ccab9",
        serviceAccountId: null,
      },
    ],
    uid: "0a13e025-1758-4054-9a99-0e82fc1ccab9",
    availableFeatures: {
      distributedCache: true,
    },
  },
}

describe("TestTask", () => {
  context("Distributed Cache", async () => {
    let scope: nock.Scope

    let garden1: TestGarden
    let graph1: ConfigGraph
    let provider1: KubernetesProvider
    let ctx1: PluginContext

    let garden2: Garden
    let graph2: ConfigGraph
    let provider2: KubernetesProvider
    let ctx2: PluginContext

    before(async () => {
      scope = nock("https://garden.io/")

      // mock get project request with distributed cache enabled
      scope
        .get("/api/projects/uid/be19908b-5274-446c-bd2d-b8675d62fbad")
        .query(true)
        .reply(200, mockProjectWithDistributedCache)

      const log = getRootLogger().createLog()
      // const fakeCloudApi = await FakeCloudApi.factory({ log })
      const cloudApi = new CloudApi({ log, domain: "https://garden.io", globalConfigStore: new GlobalConfigStore() })
      const projectRoot = getDataDir("test-projects", "actions-no-cache")

      // env 1
      garden1 = await makeTestGarden(projectRoot, { environmentString: "local1", cloudApi })
      garden1.availableCloudFeatures.distributedCache = true
      provider1 = (await garden1.resolveProvider(garden1.log, "local-kubernetes")) as KubernetesProvider
      ctx1 = await garden1.getPluginContext({ provider: provider1, templateContext: undefined, events: undefined })
      graph1 = await garden1.getConfigGraph({ log: garden1.log, emit: false })

      // env 2
      garden2 = await makeTestGarden(projectRoot, { environmentString: "local2" })
      provider2 = (await garden2.resolveProvider(garden2.log, "local-kubernetes")) as KubernetesProvider
      ctx2 = await garden2.getPluginContext({ provider: provider2, templateContext: undefined, events: undefined })
      graph2 = await garden2.getConfigGraph({ log: garden2.log, emit: false })
    })

    after(async () => {
      if (garden1) {
        garden1.close()
      }
      if (garden2) {
        garden2.close()
      }
      nock.cleanAll()
    })

    afterEach(async () => {
      garden1.events.eventLog = []
      const router1 = await garden1.getActionRouter()
      await router1.deleteDeploys({ graph: graph1, log: garden1.log })
      const router2 = await garden2.getActionRouter()
      await router2.deleteDeploys({ graph: graph1, log: garden1.log })
    })

    it("should not run tests again, if the api returns a cache hit", async () => {
      // mock a successful cache check
      scope
        .get("/api/cache/action")
        .query(true)
        .reply(200, {
          status: "success",
          data: {
            startedAt: "2023-11-02T16:58:49.035Z",
            completedAt: "2023-11-02T16:58:58.488Z",
            success: true,
            log: [],
          },
        })

      const unresolvedAction1 = graph1.getTest("e2e-test")
      const testTask = new TestTask({
        garden: garden1,
        log: garden1.log,
        graph: graph1,
        force: false,
        forceBuild: false,
        action: unresolvedAction1,
      })

      // process test tasks and check if the testStatus event is emitted and the test is cached
      await garden1.processTasks({ tasks: [testTask], throwOnError: true, log: garden1.log })
      const testStatusEvents = garden1.events.eventLog.filter(
        (e) => e.name === "testStatus" && e.payload.status.state === "succeeded"
      )

      expect(testStatusEvents).to.have.length(1)
      expect(testStatusEvents[0].payload.actionName).to.equal("e2e-test")
      expect(testStatusEvents[0].payload.state).to.equal("cached")
    })

    it("should run tests, if the api returns a cache miss", async () => {
      // mock a cache miss
      scope.get("/api/cache/action").query(true).reply(200, {
        status: "error",
      })

      const unresolvedAction1 = graph1.getTest("e2e-test")
      const testTask = new TestTask({
        garden: garden1,
        log: garden1.log,
        graph: graph1,
        force: false,
        forceBuild: false,
        action: unresolvedAction1,
      })

      // process test tasks and verify that the testStatus event is emitted
      // and the state is ready, instead of cached.
      await garden1.processTasks({ tasks: [testTask], throwOnError: true, log: garden1.log })
      const testStatusEvents = garden1.events.eventLog.filter(
        (e) => e.name === "testStatus" && e.payload.status.state === "succeeded"
      )

      expect(testStatusEvents).to.have.length(1)
      expect(testStatusEvents[0].payload.actionName).to.equal("e2e-test")
      expect(testStatusEvents[0].payload.state).to.equal("ready")
    })
  })
})
