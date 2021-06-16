/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import nock from "nock"
import { isEqual } from "lodash"

import { makeTestGardenA, TestGarden, enableAnalytics, getDataDir, makeTestGarden } from "../../../helpers"
import { AnalyticsHandler } from "../../../../src/analytics/analytics"
import { DEFAULT_API_VERSION } from "../../../../src/constants"
import { isCI } from "ci-info"

describe("AnalyticsHandler", () => {
  const host = "https://api.segment.io"
  const scope = nock(host)
  // The sha512 hash of "test-project-a"
  const projectName =
    "95048f63dc14db38ed4138ffb6ff89992abdc19b8c899099c52a94f8fcc0390eec6480385cfa5014f84c0a14d4984825ce3bf25db1386d2b5382b936899df675"
  // The codenamize version + the sha512 hash of "test-project-a"
  const projectNameV2 = "discreet-sudden-struggle_95048f63dc14db38ed4138ffb6ff8999"
  let remoteOriginUrl: string
  let analytics: AnalyticsHandler
  let garden: TestGarden
  let resetAnalyticsConfig: Function

  before(async () => {
    garden = await makeTestGardenA()
    resetAnalyticsConfig = await enableAnalytics(garden)
    // In CI we can make assumptions about the origin URL, otherwise not.
    // We're hard coding it like this so that we can validate that we're actually
    // hashing it properly.
    remoteOriginUrl = isCI ? "git@github.com:garden-io/garden.git" : (await garden.vcs.getOriginName(garden.log))!
  })

  beforeEach(async () => {
    garden = await makeTestGardenA()
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
          projectId: analytics.hash(remoteOriginUrl),
          projectIdV2: analytics.hashV2(remoteOriginUrl),
          projectName,
          projectNameV2,
          enterpriseProjectId: undefined,
          enterpriseProjectIdV2: undefined,
          enterpriseDomain: undefined,
          enterpriseDomainV2: undefined,
          isLoggedIn: false,
          ciName: analytics["ciName"],
          system: analytics["systemConfig"],
          isCI: analytics["isCI"],
          sessionId: analytics["sessionId"],
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
          projectId: analytics.hash(remoteOriginUrl),
          projectIdV2: analytics.hashV2(remoteOriginUrl),
          projectName,
          projectNameV2,
          enterpriseProjectId: undefined,
          enterpriseProjectIdV2: undefined,
          enterpriseDomain: undefined,
          enterpriseDomainV2: undefined,
          isLoggedIn: false,
          ciName: analytics["ciName"],
          system: analytics["systemConfig"],
          isCI: analytics["isCI"],
          sessionId: analytics["sessionId"],
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
    it("should include enterprise metadata", async () => {
      scope.post(`/v1/batch`).reply(200)

      const root = getDataDir("test-projects", "login", "has-domain-and-id")
      garden = await makeTestGarden(root)

      analytics = await AnalyticsHandler.init(garden, garden.log)

      const event = analytics.trackCommand("testCommand")

      expect(event).to.eql({
        type: "Run Command",
        properties: {
          name: "testCommand",
          projectId: analytics.hash(remoteOriginUrl),
          projectIdV2: analytics.hashV2(remoteOriginUrl),
          projectName: analytics.hash("has-domain-and-id"),
          projectNameV2: analytics.hashV2("has-domain-and-id"),
          enterpriseDomain: analytics.hash("http://dummy-domain.com"),
          enterpriseDomainV2: analytics.hashV2("http://dummy-domain.com"),
          enterpriseProjectId: analytics.hash("dummy-id"),
          enterpriseProjectIdV2: analytics.hashV2("dummy-id"),
          isLoggedIn: false,
          ciName: analytics["ciName"],
          system: analytics["systemConfig"],
          isCI: analytics["isCI"],
          sessionId: analytics["sessionId"],
          projectMetadata: {
            modulesCount: 0,
            moduleTypes: [],
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
            projectIdV2: analytics["projectIdV2"],
            projectName: analytics["projectName"],
            projectNameV2: analytics["projectNameV2"],
            enterpriseProjectId: undefined,
            enterpriseProjectIdV2: undefined,
            enterpriseDomain: undefined,
            enterpriseDomainV2: undefined,
            isLoggedIn: false,
            ciName: analytics["ciName"],
            system: analytics["systemConfig"],
            isCI: analytics["isCI"],
            sessionId: analytics["sessionId"],
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
