/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import nock from "nock"
import { expect } from "chai"

import { GardenCli } from "../../../../src/cli/cli"
import { TestGarden, enableAnalytics, makeTestGardenA } from "../../../helpers"
import { Command } from "../../../../src/commands/base"
import { isEqual } from "lodash"
import { TestGardenCli } from "../../../helpers/cli"
import { AnalyticsHandler } from "../../../../src/analytics/analytics"
import { DEFAULT_GARDEN_CLOUD_DOMAIN, gardenEnv } from "../../../../src/constants"
import { CloudApi, CloudUserProfile } from "../../../../src/cloud/api"
import { uuidv4 } from "../../../../src/util/random"
import { getRootLogger } from "../../../../src/logger/logger"
import path from "path"

// TODO: These tests are skipped because they fail repeatedly in CI, but works fine locally
describe("cli analytics", () => {
  let cli: GardenCli

  let garden: TestGarden
  let resetAnalyticsConfig: Function

  before(async () => {
    nock.disableNetConnect()
  })

  after(async () => {
    nock.enableNetConnect()
    nock.cleanAll()
  })

  beforeEach(async () => {
    garden = await makeTestGardenA()
    const configStoreDir = path.dirname(garden.globalConfigStore.getConfigPath())
    // initialize based on the garden project temp dir to avoid using the default global config
    cli = new TestGardenCli({ globalConfigStoreDir: configStoreDir })
    resetAnalyticsConfig = await enableAnalytics(garden)
  })

  afterEach(async () => {
    if (cli.processRecord && cli.processRecord.pid) {
      await garden.globalConfigStore.delete("activeProcesses", String(cli.processRecord.pid))
    }

    await resetAnalyticsConfig()
    // make sure we get a new analytics instance after each run
    AnalyticsHandler.clearInstance()
    nock.cleanAll()
  })

  class TestCommand extends Command {
    name = "test-command"
    help = "hilfe!"
    override noProject = true

    override printHeader() {}

    async action({ args }) {
      return { result: { args } }
    }
  }

  it("should wait for queued analytic events to flush", async () => {
    const scope = nock("https://api.segment.io")

    // Initially there is always an identify
    scope
      .post(`/v1/batch`, (body) => {
        const identify = body.batch.filter((event: any) => event.type === "identify").map((event: any) => event)
        return identify.length === 1
      })
      .reply(200)

    // Each command run result in two events:
    // 'Run Command' and 'Command Result'

    scope
      .post(`/v1/batch`, (body) => {
        const events = body.batch.map((event: any) => ({
          event: event?.event,
          type: event.type,
          name: event.properties?.name,
        }))

        return isEqual(events, [
          {
            event: "Run Command",
            type: "track",
            name: "test-command",
          },
          {
            event: "Command Result",
            type: "track",
            name: "test-command",
          },
        ])
      })
      .reply(200)

    const command = new TestCommand()
    cli.addCommand(command)

    await cli.run({ args: ["test-command"], exitOnError: false, cwd: garden.projectRoot })

    expect(scope.done()).to.not.throw
  })

  it("should not send analytics if disabled for command", async () => {
    const scope = nock("https://api.segment.io")

    scope.post(`/v1/batch`).reply(200)

    const command = new TestCommand()
    command.enableAnalytics = false

    cli.addCommand(command)

    await cli.run({ args: ["test-command"], exitOnError: false, cwd: garden.projectRoot })

    expect(scope.isDone()).to.equal(false)
    expect(scope.pendingMocks().length).to.equal(1)
  })

  it("should include project name when noProject is set", async () => {
    const scope = nock("https://api.segment.io")

    // Each command run result in two events:
    // 'Run Command' and 'Command Result'
    scope
      .post(`/v1/batch`, (body) => {
        const identify = body.batch.filter((event: any) => event.type === "identify").map((event: any) => event)
        return identify.length === 1
      })
      .reply(200)

    scope
      .post(`/v1/batch`, (body) => {
        const events = body.batch.map((event: any) => ({
          event: event.event,
          type: event.type,
          name: event.properties.name,
          projectName: event.properties.projectNameV2,
        }))

        return isEqual(events, [
          {
            event: "Run Command",
            type: "track",
            name: "test-command",
            projectName: AnalyticsHandler.hashV2("test-project-a"),
          },
          {
            event: "Command Result",
            type: "track",
            name: "test-command",
            projectName: AnalyticsHandler.hashV2("test-project-a"),
          },
        ])
      })
      .reply(200)

    const command = new TestCommand()
    cli.addCommand(command)

    await cli.run({ args: ["test-command"], exitOnError: false, cwd: garden.projectRoot })

    expect(scope.done()).to.not.throw
  })

  describe("with logged in user", () => {
    const log = getRootLogger().createLog()
    const domain = DEFAULT_GARDEN_CLOUD_DOMAIN
    const cloudUserId = "user-id"
    const cloudOrganizationName = "organization-name"
    const uniqueCloudUserId = `${cloudOrganizationName}_${cloudUserId}`

    beforeEach(async () => {
      // Save the auth token
      const testToken = {
        token: uuidv4(),
        refreshToken: uuidv4(),
        tokenValidity: 9999,
      }
      const userProfile: CloudUserProfile = {
        userId: cloudUserId,
        organizationName: cloudOrganizationName,
        domain,
      }

      await CloudApi.saveAuthToken({
        log,
        globalConfigStore: garden.globalConfigStore,
        tokenResponse: testToken,
        domain,
        userProfile,
      })
    })

    afterEach(async () => {
      await CloudApi.clearAuthToken(log, garden.globalConfigStore, domain)
    })

    it("should include userId and organization name when noProject is set and the user has previously logged in", async () => {
      const scope = nock("https://api.segment.io")

      // Each command run result in two events:
      // 'Run Command' and 'Command Result'
      scope
        .post(`/v1/batch`, (body) => {
          const identify = body.batch.filter((event: any) => event.type === "identify").map((event: any) => event)
          return identify.length === 1
        })
        .reply(200)

      scope
        .post(`/v1/batch`, (body) => {
          const events = body.batch.map((event: any) => ({
            event: event.event,
            type: event.type,
            name: event.properties.name,
            cloudUserId: event.properties.cloudUserId,
            organizationName: event.properties.organizationName,
            isLoggedIn: event.properties.isLoggedIn,
          }))

          return isEqual(events, [
            {
              event: "Run Command",
              type: "track",
              name: "test-command",
              cloudUserId: uniqueCloudUserId,
              organizationName: cloudOrganizationName,
              isLoggedIn: true,
            },
            {
              event: "Command Result",
              type: "track",
              name: "test-command",
              cloudUserId: uniqueCloudUserId,
              organizationName: cloudOrganizationName,
              isLoggedIn: true,
            },
          ])
        })
        .reply(200)

      const command = new TestCommand()
      cli.addCommand(command)

      await cli.run({ args: ["test-command"], exitOnError: false, cwd: garden.projectRoot })

      expect(scope.done()).to.not.throw
    })
  })

  describe("version check service", () => {
    beforeEach(async () => {
      // the version check service is mocked here so its safe to enable the check in tests
      gardenEnv.GARDEN_DISABLE_VERSION_CHECK = false
    })

    afterEach(async () => {
      gardenEnv.GARDEN_DISABLE_VERSION_CHECK = true
    })

    it("should access the version check service", async () => {
      const scope = nock("https://get.garden.io")
      scope.get("/version").query(true).reply(200)

      const command = new TestCommand()
      cli.addCommand(command)

      await cli.run({ args: ["test-command"], exitOnError: false, cwd: garden.projectRoot })

      expect(scope.done()).to.not.throw
    })
  })
})
