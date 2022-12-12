/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { ConfigGraph } from "../../../../src/graph/config-graph"
import { LogEntry } from "../../../../src/logger/log-entry"
import { ClientRequestHandlerCommonParams, clientRequestHandlers } from "../../../../src/server/client-router"
import { makeTestGardenA, TestGarden } from "../../../helpers"

describe("clientRequestHandlers", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let log: LogEntry
  let params: ClientRequestHandlerCommonParams

  before(async () => {
    garden = await makeTestGardenA()
    log = garden.log
    graph = await garden.getConfigGraph({ log, emit: false })
    params = { garden, log, graph }
  })

  describe("build", () => {
    it("should return a build task for the requested module", async () => {
      const tasks = await clientRequestHandlers.build({
        ...params,
        request: { moduleName: "module-a", force: false },
      })
      expect(tasks.length).to.eql(1)
      const buildTask = tasks.find((t) => t.type === "build")
      expect(buildTask).to.exist
      expect(buildTask!.getName()).to.eql("module-a")
      expect(buildTask!.force).to.eql(false)
    })

    it("should optionally return a build task with force = true for the requested module", async () => {
      const tasks = await clientRequestHandlers.build({
        ...params,
        request: { moduleName: "module-a", force: true },
      })
      expect(tasks.length).to.eql(1)
      const buildTask = tasks.find((t) => t.type === "build")
      expect(buildTask).to.exist
      expect(buildTask!.getName()).to.eql("module-a")
      expect(buildTask!.force).to.eql(true)
    })
  })

  describe("deploy", () => {
    it("should return a deploy task for the requested service", async () => {
<<<<<<< HEAD:core/test/unit/src/enterprise/event-handlers.ts
      const deployTasks = await cloudEventHandlers.deployRequested({
=======
      const deployTask = await clientRequestHandlers.deploy({
>>>>>>> main:core/test/unit/src/cloud/client-request-handlers.ts
        ...params,
        request: {
          serviceName: "service-a",
          force: false,
          forceBuild: false,
          devMode: false,

          localMode: false,
          skipDependencies: true,
        },
      })
      expect(deployTasks.length).to.eql(1)
      const deployTask = deployTasks[0]
      expect(deployTask.devModeDeployNames).to.eql([])
      expect(deployTask.localModeDeployNames).to.eql([])
      expect(deployTask.action.name).to.eql("service-a")
    })

    it("should return a dev-mode deploy task for the requested service", async () => {
<<<<<<< HEAD:core/test/unit/src/enterprise/event-handlers.ts
      const deployTasks = await cloudEventHandlers.deployRequested({
=======
      const deployTask = await clientRequestHandlers.deploy({
>>>>>>> main:core/test/unit/src/cloud/client-request-handlers.ts
        ...params,
        request: {
          serviceName: "service-a",
          force: false,
          forceBuild: false,
          devMode: true,
          localMode: false,
          skipDependencies: true,
        },
      })
      expect(deployTasks.length).to.eql(1)
      const deployTask = deployTasks[0]
      expect(deployTask.action.name).to.eql("service-a")
      // todo
      // expect(deployTask.devModeDeployNames).to.eql(["service-a"])
    })

    it("should return a local-mode deploy task for the requested service", async () => {
<<<<<<< HEAD:core/test/unit/src/enterprise/event-handlers.ts
      const deployTasks = await cloudEventHandlers.deployRequested({
=======
      const deployTask = await clientRequestHandlers.deploy({
>>>>>>> main:core/test/unit/src/cloud/client-request-handlers.ts
        ...params,
        request: {
          serviceName: "service-a",
          force: false,
          forceBuild: false,
          devMode: false,
          localMode: true,
          skipDependencies: true,
        },
      })
      expect(deployTasks.length).to.eql(1)
      const deployTask = deployTasks[0]
      expect(deployTask.action.name).to.eql("service-a")
      // todo
      // expect(deployTask.localModeDeployNames).to.eql(["service-a"])
    })
  })

  describe("test", () => {
    it("should return test tasks for the requested module", async () => {
      const testTasks = await clientRequestHandlers.test({
        ...params,
        request: { moduleName: "module-a", force: false, forceBuild: false, skipDependencies: true },
      })
      expect(testTasks.map((t) => t.action.name).sort()).to.eql(["module-a-integration", "module-a-unit"])
    })

    it("should return test tasks for the requested module and test names", async () => {
      const testTasks = await clientRequestHandlers.test({
        ...params,
        request: {
          moduleName: "module-a",
          force: false,
          forceBuild: false,
          testNames: ["module-a-unit"],
          skipDependencies: true,
        },
      })
      expect(testTasks.map((t) => t.action.name).sort()).to.eql(["module-a-unit"])
    })
  })

  describe("run", () => {
    it("should return test tasks for the requested module", async () => {
<<<<<<< HEAD:core/test/unit/src/enterprise/event-handlers.ts
      const taskTasks = await cloudEventHandlers.taskRequested({
=======
      const taskTask = await clientRequestHandlers.run({
>>>>>>> main:core/test/unit/src/cloud/client-request-handlers.ts
        ...params,
        request: { taskName: "task-a", force: false, forceBuild: false, skipDependencies: false },
      })

      expect(taskTasks.length).to.eql(1)
      const taskTask = taskTasks[0]
      expect(taskTask.action.name).to.eql("task-a")
    })
  })
})
