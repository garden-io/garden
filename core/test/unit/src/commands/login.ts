/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import td from "testdouble"
import { expectError, getDataDir, cleanupAuthTokens, makeCommandParams, TestGardenCli } from "../../../helpers"
import { AuthRedirectServer } from "../../../../src/cloud/auth"

import { LoginCommand } from "../../../../src/commands/login"
import stripAnsi from "strip-ansi"
import { makeDummyGarden } from "../../../../src/cli/cli"
import { ClientAuthToken } from "../../../../src/db/entities/client-auth-token"
import { dedent, randomString } from "../../../../src/util/string"
import { CloudApi } from "../../../../src/cloud/api"
import { LogLevel } from "../../../../src/logger/logger"
import { gardenEnv } from "../../../../src/constants"
import { EnterpriseApiError } from "../../../../src/exceptions"
import { ensureConnected } from "../../../../src/db/connection"
import { getLogMessages } from "../../../../src/util/testing"

// In the tests below we stub out the auth redirect server but still emit the
// token received event.
describe("LoginCommand", () => {
  beforeEach(async () => {
    await ensureConnected()
    await cleanupAuthTokens()
    td.replace(AuthRedirectServer.prototype, "start", async () => {})
    td.replace(AuthRedirectServer.prototype, "close", async () => {})
  })

  after(async () => {
    await cleanupAuthTokens()
  })

  it("should log in if the project has a domain without an id", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }
    const command = new LoginCommand()
    const cli = new TestGardenCli()
    const garden = await makeDummyGarden(getDataDir("test-projects", "login", "has-domain"), {
      noEnterprise: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
    })

    setTimeout(() => {
      garden.events.emit("receivedToken", testToken)
    }, 500)

    await command.action(makeCommandParams({ cli, garden, args: {}, opts: {} }))

    const savedToken = await ClientAuthToken.findOne()
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)
  })

  it("should log in if the project has a domain and an id", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }
    const command = new LoginCommand()
    const cli = new TestGardenCli()
    const garden = await makeDummyGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
      noEnterprise: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
    })

    setTimeout(() => {
      garden.events.emit("receivedToken", testToken)
    }, 500)

    await command.action(makeCommandParams({ cli, garden, args: {}, opts: {} }))

    const savedToken = await ClientAuthToken.findOne()
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)
  })

  it("should be a no-op if the user is already logged in", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }

    const command = new LoginCommand()
    const cli = new TestGardenCli()
    const garden = await makeDummyGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
      noEnterprise: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
    })

    await CloudApi.saveAuthToken(garden.log, testToken)
    td.replace(CloudApi.prototype, "checkClientAuthToken", async () => true)
    td.replace(CloudApi.prototype, "startInterval", async () => {})

    await command.action(makeCommandParams({ cli, garden, args: {}, opts: {} }))

    const savedToken = await ClientAuthToken.findOne()
    expect(savedToken).to.exist

    const logOutput = getLogMessages(garden.log, (entry) => entry.level === LogLevel.info).join("\n")

    expect(logOutput).to.include("You're already logged in to Garden Enterprise.")
  })

  it("should log in if the project config uses secrets in project variables", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }
    const command = new LoginCommand()
    const cli = new TestGardenCli()

    // NOTE: if we use the garden instance from the TestGardenCli instead of makeDummyGarden
    // it would try to fully resolve the secrets which are not available unless we mock the
    // cloud API instance.
    const garden = await makeDummyGarden(getDataDir("test-projects", "login", "secret-in-project-variables"), {
      noEnterprise: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
    })

    setTimeout(() => {
      garden.events.emit("receivedToken", testToken)
    }, 500)

    await command.action(makeCommandParams({ cli, garden, args: {}, opts: {} }))
    const savedToken = await ClientAuthToken.findOne()
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)
  })

  it("should throw if the project doesn't have a domain", async () => {
    const cli = new TestGardenCli()
    const garden = await makeDummyGarden(getDataDir("test-projects", "login", "missing-domain"), {
      commandInfo: { name: "foo", args: {}, opts: {} },
    })
    const command = new LoginCommand()

    await expectError(
      () => command.action(makeCommandParams({ cli, garden, args: {}, opts: {} })),
      (err) => expect(stripAnsi(err.message)).to.match(/Project config is missing a cloud domain./)
    )
  })

  it("should throw if the user has an invalid auth token", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }

    const command = new LoginCommand()
    const cli = new TestGardenCli()
    const garden = await makeDummyGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
      noEnterprise: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
    })

    await CloudApi.saveAuthToken(garden.log, testToken)
    td.replace(CloudApi.prototype, "checkClientAuthToken", async () => false)
    td.replace(CloudApi.prototype, "refreshToken", async () => {
      throw new Error("bummer")
    })

    const savedToken = await ClientAuthToken.findOne()
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)

    await expectError(
      () => command.action(makeCommandParams({ cli, garden, args: {}, opts: {} })),
      (err) => expect(stripAnsi(err.message)).to.match(/bummer/)
    )
  })

  it("should throw and print a helpful message on 401 errors", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }

    const command = new LoginCommand()
    const cli = new TestGardenCli()
    const garden = await makeDummyGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
      noEnterprise: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
    })

    await CloudApi.saveAuthToken(garden.log, testToken)
    td.replace(CloudApi.prototype, "checkClientAuthToken", async () => false)
    td.replace(CloudApi.prototype, "refreshToken", async () => {
      throw new EnterpriseApiError("bummer", { statusCode: 401 })
    })

    const savedToken = await ClientAuthToken.findOne()
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)

    await expectError(
      () => command.action(makeCommandParams({ cli, garden, args: {}, opts: {} })),
      (err) => expect(stripAnsi(err.message)).to.match(/bummer/)
    )

    const logOutput = getLogMessages(garden.log, (entry) => entry.level <= LogLevel.info).join("\n")

    expect(logOutput).to.include(dedent`
      Looks like your session token is invalid. If you were previously logged into a different instance
      of Garden Enterprise, log out first before logging in.
    `)
  })

  context("GARDEN_AUTH_TOKEN set in env", () => {
    const saveEnv = gardenEnv.GARDEN_AUTH_TOKEN
    before(() => {
      gardenEnv.GARDEN_AUTH_TOKEN = "my-auth-token"
    })

    it("should be a no-op if the user has a valid auth token in the environment", async () => {
      const command = new LoginCommand()
      const cli = new TestGardenCli()
      const garden = await makeDummyGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
        noEnterprise: false,
        commandInfo: { name: "foo", args: {}, opts: {} },
      })

      td.replace(CloudApi.prototype, "checkClientAuthToken", async () => true)

      await command.action(makeCommandParams({ cli, garden, args: {}, opts: {} }))

      const logOutput = getLogMessages(garden.log, (entry) => entry.level === LogLevel.info).join("\n")

      expect(logOutput).to.include("You're already logged in to Garden Enterprise.")
    })

    it("should throw if the user has an invalid auth token in the environment", async () => {
      const command = new LoginCommand()
      const cli = new TestGardenCli()
      const garden = await makeDummyGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
        noEnterprise: false,
        commandInfo: { name: "foo", args: {}, opts: {} },
      })

      td.replace(CloudApi.prototype, "checkClientAuthToken", async () => false)

      await expectError(
        () => command.action(makeCommandParams({ cli, garden, args: {}, opts: {} })),
        (err) =>
          expect(stripAnsi(err.message)).to.match(
            /The provided access token is expired or has been revoked, please create a new one from the Garden Enterprise UI./
          )
      )
    })

    after(() => {
      gardenEnv.GARDEN_AUTH_TOKEN = saveEnv
    })
  })

  context("GARDEN_CLOUD_DOMAIN set in env", () => {
    const saveEnv = gardenEnv.GARDEN_CLOUD_DOMAIN
    before(() => {
      gardenEnv.GARDEN_CLOUD_DOMAIN = "https://gardencloud.example.com"
    })

    it("should log in even if the project config domain is empty", async () => {
      const postfix = randomString()
      const testToken = {
        token: `dummy-token-${postfix}`,
        refreshToken: `dummy-refresh-token-${postfix}`,
        tokenValidity: 60,
      }
      const command = new LoginCommand()
      const cli = new TestGardenCli()
      const garden = await makeDummyGarden(getDataDir("test-projects", "login", "missing-domain"), {
        noEnterprise: false,
        commandInfo: { name: "foo", args: {}, opts: {} },
      })

      setTimeout(() => {
        garden.events.emit("receivedToken", testToken)
      }, 500)

      await command.action(makeCommandParams({ cli, garden, args: {}, opts: {} }))

      const savedToken = await ClientAuthToken.findOne()
      expect(savedToken).to.exist
      expect(savedToken!.token).to.eql(testToken.token)
      expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)
    })

    it("should log in using the domain in GARDEN_CLOUD_DOMAIN", async () => {
      const postfix = randomString()
      const testToken = {
        token: `dummy-token-${postfix}`,
        refreshToken: `dummy-refresh-token-${postfix}`,
        tokenValidity: 60,
      }
      const command = new LoginCommand()
      const cli = new TestGardenCli()
      const garden = await makeDummyGarden(getDataDir("test-projects", "login", "has-domain"), {
        noEnterprise: false,
        commandInfo: { name: "foo", args: {}, opts: {} },
      })

      setTimeout(() => {
        garden.events.emit("receivedToken", testToken)
      }, 500)

      await command.action(makeCommandParams({ cli, garden, args: {}, opts: {} }))

      const savedToken = await ClientAuthToken.findOne()
      expect(savedToken).to.exist
      expect(savedToken!.token).to.eql(testToken.token)
      expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)

      const logOutput = getLogMessages(garden.log, (entry) => entry.level === LogLevel.info).join("\n")

      expect(logOutput).to.include(`Logging in to ${gardenEnv.GARDEN_CLOUD_DOMAIN}`)
    })

    after(() => {
      gardenEnv.GARDEN_CLOUD_DOMAIN = saveEnv
    })
  })
})
