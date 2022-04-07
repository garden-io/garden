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
import { DashboardEventStream } from "../../../../src/server/dashboard-event-stream"
import { GardenProcess } from "../../../../src/db/entities/garden-process"
import { randomString } from "../../../../src/util/string"
import { ensureConnected, getConnection } from "../../../../src/db/connection"
import pEvent from "p-event"

describe("DashboardEventStream", () => {
  let streamer: DashboardEventStream
  let garden: TestGarden

  const testArg = "test-" + randomString(10)

  before(async () => {
    await ensureConnected()
  })

  beforeEach(async () => {
    garden = await makeTestGardenA()
  })

  afterEach(async () => {
    // Clean up test records
    await getConnection()
      .getRepository(GardenProcess)
      .createQueryBuilder()
      .delete()
      .where(`arguments = :arg`, { arg: testArg })
      .execute()

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

    streamer = new DashboardEventStream({
      log: garden.log,
      sessionId: garden.sessionId!,
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
      const recordA = await GardenProcess.register([testArg])
      const values = {
        command: "dashboard",
        sessionId: garden.sessionId,
        persistent: true,
        serverHost: "http://localhost:123456",
        serverAuthKey: "foo",
        projectRoot: garden.projectRoot,
        projectName: garden.projectName,
        environmentName: garden.environmentName,
        namespace: garden.namespace,
      }
      await recordA.setCommand(values)

      // Inactive
      const recordB = await GardenProcess.register([testArg])
      recordB.pid = 9999999
      await recordB.setCommand(values)

      // Different namespace
      const recordC = await GardenProcess.register([testArg])
      await recordC.setCommand({
        ...values,
        namespace: "foo",
      })

      streamer = new DashboardEventStream({
        log: garden.log,
        sessionId: garden.sessionId!,
      })
      streamer.connect({
        garden,
        streamEvents: true,
        streamLogEntries: true,
        targets: [],
      })

      const processes = await streamer.updateTargets()

      expect(processes.length).to.equal(1)
      expect(processes[0]._id).to.equal(recordA._id)
    })

    it("emits a serversUpdated event when a server is removed", async () => {
      // Correctly matched
      const record = await GardenProcess.register([testArg])
      const values = {
        command: "dashboard",
        sessionId: garden.sessionId,
        persistent: true,
        serverHost: "http://localhost:123456",
        serverAuthKey: "foo",
        projectRoot: garden.projectRoot,
        projectName: garden.projectName,
        environmentName: garden.environmentName,
        namespace: garden.namespace,
      }
      await record.setCommand(values)

      streamer = new DashboardEventStream({
        log: garden.log,
        sessionId: garden.sessionId!,
      })
      streamer.connect({
        garden,
        streamEvents: true,
        streamLogEntries: true,
        targets: [],
      })

      await streamer.updateTargets()
      await record.remove()
      await streamer.updateTargets()

      garden.events.expectEvent("serversUpdated", { servers: [] })
    })

    it("emits a serversUpdated event when a server is added", async () => {
      const record = await GardenProcess.register([testArg])
      const values = {
        command: "dashboard",
        sessionId: garden.sessionId,
        persistent: true,
        serverHost: "http://localhost:123456",
        serverAuthKey: "foo",
        projectRoot: garden.projectRoot,
        projectName: garden.projectName,
        environmentName: garden.environmentName,
        namespace: garden.namespace,
      }

      streamer = new DashboardEventStream({
        log: garden.log,
        sessionId: garden.sessionId!,
      })
      streamer.connect({
        garden,
        streamEvents: true,
        streamLogEntries: true,
        targets: [],
      })

      await streamer.updateTargets()
      await record.setCommand(values)
      await streamer.updateTargets()

      garden.events.expectEvent("serversUpdated", {
        servers: [{ host: values.serverHost, command: "dashboard", serverAuthKey: "foo" }],
      })
    })

    it("ignores servers matching ignoreHost", async () => {
      const record = await GardenProcess.register([testArg])
      const values = {
        command: "dashboard",
        sessionId: garden.sessionId,
        persistent: true,
        serverHost: "http://localhost:123456",
        serverAuthKey: "foo",
        projectRoot: garden.projectRoot,
        projectName: garden.projectName,
        environmentName: garden.environmentName,
        namespace: garden.namespace,
      }

      streamer = new DashboardEventStream({
        log: garden.log,
        sessionId: garden.sessionId!,
      })
      streamer.connect({
        garden,
        targets: [],
        streamEvents: true,
        streamLogEntries: true,
        ignoreHost: values.serverHost,
      })

      await record.setCommand(values)
      const processes = await streamer.updateTargets()

      expect(processes.length).to.equal(0)
    })

    it("returns an empty list when no Garden instance is connected", async () => {
      streamer = new DashboardEventStream({
        log: garden.log,
        sessionId: garden.sessionId!,
      })
      const processes = await streamer.updateTargets()
      expect(processes).to.eql([])
    })
  })

  it("polls to update the list of target hosts", async () => {
    // Start with no targets and initiate polling
    streamer = new DashboardEventStream({
      log: garden.log,
      sessionId: garden.sessionId!,
    })
    streamer.connect({
      garden,
      streamEvents: true,
      streamLogEntries: true,
      targets: [],
    })

    // Create a new process record
    const record = await GardenProcess.register([testArg])
    await record.setCommand({
      command: "dashboard",
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
