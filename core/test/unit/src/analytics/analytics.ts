/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import nock from "nock"
import { isEqual } from "lodash"

import { makeTestGardenA, TestGarden, enableAnalytics } from "../../../helpers"
import { AnalyticsHandler } from "../../../../src/analytics/analytics"
import { DEFAULT_API_VERSION } from "../../../../src/constants"

describe("AnalyticsHandler", () => {
  const host = "https://api.segment.io"
  const scope = nock(host)
  let analytics: AnalyticsHandler
  let garden: TestGarden
  let resetAnalyticsConfig: Function

  before(async () => {
    garden = await makeTestGardenA()
    resetAnalyticsConfig = await enableAnalytics(garden)
  })

  beforeEach(async () => {
    garden = await makeTestGardenA()
    garden["sessionId"] = "asdf"
  })

  afterEach(async () => {
    // Flush so queued events don't leak between tests
    await analytics.flush()
    AnalyticsHandler.clearInstance()
  })

  after(async () => {
    await resetAnalyticsConfig()
    nock.cleanAll()
  })

  describe("trackCommand", () => {
    it("should return the event with the correct project metadata", async () => {
      scope.post(`/v1/batch`).reply(200)

      analytics = await AnalyticsHandler.init(garden, garden.log)

      const event = analytics.trackCommand("testCommand")

      expect(event).to.eql({
        type: "Run Command",
        properties: {
          name: "testCommand",
          projectId: analytics["projectId"],
          projectName: analytics["projectName"],
          ciName: analytics["ciName"],
          system: analytics["systemConfig"],
          isCI: analytics["isCI"],
          sessionId: "asdf",
          projectMetadata: {
            modulesCount: 3,
            moduleTypes: ["test"],
            tasksCount: 3,
            servicesCount: 3,
            testsCount: 5,
          },
        },
      })
    })
    it("should handle projects with no services, tests, or tasks", async () => {
      scope.post(`/v1/batch`).reply(200)

      garden.setModuleConfigs([
        {
          apiVersion: DEFAULT_API_VERSION,
          name: "module-a",
          type: "test",
          allowPublish: false,
          build: { dependencies: [] },
          disabled: false,
          path: "",
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: {}, // <-------
        },
      ])
      analytics = await AnalyticsHandler.init(garden, garden.log)

      const event = analytics.trackCommand("testCommand")

      expect(event).to.eql({
        type: "Run Command",
        properties: {
          name: "testCommand",
          projectId: analytics["projectId"],
          projectName: analytics["projectName"],
          ciName: analytics["ciName"],
          system: analytics["systemConfig"],
          isCI: analytics["isCI"],
          sessionId: "asdf",
          projectMetadata: {
            modulesCount: 1,
            moduleTypes: ["test"],
            tasksCount: 0,
            servicesCount: 0,
            testsCount: 0,
          },
        },
      })
    })
  })

  // NOTE: Segement always flushes on the first event, then queues and flushes subsequent events.
  // That's why there are usually two mock requests per test below.
  describe("flush", () => {
    const getEvents = (body: any) =>
      body.batch.map((event: any) => ({
        event: event.event,
        type: event.type,
        name: event.properties.name,
      }))

    context("firstRun=false", () => {
      it("should track events", async () => {
        scope
          .post(`/v1/batch`, (body) => {
            // Assert that the event batch contains a single "track" event
            return isEqual(getEvents(body), [
              {
                event: "Run Command",
                type: "track",
                name: "test-command-A",
              },
            ])
          })
          .reply(200)
          .post(`/v1/batch`, (body) => {
            // Assert that the event batch contains the rest of the "track" events
            return isEqual(getEvents(body), [
              {
                event: "Run Command",
                type: "track",
                name: "test-command-B",
              },
              {
                event: "Run Command",
                type: "track",
                name: "test-command-C",
              },
            ])
          })
          .reply(200)

        await garden.globalConfigStore.set(["analytics", "firstRun"], false)
        analytics = await AnalyticsHandler.init(garden, garden.log)

        analytics.trackCommand("test-command-A")
        analytics.trackCommand("test-command-B")
        analytics.trackCommand("test-command-C")
        await analytics.flush()

        expect(scope.done()).to.not.throw
      })
    })
    context("firstRun=true", () => {
      it("should identify user", async () => {
        scope
          .post(`/v1/batch`, (body) => {
            const events = body.batch.map((event) => event.type)
            // Assert that the event batch contains a single "identify" event
            return isEqual(events, ["identify"])
          })
          .reply(200)
          .post(`/v1/batch`, (body) => {
            // Assert that the event batch contains the "track" events
            return isEqual(getEvents(body), [
              {
                event: "Run Command",
                type: "track",
                name: "test-command-A",
              },
              {
                event: "Run Command",
                type: "track",
                name: "test-command-B",
              },
              {
                event: "Run Command",
                type: "track",
                name: "test-command-C",
              },
            ])
          })
          .reply(200)

        await garden.globalConfigStore.set(["analytics", "firstRun"], true)
        analytics = await AnalyticsHandler.init(garden, garden.log)

        analytics.trackCommand("test-command-A")
        analytics.trackCommand("test-command-B")
        analytics.trackCommand("test-command-C")
        await analytics.flush()

        expect(scope.done()).to.not.throw
      })
    })
    it("should wait for pending events on network delays", async () => {
      scope
        .post(`/v1/batch`, (body) => {
          // Assert that the event batch contains a single "track" event
          return isEqual(getEvents(body), [
            {
              event: "Run Command",
              type: "track",
              name: "test-command-A",
            },
          ])
        })
        .delay(1500)
        .reply(200)

      await garden.globalConfigStore.set(["analytics", "firstRun"], false)
      analytics = await AnalyticsHandler.init(garden, garden.log)

      analytics.trackCommand("test-command-A")
      await analytics.flush()

      expect(analytics["pendingEvents"].size).to.eql(0)
      expect(scope.done()).to.not.throw
    })
    it("should eventually timeout waiting for pending events on network delays", async () => {
      scope
        .post(`/v1/batch`, (body) => {
          // Assert that the event batch contains the first "track" event
          return isEqual(getEvents(body), [
            {
              event: "Run Command",
              type: "track",
              name: "test-command-A",
            },
          ])
        })
        .delay(5000)
        .reply(200)
        .post(`/v1/batch`, (body) => {
          // Assert that the event batch contains the rest of the "track" events
          return isEqual(getEvents(body), [
            {
              event: "Run Command",
              type: "track",
              name: "test-command-B",
            },
            {
              event: "Run Command",
              type: "track",
              name: "test-command-C",
            },
          ])
        })
        .reply(200)

      await garden.globalConfigStore.set(["analytics", "firstRun"], false)
      analytics = await AnalyticsHandler.init(garden, garden.log)

      analytics.trackCommand("test-command-A")
      analytics.trackCommand("test-command-B")
      analytics.trackCommand("test-command-C")
      await analytics.flush()

      const pendingEvents = Array.from(analytics["pendingEvents"].values())
      expect(pendingEvents).to.eql([
        {
          event: "Run Command",
          userId: pendingEvents[0].userId,
          properties: {
            name: "test-command-A",
            projectId: analytics["projectId"],
            projectName: analytics["projectName"],
            ciName: analytics["ciName"],
            system: analytics["systemConfig"],
            isCI: analytics["isCI"],
            sessionId: "asdf",
            projectMetadata: {
              modulesCount: 3,
              moduleTypes: ["test"],
              tasksCount: 3,
              servicesCount: 3,
              testsCount: 5,
            },
          },
        },
      ])
      expect(scope.done()).to.not.throw
    })
  })
})
