/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
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
import { GardenCloudApiLegacy } from "../../../../src/cloud/api-legacy/api.js"
import { LogLevel } from "../../../../src/logger/logger.js"
import { LogOutCommand } from "../../../../src/commands/logout.js"
import { expectError, getLogMessages } from "../../../../src/util/testing.js"
import { DEFAULT_GARDEN_CLOUD_DOMAIN } from "../../../../src/constants.js"

import { GlobalConfigStore } from "../../../../src/config-store/global.js"
import type { Garden } from "../../../../src/index.js"
import { makeDummyGarden } from "../../../../src/garden.js"
import { getStoredAuthToken, saveAuthToken } from "../../../../src/cloud/api-legacy/auth.js"
import { uuidv4 } from "../../../../src/util/random.js"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      commandInfo: { name: "foo", args: {}, opts: {}, rawArgs: [], isCustomCommand: true },
      globalConfigStore,
    })

    await saveAuthToken({
      log: garden.log,
      globalConfigStore: garden.globalConfigStore,
      tokenResponse: testToken,
      domain: garden.cloudDomain!,
    })
    td.replace(GardenCloudApiLegacy.prototype, "checkClientAuthToken", async () => true)
    td.replace(GardenCloudApiLegacy.prototype, "startInterval", async () => {})
    td.replace(GardenCloudApiLegacy.prototype, "post", async () => {})

    // Double check token actually exists
    const savedToken = await getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain!)
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)

    await command.action(logoutCommandParams({ garden }))

    const tokenAfterLogout = await getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain!)
    const logOutput = getLogMessages(garden.log, (entry) => entry.level === LogLevel.info).join("\n")

    expect(tokenAfterLogout).to.not.exist
    expect(logOutput).to.include("Successfully logged out from https://example.invalid.")
  })

  // TODO: fix mocks and emulate successful logout
  it.skip("should logout from Garden Cloud with default domain", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }

    const command = new LogOutCommand()
    const garden = await makeTestGarden(getDataDir("test-projects", "login", "missing-domain"), {
      skipCloudConnect: false,
      commandInfo: { name: "foo", args: {}, opts: {}, rawArgs: [], isCustomCommand: true },
    })

    await saveAuthToken({
      log: garden.log,
      globalConfigStore: garden.globalConfigStore,
      tokenResponse: testToken,
      domain: garden.cloudDomain!,
    })
    td.replace(GardenCloudApiLegacy.prototype, "checkClientAuthToken", async () => true)
    td.replace(GardenCloudApiLegacy.prototype, "startInterval", async () => {})
    td.replace(GardenCloudApiLegacy.prototype, "post", async () => {})

    // Double check token actually exists
    const savedToken = await getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain!)
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)

    await command.action(logoutCommandParams({ garden }))

    const tokenAfterLogout = await getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain!)
    const logOutput = getLogMessages(garden.log, (entry) => entry.level === LogLevel.warn).join("\n")

    expect(tokenAfterLogout).to.not.exist
    expect(logOutput).to.include(`Successfully logged out from ${DEFAULT_GARDEN_CLOUD_DOMAIN}.`)
  })

  it("should be a no-op if the user is already logged out", async () => {
    const command = new LogOutCommand()
    const garden = await makeTestGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
      skipCloudConnect: false,
      commandInfo: { name: "foo", args: {}, opts: {}, rawArgs: [], isCustomCommand: true },
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
      commandInfo: { name: "foo", args: {}, opts: {}, rawArgs: [], isCustomCommand: true },
      globalConfigStore,
    })

    await saveAuthToken({
      log: garden.log,
      globalConfigStore: garden.globalConfigStore,
      tokenResponse: testToken,
      domain: garden.cloudDomain!,
    })
    // Throw when initializing Enterprise API
    td.replace(GardenCloudApiLegacy.prototype, "factory", async () => {
      throw new Error("Not tonight")
    })

    // Double check token actually exists
    const savedToken = await getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain!)
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)

    await command.action(logoutCommandParams({ garden }))

    const tokenAfterLogout = await getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain!)
    expect(tokenAfterLogout).to.not.exist

    const logOutput = getLogMessages(garden.log, (entry) => entry.level === LogLevel.warn).join("\n")
    expect(logOutput).to.include(
      "The following issue occurred while logging out from https://example.invalid (your session will be cleared regardless)"
    )
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
      commandInfo: { name: "foo", args: {}, opts: {}, rawArgs: [], isCustomCommand: true },
      globalConfigStore,
    })

    await saveAuthToken({
      log: garden.log,
      globalConfigStore: garden.globalConfigStore,
      tokenResponse: testToken,
      domain: garden.cloudDomain!,
    })
    // Throw when using Enterprise API to call logout endpoint
    td.replace(GardenCloudApiLegacy.prototype, "post", async () => {
      throw new Error("Not tonight")
    })

    // Double check token actually exists
    const savedToken = await getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain!)
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)

    await command.action(logoutCommandParams({ garden }))

    const tokenAfterLogout = await getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain!)
    expect(tokenAfterLogout).to.not.exist

    const logOutput = getLogMessages(garden.log, (entry) => entry.level === LogLevel.warn).join("\n")
    expect(logOutput).to.include(
      "The following issue occurred while logging out from https://example.invalid (your session will be cleared regardless)"
    )
  })

  it("should not logout if outside project root", async () => {
    const command = new LogOutCommand()

    // this is a bit of a workaround to run outside of the garden root dir
    const garden = await makeDummyGarden(getDataDir("..", "..", "..", ".."), {
      commandInfo: { name: "foo", args: {}, opts: {}, rawArgs: [], isCustomCommand: true },
      sessionId: uuidv4(),
      parentSessionId: undefined,
    })

    await expectError(
      async () => await command.action(logoutCommandParams({ garden, opts: { "disable-project-check": false } })),
      {
        contains: "Project config not found",
      }
    )
  })
})
