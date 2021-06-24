/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { prepareSessionSettings, SessionSettings } from "../../../../src/commands/base"
import { ConfigGraph } from "../../../../src/config-graph"
import { LogEntry } from "../../../../src/logger/log-entry"
import { CloudEventHandlerCommonParams, cloudEventHandlers } from "../../../../src/process"
import { makeTestGardenA, TestGarden } from "../../../helpers"

describe("cloudEventHandlers", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let log: LogEntry
  let params: CloudEventHandlerCommonParams
  let sessionSettings: SessionSettings

  before(async () => {
    garden = await makeTestGardenA()
    log = garden.log
    graph = await garden.getConfigGraph({ log, emit: false })
    params = { garden, log, graph }
  })

  beforeEach(async () => {
    sessionSettings = prepareSessionSettings({
      deployServiceNames: ["*"],
      testModuleNames: ["*"],
      testConfigNames: ["*"],
      devModeServiceNames: ["*"],
      hotReloadServiceNames: [],
    })
  })

  describe("buildRequested", () => {
    it("should return a build task for the requested module", async () => {
      const tasks = await cloudEventHandlers.buildRequested({
        ...params,
        request: { moduleName: "module-a", force: false },
      })
      expect(tasks.length).to.eql(1)
      const buildTask = tasks.find((t) => t.type === "build")
      expect(buildTask).to.exist
      expect(buildTask!["module"].name).to.eql("module-a")
      expect(buildTask!.force).to.eql(false)
    })

    it("should optionally return a build task with force = true for the requested module", async () => {
      const tasks = await cloudEventHandlers.buildRequested({
        ...params,
        request: { moduleName: "module-a", force: true },
      })
      expect(tasks.length).to.eql(1)
      const buildTask = tasks.find((t) => t.type === "build")
      expect(buildTask).to.exist
      expect(buildTask!["module"].name).to.eql("module-a")
      expect(buildTask!.force).to.eql(true)
    })
  })

  describe("deployRequested", () => {
    it("should return a deploy task for the requested service and update the session settings", async () => {
      const deployTask = await cloudEventHandlers.deployRequested({
        ...params,
        request: { serviceName: "service-a", force: false, forceBuild: false, devMode: false, hotReload: false },
        sessionSettings,
      })
      expect(deployTask["hotReloadServiceNames"]).to.eql([])
      expect(deployTask["devModeServiceNames"]).to.eql(["service-b", "service-c"])
      expect(sessionSettings.devModeServiceNames).to.eql(["service-b", "service-c"])
    })

    it("should return a dev-mode deploy task for the requested service and update the session settings", async () => {
      const deployTask = await cloudEventHandlers.deployRequested({
        ...params,
        request: { serviceName: "service-a", force: false, forceBuild: false, devMode: true, hotReload: false },
        sessionSettings,
      })
      expect(deployTask["service"].name).to.eql("service-a")
      expect(deployTask["hotReloadServiceNames"]).to.eql([])
      expect(deployTask["devModeServiceNames"]).to.eql(["service-a", "service-b", "service-c"])
      expect(sessionSettings.devModeServiceNames).to.eql(["*"])
    })
  })

  describe("testRequested", () => {
    it("should return test tasks for the requested module", async () => {
      const testTasks = await cloudEventHandlers.testRequested({
        ...params,
        request: { moduleName: "module-a", force: false, forceBuild: false },
        sessionSettings,
      })
      expect(testTasks.map((t) => t["test"].name).sort()).to.eql(["integration", "unit"])
    })

    it("should return test tasks for the requested module and test names", async () => {
      const testTasks = await cloudEventHandlers.testRequested({
        ...params,
        request: { moduleName: "module-a", force: false, forceBuild: false, testNames: ["unit"] },
        sessionSettings,
      })
      expect(testTasks.map((t) => t["test"].name).sort()).to.eql(["unit"])
    })
  })

  describe("taskRequested", () => {
    it("should return test tasks for the requested module", async () => {
      const taskTask = await cloudEventHandlers.taskRequested({
        ...params,
        request: { taskName: "task-a", force: false, forceBuild: false },
        sessionSettings,
      })
      expect(taskTask["task"].name).to.eql("task-a")
    })
  })

  describe("setBuildOnWatch", () => {
    it("should add a module to the list of modules rebuilt on source change", async () => {
      sessionSettings.buildModuleNames = []
      cloudEventHandlers.setBuildOnWatch(graph, "module-a", true, sessionSettings)
      cloudEventHandlers.setBuildOnWatch(graph, "module-b", true, sessionSettings)
      expect(sessionSettings.buildModuleNames).to.eql(["module-a", "module-b"])
    })

    it("should remove a module from the list of modules rebuilt on source change", async () => {
      sessionSettings.buildModuleNames = []
      cloudEventHandlers.setBuildOnWatch(graph, "module-a", true, sessionSettings)
      cloudEventHandlers.setBuildOnWatch(graph, "module-b", true, sessionSettings)
      cloudEventHandlers.setBuildOnWatch(graph, "module-a", false, sessionSettings)
      expect(sessionSettings.buildModuleNames).to.eql(["module-b"])
    })
  })

  describe("setDeployOnWatch", () => {
    it("should add a service to the list of services redeployed on source change", async () => {
      sessionSettings.deployServiceNames = []
      cloudEventHandlers.setDeployOnWatch(graph, "service-a", true, sessionSettings)
      cloudEventHandlers.setDeployOnWatch(graph, "service-b", true, sessionSettings)
      expect(sessionSettings.deployServiceNames).to.eql(["service-a", "service-b"])
    })

    it("should remove a service from the list of services redeployed on source change", async () => {
      sessionSettings.deployServiceNames = []
      cloudEventHandlers.setDeployOnWatch(graph, "service-a", true, sessionSettings)
      cloudEventHandlers.setDeployOnWatch(graph, "service-b", true, sessionSettings)
      cloudEventHandlers.setDeployOnWatch(graph, "service-a", false, sessionSettings)
      expect(sessionSettings.deployServiceNames).to.eql(["service-b"])
    })

    describe("setTestOnWatch", () => {
      it("should add a module to the list of modules rebuilt on source change", async () => {
        sessionSettings.testModuleNames = []
        cloudEventHandlers.setTestOnWatch(graph, "module-a", true, sessionSettings)
        cloudEventHandlers.setTestOnWatch(graph, "module-b", true, sessionSettings)
        expect(sessionSettings.testModuleNames).to.eql(["module-a", "module-b"])
      })

      it("should remove a module from the list of modules rebuilt on source change", async () => {
        sessionSettings.testModuleNames = []
        cloudEventHandlers.setTestOnWatch(graph, "module-a", true, sessionSettings)
        cloudEventHandlers.setTestOnWatch(graph, "module-b", true, sessionSettings)
        cloudEventHandlers.setTestOnWatch(graph, "module-a", false, sessionSettings)
        expect(sessionSettings.testModuleNames).to.eql(["module-b"])
      })
    })
  })
})
