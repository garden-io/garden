/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { ResolvedBuildAction } from "../../../../src/actions/build"
import { ConfigGraph } from "../../../../src/graph/config-graph"
import { LogEntry } from "../../../../src/logger/log-entry"
import { ActionRouter } from "../../../../src/router/router"
import { GardenModule } from "../../../../src/types/module"
import { TestGarden } from "../../../helpers"
import { getRouterTestData } from "./_helpers"

describe("build actions", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let log: LogEntry
  let actionRouter: ActionRouter
  let resolvedBuildAction: ResolvedBuildAction
  let module: GardenModule
  let dateUsedForCompleted: Date

  before(async () => {
    const data = await getRouterTestData()
    garden = data.garden
    graph = data.graph
    log = data.log
    actionRouter = data.actionRouter
    resolvedBuildAction = data.resolvedBuildAction
    module = data.module
    dateUsedForCompleted = data.dateUsedForCompleted
  })

  after(async () => {
    await garden.close()
  })

  describe("build.getStatus", () => {
    it("should correctly call the corresponding plugin handler", async () => {
      const result = await actionRouter.build.getStatus({ log, action: resolvedBuildAction, graph })
      expect(result.outputs.foo).to.eql("bar")
    })

    it("should emit a buildStatus event", async () => {
      garden.events.eventLog = []
      await actionRouter.build.getStatus({ log, action: resolvedBuildAction, graph })
      const event = garden.events.eventLog[0]
      expect(event).to.exist
      expect(event.name).to.eql("buildStatus")
      expect(event.payload.moduleName).to.eql("module-a")
      expect(event.payload.moduleVersion).to.eql(module.version.versionString)
      expect(event.payload.actionUid).to.be.undefined
      expect(event.payload.status.state).to.eql("fetched")
    })
  })

  describe("build", () => {
    it("should correctly call the corresponding plugin handler", async () => {
      const result = await actionRouter.build.build({ log, action: resolvedBuildAction, graph })
      expect(result).to.eql({
        detail: {},
        outputs: {
          foo: "bar",
          isTestPluginABuildActionBuildHandlerReturn: true,
        },
        state: "ready",
      })
    })

    it("should emit buildStatus events", async () => {
      garden.events.eventLog = []
      await actionRouter.build.build({ log, action: resolvedBuildAction, graph })
      const event1 = garden.events.eventLog[0]
      const event2 = garden.events.eventLog[1]
      const moduleVersion = module.version.versionString
      expect(event1).to.exist
      expect(event1.name).to.eql("buildStatus")
      expect(event1.payload.moduleName).to.eql("module-a")
      expect(event1.payload.moduleVersion).to.eql(moduleVersion)
      expect(event1.payload.status.state).to.eql("building")
      expect(event1.payload.actionUid).to.be.ok
      expect(event2).to.exist
      expect(event2.name).to.eql("buildStatus")
      expect(event2.payload.moduleName).to.eql("module-a")
      expect(event2.payload.moduleVersion).to.eql(moduleVersion)
      expect(event2.payload.status.state).to.eql("built")
      expect(event2.payload.actionUid).to.eql(event1.payload.actionUid)
    })
  })

  describe("build.run", () => {
    it("should correctly call the corresponding plugin handler", async () => {
      const command = ["npm", "run"]
      const result = await actionRouter.build.run({
        log,
        action: (
          await garden.executeAction({
            action: resolvedBuildAction,
            log: garden.log,
            graph: await garden.getConfigGraph({ log: garden.log, emit: false }),
          })
        ).executedAction,
        args: command,
        interactive: true,
        graph,
      })
      expect(result).to.eql({
        moduleName: module.name,
        command,
        completedAt: dateUsedForCompleted,
        log: "bla bla",
        success: true,
        startedAt: dateUsedForCompleted,
        version: resolvedBuildAction.versionString(),
      })
    })
  })
})
