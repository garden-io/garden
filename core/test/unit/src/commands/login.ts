/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import nock from "nock"
import { expect } from "chai"
import td from "testdouble"
import {
  expectError,
  getDataDir,
  makeTempDir,
  makeTestGarden,
  TempDirectory,
  withDefaultGlobalOpts,
} from "../../../helpers"
import { AuthRedirectServer } from "../../../../src/cloud/auth"

import { LoginCommand } from "../../../../src/commands/login"
import { dedent, randomString } from "../../../../src/util/string"
import { CloudApi, CloudApiTokenRefreshError } from "../../../../src/cloud/api"
import { LogLevel } from "../../../../src/logger/logger"
import { DEFAULT_GARDEN_CLOUD_DOMAIN, gardenEnv } from "../../../../src/constants"
import { CloudApiError } from "../../../../src/exceptions"
import { getLogMessages } from "../../../../src/util/testing"
import { GlobalConfigStore } from "../../../../src/config-store/global"
import { makeDummyGarden } from "../../../../src/garden"
import { Garden } from "../../../../src"

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

function makeScope({ domain, withProfileRequest = true }: { domain?: string; withProfileRequest?: boolean }) {
  const scope = nock(domain || "http://example.invalid")

  scope.get("/api/token/verify").reply(200, {
    status: "success",
    data: {
      valid: true,
    },
  })

  if (withProfileRequest) {
    scope.get("/api/profile").reply(200, {
      status: "success",
      data: {
        id: "1",
        createdAt: new Date().toString(),
        updatedAt: new Date().toString(),
        name: "gordon",
        vcsUsername: "gordon@garden.io",
        serviceAccount: false,
        organization: {
          id: "1",
          name: "garden",
        },
        cachedPermissions: {},
        accessTokens: [],
        groups: [],
      },
    })
  }

  return scope
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
    nock.cleanAll()
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
      noEnterprise: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
      globalConfigStore,
    })

    // intercept token verification and profile request
    const scope = makeScope({ domain: garden.cloudDomain })

    // emits an event which the local server expects, this is independent of the network
    // requests scoped by nock
    setTimeout(() => {
      garden.events.emit("receivedToken", testToken)
    }, 500)

    await command.action(loginCommandParams({ garden }))

    const savedToken = await CloudApi.getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain!)
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)
    expect(savedToken!.userId).to.eql("1")
    expect(savedToken!.organizationName).to.eql("garden")

    expect(scope.done()).to.not.throw
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
      noEnterprise: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
      globalConfigStore,
    })

    // intercept token verification and profile request
    const scope = makeScope({ domain: garden.cloudDomain })

    setTimeout(() => {
      garden.events.emit("receivedToken", testToken)
    }, 500)

    await command.action(loginCommandParams({ garden }))

    const savedToken = await CloudApi.getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain!)
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)
    expect(savedToken!.userId).to.eql("1")
    expect(savedToken!.organizationName).to.eql("garden")

    expect(scope.done()).to.not.throw
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
      noEnterprise: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
      globalConfigStore,
    })

    await CloudApi.saveAuthToken({
      log: garden.log,
      globalConfigStore: garden.globalConfigStore,
      tokenResponse: testToken,
      domain: garden.cloudDomain!,
    })
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
      noEnterprise: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
      globalConfigStore,
    })

    // Need to override the default because we're using DummyGarden
    const cloudDomain = "https://example.invalid"
    Object.assign(garden, { cloudDomain })

    // intercept token verification and profile request
    const scope = makeScope({ domain: garden.cloudDomain })

    setTimeout(() => {
      garden.events.emit("receivedToken", testToken)
    }, 500)

    await command.action(loginCommandParams({ garden }))
    const savedToken = await CloudApi.getStoredAuthToken(garden.log, garden.globalConfigStore, cloudDomain)
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)
    expect(savedToken!.userId).to.eql("1")
    expect(savedToken!.organizationName).to.eql("garden")

    expect(scope.done()).to.not.throw
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

    // intercept token verification and profile request
    const scope = makeScope({ domain: garden.cloudDomain })

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
    expect(savedToken!.userId).to.eql("1")
    expect(savedToken!.organizationName).to.eql("garden")

    expect(scope.done()).to.not.throw
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
      noEnterprise: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
      globalConfigStore,
    })

    await CloudApi.saveAuthToken({
      log: garden.log,
      globalConfigStore: garden.globalConfigStore,
      tokenResponse: testToken,
      domain: garden.cloudDomain!,
    })
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
      noEnterprise: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
      globalConfigStore,
    })

    await CloudApi.saveAuthToken({
      log: garden.log,
      globalConfigStore: garden.globalConfigStore,
      tokenResponse: testToken,
      domain: garden.cloudDomain!,
    })
    td.replace(CloudApi.prototype, "checkClientAuthToken", async () => false)
    td.replace(CloudApi.prototype, "refreshToken", async () => {
      throw new CloudApiError({ message: "bummer", responseStatusCode: 401 })
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
      Looks like your session token is invalid. If you were previously logged into a different instance
      of Garden Enterprise, log out first before logging in.
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
      noEnterprise: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
      globalConfigStore,
    })

    // Override the cloud domain so we don't use the default domain
    const savedDomain = gardenEnv.GARDEN_CLOUD_DOMAIN
    const cloudDomain = "https://example.invalid"
    gardenEnv.GARDEN_CLOUD_DOMAIN = cloudDomain

    // Need to override the default because we're using DummyGarden
    Object.assign(garden, { cloudDomain })

    // intercept token verification and profile request
    const scope = makeScope({ domain: garden.cloudDomain })

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

    expect(scope.done()).to.not.throw
  })

  it("should fail to login if the token verification to the cloud api fails", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }
    const command = new LoginCommand()
    const garden = await makeTestGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
      noEnterprise: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
      globalConfigStore,
    })

    // intercept token verification and profile request
    //    const scope = makeScope({ domain: garden.cloudDomain, withProfileRequest: false })
    const scope = nock(garden.cloudDomain || "http://example.invalid")

    scope.get("/api/token/verify").reply(500)

    setTimeout(() => {
      garden.events.emit("receivedToken", testToken)
    }, 500)

    await expectError(
      async () => await command.action(loginCommandParams({ garden })),
      (err) => {
        expect(err.message).to.contain(`Failed verifying user for ${garden.cloudDomain}`)
        expect(err.wrappedErrors).to.have.length(1)
        expect(err.wrappedErrors[0]).to.be.an.instanceof(CloudApiError)
        expect(err.wrappedErrors[0].message).to.contain(`An error occurred while verifying client auth token`)
      }
    )

    const savedToken = await CloudApi.getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain!)
    expect(savedToken).to.not.exist

    expect(scope.done()).to.not.throw
  })

  it("should fail to login if the token refresh fails after a failed verification", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }
    const command = new LoginCommand()
    const garden = await makeTestGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
      noEnterprise: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
      globalConfigStore,
    })

    // intercept token verification and profile request
    //    const scope = makeScope({ domain: garden.cloudDomain, withProfileRequest: false })
    const scope = nock(garden.cloudDomain || "http://example.invalid")

    scope.get("/api/token/verify").reply(401)

    scope.get("/api/token/refresh").reply(401)

    setTimeout(() => {
      garden.events.emit("receivedToken", testToken)
    }, 500)

    await expectError(
      async () => await command.action(loginCommandParams({ garden })),
      (err) => {
        expect(err.message).to.contain(`Failed verifying user for ${garden.cloudDomain}`)
        expect(err.wrappedErrors).to.have.length(1)
        expect(err.wrappedErrors[0]).to.be.an.instanceof(CloudApiTokenRefreshError)
        expect(err.wrappedErrors[0].message).to.contain(`An error occurred while verifying`)
      }
    )

    const savedToken = await CloudApi.getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain!)
    expect(savedToken).to.not.exist

    expect(scope.done()).to.not.throw
  })

  it("should succeed to login even if the profile retrieval fails", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }
    const command = new LoginCommand()
    const garden = await makeTestGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
      noEnterprise: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
      globalConfigStore,
    })

    // intercept token verification and profile request
    //    const scope = makeScope({ domain: garden.cloudDomain, withProfileRequest: false })
    const scope = makeScope({ domain: garden.cloudDomain, withProfileRequest: false })
    scope.get("/api/profile").reply(500)

    setTimeout(() => {
      garden.events.emit("receivedToken", testToken)
    }, 500)

    await command.action(loginCommandParams({ garden }))

    const savedToken = await CloudApi.getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain!)
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)
    expect(savedToken!.userId).to.be.undefined
    expect(savedToken!.organizationName).to.be.undefined

    expect(scope.done()).to.not.throw
  })

  context("GARDEN_AUTH_TOKEN set in env", () => {
    const saveEnv = gardenEnv.GARDEN_AUTH_TOKEN
    before(() => {
      gardenEnv.GARDEN_AUTH_TOKEN = "my-auth-token"
    })

    it("should be a no-op if the user has a valid auth token in the environment", async () => {
      const command = new LoginCommand()
      const garden = await makeTestGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
        noEnterprise: false,
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
        noEnterprise: false,
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
        noEnterprise: false,
        commandInfo: { name: "foo", args: {}, opts: {} },
        globalConfigStore,
      })

      // intercept token verification and profile request
      const scope = makeScope({ domain: garden.cloudDomain })

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

      expect(scope.done()).to.not.throw
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
        noEnterprise: false,
        commandInfo: { name: "foo", args: {}, opts: {} },
        globalConfigStore,
      })

      // intercept token verification and profile request
      const scope = makeScope({ domain: garden.cloudDomain })

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
      expect(scope.done()).to.not.throw
    })

    after(() => {
      gardenEnv.GARDEN_CLOUD_DOMAIN = saveEnv
    })
  })
})
