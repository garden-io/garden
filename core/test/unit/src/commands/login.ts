/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import * as td from "testdouble"
import type { TempDirectory } from "../../../helpers.js"
import { expectError, getDataDir, makeTempDir, makeTestGarden, withDefaultGlobalOpts } from "../../../helpers.js"
import { AuthRedirectServer } from "../../../../src/cloud/auth.js"

import { LoginCommand } from "../../../../src/commands/login.js"
import { dedent, randomString } from "../../../../src/util/string.js"
import { CloudApi, CloudApiTokenRefreshError } from "../../../../src/cloud/api.js"
import { LogLevel } from "../../../../src/logger/logger.js"
import { DEFAULT_GARDEN_CLOUD_DOMAIN, gardenEnv } from "../../../../src/constants.js"
import { getLogMessages } from "../../../../src/util/testing.js"
import { GlobalConfigStore } from "../../../../src/config-store/global.js"
import { makeDummyGarden } from "../../../../src/garden.js"
import type { Garden } from "../../../../src/index.js"

function loginCommandParams({ garden, opts = { "disable-project-check": false } }: { garden: Garden; opts?: any }) {
  const log = garden.log
  return {
    garden,
    log,
    args: {},
    opts: withDefaultGlobalOpts({
      ...opts,
    }),
  }
}

// In the tests below we stub out the auth redirect server but still emit the
// token received event.
describe("LoginCommand", () => {
  let tmpDir: TempDirectory
  let globalConfigStore: GlobalConfigStore

  beforeEach(async () => {
    td.replace(AuthRedirectServer.prototype, "start", async () => {})
    td.replace(AuthRedirectServer.prototype, "close", async () => {})

    tmpDir = await makeTempDir()
    globalConfigStore = new GlobalConfigStore(tmpDir.path)
  })

  afterEach(async () => {
    await tmpDir.cleanup()
  })

  it("should log in if the project has a domain without an id", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }
    const command = new LoginCommand()
    const garden = await makeTestGarden(getDataDir("test-projects", "login", "has-domain"), {
      skipCloudConnect: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
      globalConfigStore,
    })

    setTimeout(() => {
      garden.events.emit("receivedToken", testToken)
    }, 500)

    await command.action(loginCommandParams({ garden }))

    const savedToken = await CloudApi.getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain!)
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
    const garden = await makeTestGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
      skipCloudConnect: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
      globalConfigStore,
    })

    setTimeout(() => {
      garden.events.emit("receivedToken", testToken)
    }, 500)

    await command.action(loginCommandParams({ garden }))

    const savedToken = await CloudApi.getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain!)
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
    const garden = await makeTestGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
      skipCloudConnect: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
      globalConfigStore,
    })

    await CloudApi.saveAuthToken(garden.log, garden.globalConfigStore, testToken, garden.cloudDomain!)
    td.replace(CloudApi.prototype, "checkClientAuthToken", async () => true)
    td.replace(CloudApi.prototype, "startInterval", async () => {})

    await command.action(loginCommandParams({ garden }))

    const savedToken = await CloudApi.getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain!)
    expect(savedToken).to.exist

    const logOutput = getLogMessages(garden.log, (entry) => entry.level === LogLevel.info).join("\n")

    expect(logOutput).to.include("You're already logged in to https://example.invalid.")
  })

  it("should log in if the project config uses secrets in project variables", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }
    const command = new LoginCommand()

    // NOTE: if we don't use makeDummyGarden it would try to fully resolve the
    // secrets which are not available unless we mock the cloud API instance.
    const garden = await makeDummyGarden(getDataDir("test-projects", "login", "secret-in-project-variables"), {
      skipCloudConnect: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
      globalConfigStore,
    })

    // Need to override the default because we're using DummyGarden
    const cloudDomain = "https://example.invalid"
    Object.assign(garden, { cloudDomain })

    setTimeout(() => {
      garden.events.emit("receivedToken", testToken)
    }, 500)

    await command.action(loginCommandParams({ garden }))
    const savedToken = await CloudApi.getStoredAuthToken(garden.log, garden.globalConfigStore, cloudDomain)
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)
  })

  it("should fall back to the default garden cloud domain when none is defined", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }
    const command = new LoginCommand()
    const garden = await makeTestGarden(getDataDir("test-projects", "login", "missing-domain"), {
      commandInfo: { name: "foo", args: {}, opts: {} },
    })

    setTimeout(() => {
      garden.events.emit("receivedToken", testToken)
    }, 500)

    await command.action(loginCommandParams({ garden }))

    const savedToken = await CloudApi.getStoredAuthToken(
      garden.log,
      garden.globalConfigStore,
      DEFAULT_GARDEN_CLOUD_DOMAIN
    )

    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)
  })

  it("should throw if the user has an invalid auth token", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }

    const command = new LoginCommand()
    const garden = await makeTestGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
      skipCloudConnect: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
      globalConfigStore,
    })

    await CloudApi.saveAuthToken(garden.log, garden.globalConfigStore, testToken, garden.cloudDomain!)
    td.replace(CloudApi.prototype, "checkClientAuthToken", async () => false)
    td.replace(CloudApi.prototype, "refreshToken", async () => {
      throw new Error("bummer")
    })

    const savedToken = await CloudApi.getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain!)
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)

    await expectError(async () => await command.action(loginCommandParams({ garden })), {
      contains: "bummer",
    })
  })

  it("should throw and print a helpful message on 401 errors", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }

    const command = new LoginCommand()
    const garden = await makeTestGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
      skipCloudConnect: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
      globalConfigStore,
    })

    await CloudApi.saveAuthToken(garden.log, garden.globalConfigStore, testToken, garden.cloudDomain!)
    td.replace(CloudApi.prototype, "checkClientAuthToken", async () => false)
    td.replace(CloudApi.prototype, "refreshToken", async () => {
      throw new CloudApiTokenRefreshError({ message: "bummer" })
    })

    const savedToken = await CloudApi.getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain!)
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)

    await expectError(async () => await command.action(loginCommandParams({ garden })), {
      contains: "bummer",
    })

    const logOutput = getLogMessages(garden.log, (entry) => entry.level <= LogLevel.info).join("\n")

    expect(logOutput).to.include(dedent`
    Your login token for https://example.invalid has expired and could not be refreshed.
    Try to log out first before logging in.
    `)
  })

  it("should not login if outside project root and disable-project-check flag is false", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }
    const command = new LoginCommand()

    // this is a bit of a workaround to run outside of the garden root dir
    const garden = await makeDummyGarden(getDataDir("..", "..", "..", ".."), {
      commandInfo: { name: "foo", args: {}, opts: {} },
    })

    setTimeout(() => {
      garden.events.emit("receivedToken", testToken)
    }, 500)

    await expectError(
      async () => await command.action(loginCommandParams({ garden, opts: { "disable-project-check": false } })),
      {
        contains: "Not a project directory",
      }
    )
  })

  it("should login if outside project root and disable-project-check flag is true", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }
    const command = new LoginCommand()

    // this is a bit of a workaround to run outside of the garden root dir
    const garden = await makeDummyGarden(getDataDir("..", "..", "..", ".."), {
      skipCloudConnect: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
      globalConfigStore,
    })

    // Override the cloud domain so we don't use the default domain
    const savedDomain = gardenEnv.GARDEN_CLOUD_DOMAIN
    const cloudDomain = "https://example.invalid"
    gardenEnv.GARDEN_CLOUD_DOMAIN = cloudDomain

    // Need to override the default because we're using DummyGarden
    Object.assign(garden, { cloudDomain })

    setTimeout(() => {
      garden.events.emit("receivedToken", testToken)
    }, 500)

    await command.action(loginCommandParams({ garden, opts: { "disable-project-check": true } }))

    const savedToken = await CloudApi.getStoredAuthToken(garden.log, garden.globalConfigStore, cloudDomain)
    // reset the cloud domain
    gardenEnv.GARDEN_CLOUD_DOMAIN = savedDomain

    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)
  })

  context("GARDEN_AUTH_TOKEN set in env", () => {
    const saveEnv = gardenEnv.GARDEN_AUTH_TOKEN
    before(() => {
      gardenEnv.GARDEN_AUTH_TOKEN = "my-auth-token"
    })

    it("should be a no-op if the user has a valid auth token in the environment", async () => {
      const command = new LoginCommand()
      const garden = await makeTestGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
        skipCloudConnect: false,
        commandInfo: { name: "foo", args: {}, opts: {} },
        globalConfigStore,
      })

      td.replace(CloudApi.prototype, "checkClientAuthToken", async () => true)

      await command.action(loginCommandParams({ garden }))

      const logOutput = getLogMessages(garden.log, (entry) => entry.level === LogLevel.info).join("\n")

      expect(logOutput).to.include("You're already logged in to https://example.invalid.")
    })

    it("should throw if the user has an invalid auth token in the environment", async () => {
      const command = new LoginCommand()
      const garden = await makeTestGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
        skipCloudConnect: false,
        commandInfo: { name: "foo", args: {}, opts: {} },
        globalConfigStore,
      })

      td.replace(CloudApi.prototype, "checkClientAuthToken", async () => false)

      await expectError(async () => await command.action(loginCommandParams({ garden })), {
        contains:
          "The provided access token is expired or has been revoked, please create a new one from the Garden Enterprise UI.",
      })
    })

    after(() => {
      gardenEnv.GARDEN_AUTH_TOKEN = saveEnv
    })
  })

  context("GARDEN_CLOUD_DOMAIN set in env", () => {
    const saveEnv = gardenEnv.GARDEN_CLOUD_DOMAIN
    before(() => {
      gardenEnv.GARDEN_CLOUD_DOMAIN = "https://example.invalid"
    })

    it("should log in even if the project config domain is empty", async () => {
      const postfix = randomString()
      const testToken = {
        token: `dummy-token-${postfix}`,
        refreshToken: `dummy-refresh-token-${postfix}`,
        tokenValidity: 60,
      }
      const command = new LoginCommand()
      const garden = await makeTestGarden(getDataDir("test-projects", "login", "missing-domain"), {
        skipCloudConnect: false,
        commandInfo: { name: "foo", args: {}, opts: {} },
        globalConfigStore,
      })

      setTimeout(() => {
        garden.events.emit("receivedToken", testToken)
      }, 500)

      await command.action(loginCommandParams({ garden }))

      const savedToken = await CloudApi.getStoredAuthToken(
        garden.log,
        garden.globalConfigStore,
        gardenEnv.GARDEN_CLOUD_DOMAIN
      )
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
      const garden = await makeTestGarden(getDataDir("test-projects", "login", "has-domain"), {
        skipCloudConnect: false,
        commandInfo: { name: "foo", args: {}, opts: {} },
        globalConfigStore,
      })

      setTimeout(() => {
        garden.events.emit("receivedToken", testToken)
      }, 500)

      await command.action(loginCommandParams({ garden }))

      const savedToken = await CloudApi.getStoredAuthToken(
        garden.log,
        garden.globalConfigStore,
        gardenEnv.GARDEN_CLOUD_DOMAIN
      )
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
