/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { makeTestGardenA, TestEventBus, TestGarden } from "../../../helpers"
import { GardenServer } from "../../../../src/server/server"
import { CoreEventStream } from "../../../../src/server/core-event-stream"
import pEvent from "p-event"
import { GardenProcess } from "../../../../src/config-store/global"
import process from "process"

describe("CoreEventStream", () => {
  let streamer: CoreEventStream
  let garden: TestGarden

  beforeEach(async () => {
    garden = await makeTestGardenA()
  })

  afterEach(async () => {
    await streamer?.close()
  })

  after(async () => {
    await garden?.close()
  })

  it("posts events to the configured target hosts", async () => {
    const serverEventBusA = new TestEventBus()
    const serverEventBusB = new TestEventBus()

    const serverA = new GardenServer({ log: garden.log })
    const serverB = new GardenServer({ log: garden.log })

    serverA["incomingEvents"] = serverEventBusA
    serverB["incomingEvents"] = serverEventBusB

    await serverA.start()
    await serverB.start()

    serverA.setGarden(garden)
    serverB.setGarden(garden)

    streamer = new CoreEventStream({
      log: garden.log,
      sessionId: garden.sessionId!,
      globalConfigStore: garden.globalConfigStore,
    })
    streamer.connect({
      garden,
      streamEvents: true,
      streamLogEntries: true,
      targets: [
        { host: serverA.getBaseUrl(), clientAuthToken: serverA.authKey, enterprise: false },
        { host: serverB.getBaseUrl(), clientAuthToken: serverB.authKey, enterprise: false },
      ],
    })

    garden.events.emit("_test", "foo")

    // Make sure events are flushed
    await streamer.close()

    expect(serverEventBusA.eventLog).to.eql([{ name: "_test", payload: "foo" }])
    expect(serverEventBusB.eventLog).to.eql([{ name: "_test", payload: "foo" }])
  })

  describe("updateTargets", () => {
    it("updates and returns the current list of active servers", async () => {
      // Correctly matched
      const recordA: GardenProcess = {
        pid: process.pid,
        startedAt: new Date(),
        command: "serve",
        arguments: [],
        sessionId: garden.sessionId,
        persistent: true,
        serverHost: "http://localhost:123456",
        serverAuthKey: "foo",
        projectRoot: garden.projectRoot,
        projectName: garden.projectName,
        environmentName: garden.environmentName,
        namespace: garden.namespace,
      }
      await garden.globalConfigStore.set("activeProcesses", String(recordA.pid), recordA)

      // Inactive
      const recordB = {
        ...recordA,
        pid: 9999999,
      }
      await garden.globalConfigStore.set("activeProcesses", String(recordB.pid), recordB)

      // Different namespace
      const recordC = {
        ...recordA,
        namespace: "foo",
      }
      await garden.globalConfigStore.set("activeProcesses", String(recordC.pid), recordC)

      streamer = new CoreEventStream({
        log: garden.log,
        sessionId: garden.sessionId!,
        globalConfigStore: garden.globalConfigStore,
      })
      streamer.connect({
        garden,
        streamEvents: true,
        streamLogEntries: true,
        targets: [],
      })

      const processes = await streamer.updateTargets()

      expect(processes.length).to.equal(1)
      expect(processes[0]).to.eql(recordA)
    })

    it("emits a serversUpdated event when a server is removed", async () => {
      // Correctly matched
      const proc: GardenProcess = {
        pid: process.pid,
        startedAt: new Date(),
        command: "serve",
        arguments: [],
        sessionId: garden.sessionId,
        persistent: true,
        serverHost: "http://localhost:123456",
        serverAuthKey: "foo",
        projectRoot: garden.projectRoot,
        projectName: garden.projectName,
        environmentName: garden.environmentName,
        namespace: garden.namespace,
      }
      await garden.globalConfigStore.set("activeProcesses", String(proc.pid), proc)

      streamer = new CoreEventStream({
        log: garden.log,
        sessionId: garden.sessionId!,
        globalConfigStore: garden.globalConfigStore,
      })
      streamer.connect({
        garden,
        streamEvents: true,
        streamLogEntries: true,
        targets: [],
      })

      await streamer.updateTargets()
      await garden.globalConfigStore.delete("activeProcesses", String(proc.pid))
      await streamer.updateTargets()

      garden.events.expectEvent("serversUpdated", { servers: [] })
    })

    it("emits a serversUpdated event when a server is added", async () => {
      const proc: GardenProcess = {
        pid: process.pid,
        startedAt: new Date(),
        command: "serve",
        arguments: [],
        sessionId: garden.sessionId,
        persistent: true,
        serverHost: "http://localhost:123456",
        serverAuthKey: "foo",
        projectRoot: garden.projectRoot,
        projectName: garden.projectName,
        environmentName: garden.environmentName,
        namespace: garden.namespace,
      }

      streamer = new CoreEventStream({
        log: garden.log,
        sessionId: garden.sessionId!,
        globalConfigStore: garden.globalConfigStore,
      })
      streamer.connect({
        garden,
        streamEvents: true,
        streamLogEntries: true,
        targets: [],
      })

      await streamer.updateTargets()
      await garden.globalConfigStore.set("activeProcesses", String(proc.pid), proc)
      await streamer.updateTargets()

      garden.events.expectEvent("serversUpdated", {
        servers: [{ host: proc.serverHost!, command: "serve", serverAuthKey: "foo" }],
      })
    })

    it("ignores servers matching ignoreHost", async () => {
      const proc: GardenProcess = {
        pid: process.pid,
        startedAt: new Date(),
        command: "serve",
        arguments: [],
        sessionId: garden.sessionId,
        persistent: true,
        serverHost: "http://localhost:123456",
        serverAuthKey: "foo",
        projectRoot: garden.projectRoot,
        projectName: garden.projectName,
        environmentName: garden.environmentName,
        namespace: garden.namespace,
      }

      streamer = new CoreEventStream({
        log: garden.log,
        sessionId: garden.sessionId!,
        globalConfigStore: garden.globalConfigStore,
      })
      streamer.connect({
        garden,
        targets: [],
        streamEvents: true,
        streamLogEntries: true,
        ignoreHost: proc.serverHost!,
      })

      await garden.globalConfigStore.set("activeProcesses", String(proc.pid), proc)
      const processes = await streamer.updateTargets()

      expect(processes.length).to.equal(0)
    })

    it("returns an empty list when no Garden instance is connected", async () => {
      streamer = new CoreEventStream({
        log: garden.log,
        sessionId: garden.sessionId!,
        globalConfigStore: garden.globalConfigStore,
      })
      const processes = await streamer.updateTargets()
      expect(processes).to.eql([])
    })
  })

  it("polls to update the list of target hosts", async () => {
    // Start with no targets and initiate polling
    streamer = new CoreEventStream({
      log: garden.log,
      sessionId: garden.sessionId!,
      globalConfigStore: garden.globalConfigStore,
    })
    streamer.connect({
      garden,
      streamEvents: true,
      streamLogEntries: true,
      targets: [],
    })

    // Create a new process record
    await garden.globalConfigStore.set("activeProcesses", String(process.pid), {
      pid: process.pid,
      startedAt: new Date(),
      command: "serve",
      arguments: [],
      sessionId: garden.sessionId,
      persistent: true,
      serverHost: "http://localhost:123456",
      serverAuthKey: "foo",
      projectRoot: garden.projectRoot,
      projectName: garden.projectName,
      environmentName: garden.environmentName,
      namespace: garden.namespace,
    })

    // Wait for it to come up
    await pEvent(garden.events, "serversUpdated", { timeout: 5000 })
  })

  it.skip("removes target hosts that are unreachable", async () => {
    // TODO: let's see if we need this on top of the polling
  })
})
