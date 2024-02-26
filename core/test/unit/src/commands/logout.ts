/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import * as td from "testdouble"
import type { TempDirectory } from "../../../helpers.js"
import { getDataDir, makeTempDir, makeTestGarden, withDefaultGlobalOpts } from "../../../helpers.js"
import { randomString } from "../../../../src/util/string.js"
import { CloudApi } from "../../../../src/cloud/api.js"
import { LogLevel } from "../../../../src/logger/logger.js"
import { LogOutCommand } from "../../../../src/commands/logout.js"
import { expectError, getLogMessages } from "../../../../src/util/testing.js"
import { DEFAULT_GARDEN_CLOUD_DOMAIN, gardenEnv } from "../../../../src/constants.js"

import { GlobalConfigStore } from "../../../../src/config-store/global.js"
import type { Garden } from "../../../../src/index.js"
import { makeDummyGarden } from "../../../../src/garden.js"

function logoutCommandParams({ garden, opts = { "disable-project-check": false } }: { garden: Garden; opts?: any }) {
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

describe("LogoutCommand", () => {
  let tmpDir: TempDirectory
  let globalConfigStore: GlobalConfigStore

  beforeEach(async () => {
    tmpDir = await makeTempDir()
    globalConfigStore = new GlobalConfigStore(tmpDir.path)
  })

  afterEach(async () => {
    await tmpDir.cleanup()
  })

  it("should logout from Garden Cloud", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }

    const command = new LogOutCommand()
    const garden = await makeTestGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
      skipCloudConnect: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
      globalConfigStore,
    })

    await CloudApi.saveAuthToken(garden.log, garden.globalConfigStore, testToken, garden.cloudDomain!)
    td.replace(CloudApi.prototype, "checkClientAuthToken", async () => true)
    td.replace(CloudApi.prototype, "startInterval", async () => {})
    td.replace(CloudApi.prototype, "post", async () => {})

    // Double check token actually exists
    const savedToken = await CloudApi.getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain!)
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)

    await command.action(logoutCommandParams({ garden }))

    const tokenAfterLogout = await CloudApi.getStoredAuthToken(
      garden.log,
      garden.globalConfigStore,
      garden.cloudDomain!
    )
    const logOutput = getLogMessages(garden.log, (entry) => entry.level === LogLevel.info).join("\n")

    expect(tokenAfterLogout).to.not.exist
    expect(logOutput).to.include("Successfully logged out from https://example.invalid.")
  })

  it("should logout from Garden Cloud with default domain", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }

    const command = new LogOutCommand()
    const garden = await makeTestGarden(getDataDir("test-projects", "login", "missing-domain"), {
      skipCloudConnect: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
    })

    await CloudApi.saveAuthToken(garden.log, garden.globalConfigStore, testToken, garden.cloudDomain!)
    td.replace(CloudApi.prototype, "checkClientAuthToken", async () => true)
    td.replace(CloudApi.prototype, "startInterval", async () => {})
    td.replace(CloudApi.prototype, "post", async () => {})

    // Double check token actually exists
    const savedToken = await CloudApi.getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain!)
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)

    await command.action(logoutCommandParams({ garden }))

    const tokenAfterLogout = await CloudApi.getStoredAuthToken(
      garden.log,
      garden.globalConfigStore,
      garden.cloudDomain!
    )
    const logOutput = getLogMessages(garden.log, (entry) => entry.level === LogLevel.info).join("\n")

    expect(tokenAfterLogout).to.not.exist
    expect(logOutput).to.include(`Successfully logged out from ${DEFAULT_GARDEN_CLOUD_DOMAIN}.`)
  })

  it("should be a no-op if the user is already logged out", async () => {
    const command = new LogOutCommand()
    const garden = await makeTestGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
      skipCloudConnect: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
      globalConfigStore,
    })

    await command.action(logoutCommandParams({ garden }))

    const logOutput = getLogMessages(garden.log, (entry) => entry.level === LogLevel.info).join("\n")
    expect(logOutput).to.include("You're already logged out from https://example.invalid.")
  })

  it("should remove token even if Enterprise API can't be initialised", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }

    const command = new LogOutCommand()
    const garden = await makeTestGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
      skipCloudConnect: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
      globalConfigStore,
    })

    await CloudApi.saveAuthToken(garden.log, garden.globalConfigStore, testToken, garden.cloudDomain!)
    // Throw when initializing Enterprise API
    td.replace(CloudApi.prototype, "factory", async () => {
      throw new Error("Not tonight")
    })

    // Double check token actually exists
    const savedToken = await CloudApi.getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain!)
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)

    await command.action(logoutCommandParams({ garden }))

    const tokenAfterLogout = await CloudApi.getStoredAuthToken(
      garden.log,
      garden.globalConfigStore,
      garden.cloudDomain!
    )
    const logOutput = getLogMessages(garden.log, (entry) => entry.level === LogLevel.info).join("\n")

    expect(tokenAfterLogout).to.not.exist
    expect(logOutput).to.include("Successfully logged out from https://example.invalid.")
  })

  it("should remove token even if API calls fail", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }

    const command = new LogOutCommand()
    const garden = await makeTestGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
      skipCloudConnect: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
      globalConfigStore,
    })

    await CloudApi.saveAuthToken(garden.log, garden.globalConfigStore, testToken, garden.cloudDomain!)
    // Throw when using Enterprise API to call logout endpoint
    td.replace(CloudApi.prototype, "post", async () => {
      throw new Error("Not tonight")
    })

    // Double check token actually exists
    const savedToken = await CloudApi.getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain!)
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)

    await command.action(logoutCommandParams({ garden }))

    const tokenAfterLogout = await CloudApi.getStoredAuthToken(
      garden.log,
      garden.globalConfigStore,
      garden.cloudDomain!
    )
    const logOutput = getLogMessages(garden.log, (entry) => entry.level === LogLevel.info).join("\n")

    expect(tokenAfterLogout).to.not.exist
    expect(logOutput).to.include("Successfully logged out from https://example.invalid.")
  })

  it("should not logout if outside project root and disable-project-check flag is false", async () => {
    const command = new LogOutCommand()

    // this is a bit of a workaround to run outside of the garden root dir
    const garden = await makeDummyGarden(getDataDir("..", "..", "..", ".."), {
      commandInfo: { name: "foo", args: {}, opts: {} },
    })

    await expectError(
      async () => await command.action(logoutCommandParams({ garden, opts: { "disable-project-check": false } })),
      {
        contains: "Not a project directory",
      }
    )
  })

  it("should logout if outside project root and disable-project-check flag is true", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }

    const command = new LogOutCommand()

    // this is a bit of a workaround to run outside of the garden root dir
    const garden = await makeDummyGarden(getDataDir("..", "..", "..", ".."), {
      skipCloudConnect: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
      globalConfigStore,
    })

    await CloudApi.saveAuthToken(garden.log, garden.globalConfigStore, testToken, garden.cloudDomain!)
    td.replace(CloudApi.prototype, "checkClientAuthToken", async () => true)
    td.replace(CloudApi.prototype, "startInterval", async () => {})
    td.replace(CloudApi.prototype, "post", async () => {})

    // Double check token actually exists
    const savedToken = await CloudApi.getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain!)
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)

    // use the env-var to override the cloud domain
    const cloudDomain = "https://example.invalid"
    const savedDomain = gardenEnv.GARDEN_CLOUD_DOMAIN
    gardenEnv.GARDEN_CLOUD_DOMAIN = cloudDomain

    // Need to override the default cloud domain since we're using DummyGarden
    Object.assign(garden, { cloudDomain })

    await command.action(logoutCommandParams({ garden, opts: { "disable-project-check": true } }))

    gardenEnv.GARDEN_CLOUD_DOMAIN = savedDomain

    const tokenAfterLogout = await CloudApi.getStoredAuthToken(
      garden.log,
      garden.globalConfigStore,
      garden.cloudDomain!
    )
    const logOutput = getLogMessages(garden.log, (entry) => entry.level === LogLevel.info).join("\n")

    expect(tokenAfterLogout).to.not.exist
    expect(logOutput).to.include("Successfully logged out from https://example.invalid.")
  })
})
