/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import td from "testdouble"
import {
  getDataDir,
  makeCommandParams,
  makeTempDir,
  makeTestGarden,
  TempDirectory,
  TestGardenCli,
} from "../../../helpers"
import { randomString } from "../../../../src/util/string"
import { CloudApi } from "../../../../src/cloud/api"
import { LogLevel } from "../../../../src/logger/logger"
import { LogOutCommand } from "../../../../src/commands/logout"
import { getLogMessages } from "../../../../src/util/testing"
import { DEFAULT_GARDEN_CLOUD_DOMAIN } from "../../../../src/constants"

import { GlobalConfigStore } from "../../../../src/config-store/global"

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
    const cli = new TestGardenCli()
    const garden = await makeTestGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
      noEnterprise: false,
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

    await command.action(makeCommandParams({ cli, garden, args: {}, opts: {} }))

    const tokenAfterLogout = await CloudApi.getStoredAuthToken(
      garden.log,
      garden.globalConfigStore,
      garden.cloudDomain!
    )
    const logOutput = getLogMessages(garden.log, (entry) => entry.level === LogLevel.info).join("\n")

    expect(tokenAfterLogout).to.not.exist
    expect(logOutput).to.include("Succesfully logged out from http://example.invalid.")
  })

  it("should logout from Garden Cloud with default domain", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }

    const command = new LogOutCommand()
    const cli = new TestGardenCli()
    const garden = await makeTestGarden(getDataDir("test-projects", "login", "missing-domain"), {
      noEnterprise: false,
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

    await command.action(makeCommandParams({ cli, garden, args: {}, opts: {} }))

    const tokenAfterLogout = await CloudApi.getStoredAuthToken(
      garden.log,
      garden.globalConfigStore,
      garden.cloudDomain!
    )
    const logOutput = getLogMessages(garden.log, (entry) => entry.level === LogLevel.info).join("\n")

    expect(tokenAfterLogout).to.not.exist
    expect(logOutput).to.include(`Succesfully logged out from ${DEFAULT_GARDEN_CLOUD_DOMAIN}.`)
  })

  it("should be a no-op if the user is already logged out", async () => {
    const command = new LogOutCommand()
    const cli = new TestGardenCli()
    const garden = await makeTestGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
      noEnterprise: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
      globalConfigStore,
    })

    await command.action(makeCommandParams({ cli, garden, args: {}, opts: {} }))

    const logOutput = getLogMessages(garden.log, (entry) => entry.level === LogLevel.info).join("\n")
    expect(logOutput).to.include("You're already logged out from http://example.invalid.")
  })

  it("should remove token even if Enterprise API can't be initialised", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }

    const command = new LogOutCommand()
    const cli = new TestGardenCli()
    const garden = await makeTestGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
      noEnterprise: false,
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

    await command.action(makeCommandParams({ cli, garden, args: {}, opts: {} }))

    const tokenAfterLogout = await CloudApi.getStoredAuthToken(
      garden.log,
      garden.globalConfigStore,
      garden.cloudDomain!
    )
    const logOutput = getLogMessages(garden.log, (entry) => entry.level === LogLevel.info).join("\n")

    expect(tokenAfterLogout).to.not.exist
    expect(logOutput).to.include("Succesfully logged out from http://example.invalid.")
  })

  it("should remove token even if API calls fail", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }

    const command = new LogOutCommand()
    const cli = new TestGardenCli()
    const garden = await makeTestGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
      noEnterprise: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
      globalConfigStore,
    })

    await CloudApi.saveAuthToken(garden.log, garden.globalConfigStore, testToken, garden.cloudDomain!)
    // Throw when using Enterprise API to call call logout endpoint
    td.replace(CloudApi.prototype, "post", async () => {
      throw new Error("Not tonight")
    })

    // Double check token actually exists
    const savedToken = await CloudApi.getStoredAuthToken(garden.log, garden.globalConfigStore, garden.cloudDomain!)
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)

    await command.action(makeCommandParams({ cli, garden, args: {}, opts: {} }))

    const tokenAfterLogout = await CloudApi.getStoredAuthToken(
      garden.log,
      garden.globalConfigStore,
      garden.cloudDomain!
    )
    const logOutput = getLogMessages(garden.log, (entry) => entry.level === LogLevel.info).join("\n")

    expect(tokenAfterLogout).to.not.exist
    expect(logOutput).to.include("Succesfully logged out from http://example.invalid.")
  })
})
