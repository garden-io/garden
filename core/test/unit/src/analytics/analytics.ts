/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import nock from "nock"
import { isEqual } from "lodash"
import { validate as validateUuid } from "uuid"

import { makeTestGardenA, TestGarden, enableAnalytics, getDataDir, makeTestGarden, freezeTime } from "../../../helpers"
import { FakeCloudApi, apiProjectName, apiRemoteOriginUrl } from "../../../helpers/api"
import { AnalyticsHandler, CommandResultEvent, getAnonymousUserId } from "../../../../src/analytics/analytics"
import {
  DEFAULT_BUILD_TIMEOUT_SEC,
  DEFAULT_GARDEN_CLOUD_DOMAIN,
  GardenApiVersion,
  gardenEnv,
} from "../../../../src/constants"
import { LogLevel, RootLogger } from "../../../../src/logger/logger"
import { AnalyticsGlobalConfig } from "../../../../src/config-store/global"
import { QuietWriter } from "../../../../src/logger/writers/quiet-writer"
import timekeeper from "timekeeper"
import { ConfigurationError, DeploymentError, RuntimeError } from "../../../../src/exceptions"

const host = "https://api.segment.io"
// The codenamize version + the sha512 hash of "test-project-a"
const projectNameV2 = "discreet-sudden-struggle_95048f63dc14db38ed4138ffb6ff8999"

describe("AnalyticsHandler", () => {
  const scope = nock(host)

  const time = new Date()
  const basicConfig: AnalyticsGlobalConfig = {
    anonymousUserId: "6d87dd61-0feb-4373-8c78-41cd010907e7",
    firstRunAt: time,
    latestRunAt: time,
    optedOut: false,
    cloudProfileEnabled: false,
  }

  let analytics: AnalyticsHandler
  let garden: TestGarden
  let resetAnalyticsConfig: Function
  const ciInfo = {
    isCi: false,
    ciName: null,
  }

  before(async () => {
    garden = await makeTestGardenA()
    resetAnalyticsConfig = await enableAnalytics(garden)
  })

  after(async () => {
    await resetAnalyticsConfig()
    nock.cleanAll()
  })

  describe("factory", () => {
    beforeEach(async () => {
      garden = await makeTestGardenA()
      garden.vcsInfo.originUrl = apiRemoteOriginUrl
      await enableAnalytics(garden)
    })

    afterEach(async () => {
      // Flush so queued events don't leak between tests
      await analytics.flush()
      AnalyticsHandler.clearInstance()
    })

    it("should initialize the analytics config if missing", async () => {
      await garden.globalConfigStore.set("analytics", {})
      const currentConfig = await garden.globalConfigStore.get("analytics")

      //  Verify that it was deleted
      expect(currentConfig).to.eql({})

      const now = freezeTime()
      analytics = await AnalyticsHandler.factory({ garden, log: garden.log, ciInfo })

      const newConfig = await garden.globalConfigStore.get("analytics")
      expect(newConfig.anonymousUserId).to.be.a("string")
      expect(newConfig).to.eql({
        anonymousUserId: newConfig.anonymousUserId,
        firstRunAt: now,
        latestRunAt: now,
        cloudProfileEnabled: false,
      })
    })
    it("should create a valid anonymous user ID on first run", async () => {
      await garden.globalConfigStore.set("analytics", {})
      analytics = await AnalyticsHandler.factory({ garden, log: garden.log, ciInfo })

      const config = await garden.globalConfigStore.get("analytics")

      expect(validateUuid(config.anonymousUserId!)).to.eql(true)
    })
    it("should set user ID to ci-user if in CI", async () => {
      await garden.globalConfigStore.set("analytics", {})
      analytics = await AnalyticsHandler.factory({ garden, log: garden.log, ciInfo: { isCi: true, ciName: "foo" } })

      const config = await garden.globalConfigStore.get("analytics")

      expect(config.anonymousUserId!).to.eql("ci-user")
    })
    it("should not override anonymous user ID on subsequent runs", async () => {
      await garden.globalConfigStore.set("analytics", basicConfig)
      analytics = await AnalyticsHandler.factory({ garden, log: garden.log, ciInfo })

      const config = await garden.globalConfigStore.get("analytics")
      expect(config.anonymousUserId).to.eql(basicConfig.anonymousUserId)
    })
    it("should update the analytics config if it already exists", async () => {
      await garden.globalConfigStore.set("analytics", basicConfig)
      const now = freezeTime()
      analytics = await AnalyticsHandler.factory({ garden, log: garden.log, ciInfo })

      const config = await garden.globalConfigStore.get("analytics")
      expect(config).to.eql({
        anonymousUserId: basicConfig.anonymousUserId,
        firstRunAt: basicConfig.firstRunAt,
        latestRunAt: now,
        cloudProfileEnabled: false,
        optedOut: false,
      })
    })
    it("should print an info message if first Garden run", async () => {
      await garden.globalConfigStore.set("analytics", {})
      analytics = await AnalyticsHandler.factory({ garden, log: garden.log, ciInfo })
      const msgs = garden.log.root.getLogEntries().map((l) => l.msg)
      const infoMsg = msgs.find((msg) => msg?.includes("Thanks for installing Garden!"))

      expect(infoMsg).to.exist
    })
    it("should NOT print an info message on subsequent runs", async () => {
      // The existens of base config suggests it's not the first run
      await garden.globalConfigStore.set("analytics", basicConfig)
      analytics = await AnalyticsHandler.factory({ garden, log: garden.log, ciInfo })
      const msgs = garden.log.root.getLogEntries().map((l) => l.msg)
      const infoMsg = msgs.find((msg) => msg?.includes("Thanks for installing Garden!"))

      expect(infoMsg).not.to.exist
    })
    it("should identify the user with an anonymous ID", async () => {
      let payload: any
      scope
        .post(`/v1/batch`, (body) => {
          const events = body.batch.map((event: any) => event.type)
          payload = body.batch
          return isEqual(events, ["identify"])
        })
        .reply(200)

      const now = freezeTime()
      await garden.globalConfigStore.set("analytics", basicConfig)
      analytics = await AnalyticsHandler.factory({ garden, log: garden.log, ciInfo })

      await analytics.flush()

      expect(analytics.isEnabled).to.equal(true)
      expect(scope.isDone()).to.equal(true)
      // This is the important part
      expect(payload.userId).to.be.undefined
      expect(payload[0].traits.platform).to.be.a("string")
      expect(payload[0].traits.platformVersion).to.be.a("string")
      expect(payload[0].traits.gardenVersion).to.be.a("string")
      expect(payload).to.eql([
        {
          anonymousId: "6d87dd61-0feb-4373-8c78-41cd010907e7",
          traits: {
            userIdV2: AnalyticsHandler.hashV2("6d87dd61-0feb-4373-8c78-41cd010907e7"),
            platform: payload[0].traits.platform,
            platformVersion: payload[0].traits.platformVersion,
            gardenVersion: payload[0].traits.gardenVersion,
            isCI: payload[0].traits.isCI,
            // While the internal representation in objects is a Date object, API returns strings
            firstRunAt: basicConfig.firstRunAt?.toISOString(),
            latestRunAt: now.toISOString(),
            isRecurringUser: false,
          },
          type: "identify",
          context: payload[0].context,
          _metadata: payload[0]._metadata,
          timestamp: payload[0].timestamp,
          messageId: payload[0].messageId,
        },
      ])
    })
    it("should not identify the user if analytics is disabled", async () => {
      let payload: any
      scope
        .post(`/v1/batch`, (body) => {
          const events = body.batch.map((event: any) => event.type)
          payload = body.batch
          return isEqual(events, ["identify"])
        })
        .reply(200)

      await garden.globalConfigStore.set("analytics", {
        ...basicConfig,
        optedOut: true,
      })
      analytics = await AnalyticsHandler.factory({ garden, log: garden.log, ciInfo })
      await analytics.flush()

      expect(analytics.isEnabled).to.equal(false)
      expect(scope.isDone()).to.equal(false)
      expect(payload).to.be.undefined
    })
    it("should be enabled by default", async () => {
      await garden.globalConfigStore.set("analytics", basicConfig)
      analytics = await AnalyticsHandler.factory({ garden, log: garden.log, ciInfo })

      expect(analytics.isEnabled).to.be.true
    })
    it("should be disabled if env var for disabling analytics is set", async () => {
      const originalEnvVar = gardenEnv.GARDEN_DISABLE_ANALYTICS
      gardenEnv.GARDEN_DISABLE_ANALYTICS = true
      await garden.globalConfigStore.set("analytics", basicConfig)
      analytics = await AnalyticsHandler.factory({ garden, log: garden.log, ciInfo })

      gardenEnv.GARDEN_DISABLE_ANALYTICS = originalEnvVar

      expect(analytics.isEnabled).to.be.false
    })
    it("should be disabled if user opted out", async () => {
      await garden.globalConfigStore.set("analytics", {
        ...basicConfig,
        optedOut: true,
      })
      analytics = await AnalyticsHandler.factory({ garden, log: garden.log, ciInfo })

      expect(analytics.isEnabled).to.be.false
    })
  })

  describe("factory (user is logged in)", async () => {
    beforeEach(async () => {
      const logger = RootLogger._createInstanceForTests({
        level: LogLevel.info,
        writers: { display: new QuietWriter({ level: LogLevel.info }), file: [] },
        storeEntries: false,
      })
      const cloudApi = await FakeCloudApi.factory({ log: logger.createLog() })
      garden = await makeTestGardenA(undefined, { cloudApi })
      garden.vcsInfo.originUrl = apiRemoteOriginUrl
      await enableAnalytics(garden)
    })

    afterEach(async () => {
      await analytics.flush()
      AnalyticsHandler.clearInstance()
    })

    it("should not replace the anonymous user ID with the Cloud user ID", async () => {
      await garden.globalConfigStore.set("analytics", basicConfig)

      const now = freezeTime()
      analytics = await AnalyticsHandler.factory({ garden, log: garden.log, ciInfo })

      const newConfig = await garden.globalConfigStore.get("analytics")
      expect(newConfig).to.eql({
        anonymousUserId: "6d87dd61-0feb-4373-8c78-41cd010907e7",
        firstRunAt: basicConfig.firstRunAt,
        latestRunAt: now,
        optedOut: false,
        cloudProfileEnabled: true,
      })
    })
    it("should be enabled unless env var for disabling is set", async () => {
      await garden.globalConfigStore.set("analytics", basicConfig)
      analytics = await AnalyticsHandler.factory({ garden, log: garden.log, ciInfo })
      const isEnabledWhenNoEnvVar = analytics.isEnabled

      const originalEnvVar = gardenEnv.GARDEN_DISABLE_ANALYTICS
      gardenEnv.GARDEN_DISABLE_ANALYTICS = true
      // Create a fresh instance after setting env var
      AnalyticsHandler.clearInstance()
      analytics = await AnalyticsHandler.factory({ garden, log: garden.log, ciInfo })
      const isEnabledWhenEnvVar = analytics.isEnabled

      gardenEnv.GARDEN_DISABLE_ANALYTICS = originalEnvVar

      expect(isEnabledWhenNoEnvVar).to.eql(true)
      expect(isEnabledWhenEnvVar).to.eql(false)
    })
    it("should identify the user with a Cloud ID", async () => {
      let payload: any
      scope
        .post(`/v1/batch`, (body) => {
          const events = body.batch.map((event: any) => event.type)
          payload = body.batch
          return isEqual(events, ["identify"])
        })
        .reply(200)

      const now = freezeTime()
      await garden.globalConfigStore.set("analytics", basicConfig)
      analytics = await AnalyticsHandler.factory({ garden, log: garden.log, ciInfo })

      await analytics.flush()

      expect(analytics.isEnabled).to.equal(true)
      expect(scope.isDone()).to.equal(true)
      expect(payload).to.eql([
        {
          userId: "garden_1", // This is the imporant part
          anonymousId: "6d87dd61-0feb-4373-8c78-41cd010907e7",
          traits: {
            userIdV2: AnalyticsHandler.hashV2("6d87dd61-0feb-4373-8c78-41cd010907e7"),
            customer: "garden",
            platform: payload[0].traits.platform,
            platformVersion: payload[0].traits.platformVersion,
            gardenVersion: payload[0].traits.gardenVersion,
            isCI: payload[0].traits.isCI,
            // While the internal representation in objects is a Date object, API returns strings
            firstRunAt: basicConfig.firstRunAt?.toISOString(),
            latestRunAt: now.toISOString(),
            isRecurringUser: false,
          },
          type: "identify",
          context: payload[0].context,
          _metadata: payload[0]._metadata,
          timestamp: payload[0].timestamp,
          messageId: payload[0].messageId,
        },
      ])
    })
    it("should not identify the user if analytics is disabled via env var", async () => {
      let payload: any
      scope
        .post(`/v1/batch`, (body) => {
          const events = body.batch.map((event: any) => event.type)
          payload = body.batch
          return isEqual(events, ["identify"])
        })
        .reply(200)

      const originalEnvVar = gardenEnv.GARDEN_DISABLE_ANALYTICS
      gardenEnv.GARDEN_DISABLE_ANALYTICS = true
      await garden.globalConfigStore.set("analytics", basicConfig)
      analytics = await AnalyticsHandler.factory({ garden, log: garden.log, ciInfo })
      gardenEnv.GARDEN_DISABLE_ANALYTICS = originalEnvVar
      await analytics.flush()

      expect(analytics.isEnabled).to.equal(false)
      expect(scope.isDone()).to.equal(false)
      expect(payload).to.be.undefined
    })
  })

  describe("trackCommand", () => {
    beforeEach(async () => {
      garden = await makeTestGardenA()
      garden.vcsInfo.originUrl = apiRemoteOriginUrl
      await enableAnalytics(garden)
    })

    afterEach(async () => {
      // Flush so queued events don't leak between tests
      await analytics.flush()
      AnalyticsHandler.clearInstance()
    })

    it("should return the event with the correct project metadata", async () => {
      scope.post(`/v1/batch`).reply(200)

      await garden.globalConfigStore.set("analytics", basicConfig)
      const now = freezeTime()
      analytics = await AnalyticsHandler.factory({ garden, log: garden.log, ciInfo })
      const event = analytics.trackCommand("testCommand")

      expect(event).to.eql({
        type: "Run Command",
        properties: {
          name: "testCommand",
          projectId: AnalyticsHandler.hash(apiRemoteOriginUrl),
          projectIdV2: AnalyticsHandler.hashV2(apiRemoteOriginUrl),
          projectName: apiProjectName,
          projectNameV2,
          enterpriseProjectId: undefined,
          enterpriseProjectIdV2: undefined,
          enterpriseDomain: AnalyticsHandler.hash(DEFAULT_GARDEN_CLOUD_DOMAIN),
          enterpriseDomainV2: AnalyticsHandler.hashV2(DEFAULT_GARDEN_CLOUD_DOMAIN),
          isLoggedIn: false,
          customer: undefined,
          ciName: analytics["ciName"],
          system: analytics["systemConfig"],
          isCI: analytics["isCI"],
          sessionId: analytics["sessionId"],
          parentSessionId: analytics["sessionId"],
          firstRunAt: basicConfig.firstRunAt,
          latestRunAt: now,
          isRecurringUser: false,
          projectMetadata: {
            modulesCount: 3,
            moduleTypes: ["test"],
            tasksCount: 4,
            servicesCount: 3,
            testsCount: 5,
            actionsCount: 0,
            buildActionCount: 0,
            testActionCount: 0,
            deployActionCount: 0,
            runActionCount: 0,
          },
        },
      })
    })
    it("should set the CI info if applicable", async () => {
      scope.post(`/v1/batch`).reply(200)

      await garden.globalConfigStore.set("analytics", basicConfig)
      const now = freezeTime()
      analytics = await AnalyticsHandler.factory({ garden, log: garden.log, ciInfo: { isCi: true, ciName: "foo" } })
      const event = analytics.trackCommand("testCommand")

      expect(event).to.eql({
        type: "Run Command",
        properties: {
          name: "testCommand",
          projectId: AnalyticsHandler.hash(apiRemoteOriginUrl),
          projectIdV2: AnalyticsHandler.hashV2(apiRemoteOriginUrl),
          projectName: apiProjectName,
          projectNameV2,
          enterpriseProjectId: undefined,
          enterpriseProjectIdV2: undefined,
          enterpriseDomain: AnalyticsHandler.hash(DEFAULT_GARDEN_CLOUD_DOMAIN),
          enterpriseDomainV2: AnalyticsHandler.hashV2(DEFAULT_GARDEN_CLOUD_DOMAIN),
          isLoggedIn: false,
          customer: undefined,
          system: analytics["systemConfig"],
          isCI: true,
          ciName: "foo",
          sessionId: analytics["sessionId"],
          parentSessionId: analytics["sessionId"],
          firstRunAt: basicConfig.firstRunAt,
          latestRunAt: now,
          isRecurringUser: false,
          projectMetadata: {
            modulesCount: 3,
            moduleTypes: ["test"],
            tasksCount: 4,
            servicesCount: 3,
            testsCount: 5,
            actionsCount: 0,
            buildActionCount: 0,
            testActionCount: 0,
            deployActionCount: 0,
            runActionCount: 0,
          },
        },
      })
    })
    it("should handle projects with no services, tests, or tasks", async () => {
      scope.post(`/v1/batch`).reply(200)

      garden.setModuleConfigs([
        {
          apiVersion: GardenApiVersion.v0,
          name: "module-a",
          type: "test",
          allowPublish: false,
          build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
          disabled: false,
          path: "",
          serviceConfigs: [],
          taskConfigs: [],
          testConfigs: [],
          spec: {}, // <-------
        },
      ])

      await garden.globalConfigStore.set("analytics", basicConfig)
      const now = freezeTime()
      analytics = await AnalyticsHandler.factory({ garden, log: garden.log, ciInfo })

      const event = analytics.trackCommand("testCommand")

      expect(event).to.eql({
        type: "Run Command",
        properties: {
          name: "testCommand",
          projectId: AnalyticsHandler.hash(apiRemoteOriginUrl),
          projectIdV2: AnalyticsHandler.hashV2(apiRemoteOriginUrl),
          projectName: apiProjectName,
          projectNameV2,
          enterpriseProjectId: undefined,
          enterpriseProjectIdV2: undefined,
          enterpriseDomain: AnalyticsHandler.hash(DEFAULT_GARDEN_CLOUD_DOMAIN),
          enterpriseDomainV2: AnalyticsHandler.hashV2(DEFAULT_GARDEN_CLOUD_DOMAIN),
          isLoggedIn: false,
          customer: undefined,
          ciName: analytics["ciName"],
          system: analytics["systemConfig"],
          isCI: analytics["isCI"],
          sessionId: analytics["sessionId"],
          parentSessionId: analytics["sessionId"],
          firstRunAt: basicConfig.firstRunAt,
          latestRunAt: now,
          isRecurringUser: false,
          projectMetadata: {
            modulesCount: 1,
            moduleTypes: ["test"],
            tasksCount: 0,
            servicesCount: 0,
            testsCount: 0,
            actionsCount: 0,
            buildActionCount: 0,
            testActionCount: 0,
            deployActionCount: 0,
            runActionCount: 0,
          },
        },
      })
    })
    it("should include enterprise metadata", async () => {
      scope.post(`/v1/batch`).reply(200)

      const root = getDataDir("test-projects", "login", "has-domain-and-id")
      garden = await makeTestGarden(root)
      garden.vcsInfo.originUrl = apiRemoteOriginUrl

      await garden.globalConfigStore.set("analytics", basicConfig)
      const now = freezeTime()
      analytics = await AnalyticsHandler.factory({ garden, log: garden.log, ciInfo })

      const event = analytics.trackCommand("testCommand")

      expect(event).to.eql({
        type: "Run Command",
        properties: {
          name: "testCommand",
          projectId: AnalyticsHandler.hash(apiRemoteOriginUrl),
          projectIdV2: AnalyticsHandler.hashV2(apiRemoteOriginUrl),
          projectName: AnalyticsHandler.hash("has-domain-and-id"),
          projectNameV2: AnalyticsHandler.hashV2("has-domain-and-id"),
          enterpriseDomain: AnalyticsHandler.hash("https://example.invalid"),
          enterpriseDomainV2: AnalyticsHandler.hashV2("https://example.invalid"),
          enterpriseProjectId: AnalyticsHandler.hash("dummy-id"),
          enterpriseProjectIdV2: AnalyticsHandler.hashV2("dummy-id"),
          isLoggedIn: false,
          customer: undefined,
          ciName: analytics["ciName"],
          system: analytics["systemConfig"],
          isCI: analytics["isCI"],
          sessionId: analytics["sessionId"],
          parentSessionId: analytics["sessionId"],
          firstRunAt: basicConfig.firstRunAt,
          latestRunAt: now,
          isRecurringUser: false,
          projectMetadata: {
            modulesCount: 0,
            moduleTypes: [],
            tasksCount: 0,
            servicesCount: 0,
            testsCount: 0,
            actionsCount: 0,
            buildActionCount: 0,
            testActionCount: 0,
            deployActionCount: 0,
            runActionCount: 0,
          },
        },
      })
    })
    it("should override the parentSessionId", async () => {
      scope.post(`/v1/batch`).reply(200)

      const root = getDataDir("test-projects", "login", "has-domain-and-id")
      garden = await makeTestGarden(root)
      garden.vcsInfo.originUrl = apiRemoteOriginUrl

      await garden.globalConfigStore.set("analytics", basicConfig)
      const now = freezeTime()
      analytics = await AnalyticsHandler.factory({ garden, log: garden.log, ciInfo })

      const event = analytics.trackCommand("testCommand", "test-parent-session")

      expect(event).to.eql({
        type: "Run Command",
        properties: {
          name: "testCommand",
          projectId: AnalyticsHandler.hash(apiRemoteOriginUrl),
          projectIdV2: AnalyticsHandler.hashV2(apiRemoteOriginUrl),
          projectName: AnalyticsHandler.hash("has-domain-and-id"),
          projectNameV2: AnalyticsHandler.hashV2("has-domain-and-id"),
          enterpriseDomain: AnalyticsHandler.hash("https://example.invalid"),
          enterpriseDomainV2: AnalyticsHandler.hashV2("https://example.invalid"),
          enterpriseProjectId: AnalyticsHandler.hash("dummy-id"),
          enterpriseProjectIdV2: AnalyticsHandler.hashV2("dummy-id"),
          isLoggedIn: false,
          customer: undefined,
          ciName: analytics["ciName"],
          system: analytics["systemConfig"],
          isCI: analytics["isCI"],
          sessionId: analytics["sessionId"],
          parentSessionId: "test-parent-session",
          firstRunAt: basicConfig.firstRunAt,
          latestRunAt: now,
          isRecurringUser: false,
          projectMetadata: {
            modulesCount: 0,
            moduleTypes: [],
            tasksCount: 0,
            servicesCount: 0,
            testsCount: 0,
            actionsCount: 0,
            buildActionCount: 0,
            testActionCount: 0,
            deployActionCount: 0,
            runActionCount: 0,
          },
        },
      })
    })
    it("should have counts for action kinds", async () => {
      scope.post(`/v1/batch`).reply(200)

      const root = getDataDir("test-projects", "config-templates")
      garden = await makeTestGarden(root)
      garden.vcsInfo.originUrl = apiRemoteOriginUrl

      await garden.globalConfigStore.set("analytics", basicConfig)
      const now = freezeTime()
      analytics = await AnalyticsHandler.factory({ garden, log: garden.log, ciInfo })

      const event = analytics.trackCommand("testCommand")

      expect(event).to.eql({
        type: "Run Command",
        properties: {
          name: "testCommand",
          projectId: AnalyticsHandler.hash(apiRemoteOriginUrl),
          projectIdV2: AnalyticsHandler.hashV2(apiRemoteOriginUrl),
          projectName: AnalyticsHandler.hash("config-templates"),
          projectNameV2: AnalyticsHandler.hashV2("config-templates"),
          enterpriseDomain: AnalyticsHandler.hash(DEFAULT_GARDEN_CLOUD_DOMAIN),
          enterpriseDomainV2: AnalyticsHandler.hashV2(DEFAULT_GARDEN_CLOUD_DOMAIN),
          enterpriseProjectId: undefined,
          enterpriseProjectIdV2: undefined,
          isLoggedIn: false,
          customer: undefined,
          ciName: analytics["ciName"],
          system: analytics["systemConfig"],
          isCI: analytics["isCI"],
          sessionId: analytics["sessionId"],
          parentSessionId: analytics["sessionId"],
          firstRunAt: basicConfig.firstRunAt,
          latestRunAt: now,
          isRecurringUser: false,
          projectMetadata: {
            modulesCount: 0,
            moduleTypes: [],
            tasksCount: 0,
            servicesCount: 0,
            testsCount: 0,
            actionsCount: 3,
            buildActionCount: 1,
            testActionCount: 1,
            deployActionCount: 1,
            runActionCount: 0,
          },
        },
      })
    })
  })

  describe("trackCommandResult", () => {
    beforeEach(async () => {
      garden = await makeTestGardenA()
      garden.vcsInfo.originUrl = apiRemoteOriginUrl
      await enableAnalytics(garden)
    })

    afterEach(async () => {
      // Flush so queued events don't leak between tests
      await analytics.flush()
      AnalyticsHandler.clearInstance()
    })

    it("should return the event as a success", async () => {
      scope.post(`/v1/batch`).reply(200)

      await garden.globalConfigStore.set("analytics", basicConfig)

      const startTime = new Date()
      timekeeper.freeze(startTime)

      analytics = await AnalyticsHandler.factory({ garden, log: garden.log, ciInfo })

      timekeeper.travel(startTime.getTime() + 60000)
      const event = analytics.trackCommandResult("testCommand", [], startTime, 0)

      expect(event).to.eql({
        type: "Command Result",
        properties: {
          name: "testCommand",
          result: "success",
          exitCode: 0,
          durationMsec: 60000,
          errors: [],
          lastError: undefined,
          projectId: AnalyticsHandler.hash(apiRemoteOriginUrl),
          projectIdV2: AnalyticsHandler.hashV2(apiRemoteOriginUrl),
          projectName: apiProjectName,
          projectNameV2,
          enterpriseProjectId: undefined,
          enterpriseProjectIdV2: undefined,
          enterpriseDomain: AnalyticsHandler.hash(DEFAULT_GARDEN_CLOUD_DOMAIN),
          enterpriseDomainV2: AnalyticsHandler.hashV2(DEFAULT_GARDEN_CLOUD_DOMAIN),
          isLoggedIn: false,
          customer: undefined,
          ciName: analytics["ciName"],
          system: analytics["systemConfig"],
          isCI: analytics["isCI"],
          sessionId: analytics["sessionId"],
          parentSessionId: analytics["sessionId"],
          firstRunAt: basicConfig.firstRunAt,
          latestRunAt: startTime,
          isRecurringUser: false,
          projectMetadata: {
            modulesCount: 3,
            moduleTypes: ["test"],
            tasksCount: 4,
            servicesCount: 3,
            testsCount: 5,
            actionsCount: 0,
            buildActionCount: 0,
            testActionCount: 0,
            deployActionCount: 0,
            runActionCount: 0,
          },
        },
      })
    })
    it("should return the event as a failure with nested error metadata", async () => {
      scope.post(`/v1/batch`).reply(200)

      await garden.globalConfigStore.set("analytics", basicConfig)

      const startTime = new Date()
      timekeeper.freeze(startTime)

      analytics = await AnalyticsHandler.factory({ garden, log: garden.log, ciInfo })

      timekeeper.travel(startTime.getTime() + 60000)

      const errors = [
        new RuntimeError({
          message: "Testing Runtime",
          wrappedErrors: [
            new ConfigurationError({
              message: "Testing Configuration",
              wrappedErrors: [
                new DeploymentError({
                  message: "Testing Deployment",
                }),
              ],
            }),
          ],
        }),
      ]
      errors[0].stack = `Error: Testing Runtime
      at Testing.runtime (/path/to/src/utils/exec.ts:17:13)
      at Test.Runnable.run (/path/to/node_modules/mocha/lib/runnable.js:354:5)
      at processImmediate (node:internal/timers:471:21)`
      errors[0].wrappedErrors![0].stack = `Error: Testing Configuration
      at Testing.configuration (/path/to/src/garden.ts:42:13)
      at Test.Runnable.run (/path/to/node_modules/mocha/lib/runnable.js:354:5)
      at processImmediate (node:internal/timers:471:21)`
      errors[0].wrappedErrors![0].wrappedErrors![0].stack = `Error: Testing Deployment
      at Testing.deployment (/path/to/src/plugins/kubernetes.ts:12:13)
      at Test.Runnable.run (/path/to/node_modules/mocha/lib/runnable.js:354:5)
      at processImmediate (node:internal/timers:471:21)`

      const eventOrFalse = analytics.trackCommandResult("testCommand", errors, startTime, 0)

      expect(eventOrFalse).to.not.eql(false)

      const event = eventOrFalse as CommandResultEvent

      expect(event.properties.result).to.eql("failure")
      expect(event.properties.errors).to.eql(["runtime"])
      expect(event.properties.lastError).to.deep.equal({
        error: {
          errorType: "runtime",
          taskType: undefined,
          code: undefined,
          stackTrace: {
            functionName: "Testing.runtime",
            relativeFileName: "utils/exec.ts",
            lineNumber: 17,
          },
        },
        wrapped: {
          errorType: "configuration",
          taskType: undefined,
          code: undefined,
          stackTrace: {
            functionName: "Testing.configuration",
            relativeFileName: "garden.ts",
            lineNumber: 42,
          },
        },
        leaf: {
          errorType: "deployment",
          taskType: undefined,
          code: undefined,
          stackTrace: {
            functionName: "Testing.deployment",
            relativeFileName: "plugins/kubernetes.ts",
            lineNumber: 12,
          },
        },
      })
    })
    it("should return the event as a failure with multiple errors", async () => {
      scope.post(`/v1/batch`).reply(200)

      await garden.globalConfigStore.set("analytics", basicConfig)

      const startTime = new Date()
      timekeeper.freeze(startTime)

      analytics = await AnalyticsHandler.factory({ garden, log: garden.log, ciInfo })

      timekeeper.travel(startTime.getTime() + 60000)
      const errors = [
        new RuntimeError({
          message: "Testing Runtime",
        }),
        new ConfigurationError({
          message: "Testing Configuration",
        }),
      ]
      errors[0].stack = `Error: Testing Runtime
      at Testing.runtime (/path/to/src/utils/exec.ts:17:13)
      at Test.Runnable.run (/path/to/node_modules/mocha/lib/runnable.js:354:5)
      at processImmediate (node:internal/timers:471:21)`
      errors[1].stack = `Error: Testing Configuration
      at Testing.configuration (/path/to/src/garden.ts:42:13)
      at Test.Runnable.run (/path/to/node_modules/mocha/lib/runnable.js:354:5)
      at processImmediate (node:internal/timers:471:21)`

      const eventOrFalse = analytics.trackCommandResult("testCommand", errors, startTime, 0)

      expect(eventOrFalse).to.not.eql(false)

      const event = eventOrFalse as CommandResultEvent

      expect(event.properties.result).to.eql("failure")
      expect(event.properties.errors).to.eql(["runtime", "configuration"])
      expect(event.properties.lastError).to.deep.equal({
        error: {
          errorType: "configuration",
          taskType: undefined,
          code: undefined,
          stackTrace: {
            functionName: "Testing.configuration",
            relativeFileName: "garden.ts",
            lineNumber: 42,
          },
        },
        leaf: undefined,
        wrapped: undefined,
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

    beforeEach(async () => {
      garden = await makeTestGardenA()
      garden.vcsInfo.originUrl = apiRemoteOriginUrl
      await enableAnalytics(garden)
    })

    afterEach(async () => {
      // Flush so queued events don't leak between tests
      await analytics.flush()
      AnalyticsHandler.clearInstance()
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

      await garden.globalConfigStore.set("analytics", basicConfig)
      analytics = await AnalyticsHandler.factory({ garden, log: garden.log, ciInfo })

      analytics.trackCommand("test-command-A")
      await analytics.flush()

      expect(analytics["pendingEvents"].size).to.eql(0)
      expect(scope.isDone()).to.equal(true)
    })
  })
  describe("getAnonymousUserId", () => {
    it("should create a new valid anonymous user ID if none exists", async () => {
      const anonymousUserId = getAnonymousUserId({ analyticsConfig: undefined, isCi: false })
      expect(validateUuid(anonymousUserId!)).to.eql(true)
    })
    it("should return existing anonymous user ID if set", async () => {
      const anonymousUserId = getAnonymousUserId({ analyticsConfig: basicConfig, isCi: false })
      expect(anonymousUserId).to.eql("6d87dd61-0feb-4373-8c78-41cd010907e7")
    })
    it("should return existing anonymous user ID if set and in CI", async () => {
      const anonymousUserId = getAnonymousUserId({ analyticsConfig: basicConfig, isCi: false })
      expect(anonymousUserId).to.eql("6d87dd61-0feb-4373-8c78-41cd010907e7")
    })
    it("should return 'ci-user' if anonymous user ID is not already set and in CI", async () => {
      const anonymousUserId = getAnonymousUserId({ analyticsConfig: undefined, isCi: true })
      expect(anonymousUserId).to.eql("ci-user")
    })
  })
})
