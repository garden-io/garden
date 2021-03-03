/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { GardenProcess } from "../../../../../src/db/entities/garden-process"
import { randomString } from "../../../../../src/util/string"
import { ensureConnected, getConnection } from "../../../../../src/db/connection"
import { uuidv4 } from "../../../../../src/util/util"
import { find, random } from "lodash"

describe("GardenProcess", () => {
  const testCommand = "test-" + randomString(10)

  before(async () => {
    await ensureConnected()
  })

  afterEach(async () => {
    await getConnection()
      .getRepository(GardenProcess)
      .createQueryBuilder()
      .delete()
      .where(`arguments LIKE :cmd`, { cmd: testCommand + "%" })
      .execute()
  })

  describe("register", () => {
    it("creates and saves a partial record for the current process", async () => {
      const record = await GardenProcess.register([testCommand, "arg"])
      expect(record.pid).to.equal(process.pid)
      expect(record.arguments).to.equal(`${testCommand} arg`)
      await GardenProcess.findOneOrFail({ where: { pid: record.pid } })
    })
  })

  describe("setCommand", () => {
    it("updates the given record with information about the running Command", async () => {
      const record = await GardenProcess.register([testCommand, "arg"])

      const values = {
        command: testCommand,
        sessionId: uuidv4(),
        persistent: true,
        serverHost: "http://localhost:1234",
        serverAuthKey: "abcdef",
        projectRoot: "/tmp",
        projectName: testCommand + "-project",
        environmentName: "dev",
        namespace: "default",
      }

      await record.setCommand(values)
      const updated = await GardenProcess.findOneOrFail({ where: { pid: record.pid, command: testCommand } })

      for (const [key, value] of Object.entries(values)) {
        expect(updated[key]).to.equal(value)
      }
    })
  })

  describe("getActiveProcesses", () => {
    it("retrieves all running, registered processes", async () => {
      const a = await GardenProcess.register([testCommand, "something"])
      const b = await GardenProcess.register([testCommand, "different"])
      const running = await GardenProcess.getActiveProcesses()

      expect(running.length).gte(2)
      expect(find(running, (p) => p._id === a._id)).to.exist
      expect(find(running, (p) => p._id === b._id)).to.exist
    })

    it("cleans up any stale records for inactive processes", async () => {
      const a = await GardenProcess.register([testCommand, "a"])
      const b = GardenProcess.create({
        arguments: [testCommand, "b"].join(" "),
        pid: random(1000000, 2000000),
        startedAt: new Date(),
      })
      const c = GardenProcess.create({
        arguments: [testCommand, "c"].join(" "),
        pid: random(1000000, 2000000),
        startedAt: new Date(),
      })
      await b.save()
      await c.save()

      const running = await GardenProcess.getActiveProcesses()

      expect(running.length).lte(2)
      expect(find(running, (p) => p._id === a._id)).to.exist
      expect(find(running, (p) => p._id === b._id)).to.not.exist
      expect(find(running, (p) => p._id === c._id)).to.not.exist
    })
  })

  describe("getDashboardProcess", () => {
    const scope = {
      projectRoot: "/tmp",
      projectName: testCommand + "-project",
      environmentName: "dev",
      namespace: "default",
    }

    const values = {
      arguments: testCommand,
      sessionId: uuidv4(),
      persistent: true,
      serverHost: "http://localhost:1234",
      serverAuthKey: "abcdef",
      ...scope,
    }

    const buildCommand = {
      command: "build",
      pid: 1,
      startedAt: new Date(),
      ...values,
    }
    const dashboardCommand = {
      command: "dashboard",
      pid: 2,
      startedAt: new Date(),
      ...values,
    }
    const otherProjectDashboard = {
      command: "dashboard",
      pid: 3,
      startedAt: new Date(),
      ...values,
      projectName: "other-project",
    }
    const otherNamespaceDashboard = {
      command: "dashboard",
      pid: 4,
      startedAt: new Date(),
      ...values,
      namespace: "other-namespace",
    }

    it("picks a Garden dashboard process for a project+env", async () => {
      const commands = [buildCommand, dashboardCommand, otherProjectDashboard, otherNamespaceDashboard].map((spec) =>
        GardenProcess.create(spec)
      )

      const result = GardenProcess.getDashboardProcess(commands, scope)
      expect(result?.pid).to.equal(2)
    })

    it("returns undefined if no running Garden process is found for the project+env", async () => {
      const commands = [buildCommand, otherProjectDashboard, otherNamespaceDashboard].map((spec) =>
        GardenProcess.create(spec)
      )

      const result = GardenProcess.getDashboardProcess(commands, scope)
      expect(result).to.be.undefined
    })
  })
})
