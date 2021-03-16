/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import td from "testdouble"
import { withDefaultGlobalOpts, getDataDir, cleanupAuthTokens, getLogMessages } from "../../../helpers"
import { makeDummyGarden } from "../../../../src/cli/cli"
import { Garden } from "../../../../src"
import { ClientAuthToken } from "../../../../src/db/entities/client-auth-token"
import { randomString } from "../../../../src/util/string"
import { EnterpriseApi } from "../../../../src/enterprise/api"
import { LogLevel } from "../../../../src/logger/log-node"
import { LogOutCommand } from "../../../../src/commands/logout"

function makeCommandParams(garden: Garden) {
  const log = garden.log
  return {
    garden,
    log,
    headerLog: log,
    footerLog: log,
    args: {},
    opts: withDefaultGlobalOpts({}),
  }
}

describe("LogoutCommand", () => {
  beforeEach(async () => {
    await cleanupAuthTokens()
  })

  after(async () => {
    await cleanupAuthTokens()
  })

  it("should logout from Garden Enterprise", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }

    const command = new LogOutCommand()
    const garden = await makeDummyGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
      noEnterprise: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
    })

    await EnterpriseApi.saveAuthToken(garden.log, testToken)
    td.replace(EnterpriseApi.prototype, "checkClientAuthToken", async () => true)
    td.replace(EnterpriseApi.prototype, "startInterval", async () => {})
    td.replace(EnterpriseApi.prototype, "post", async () => {})

    // Double check token actually exists
    const savedToken = await ClientAuthToken.findOne()
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)

    await command.action(makeCommandParams(garden))

    const tokenAfterLogout = await ClientAuthToken.findOne()
    const logOutput = getLogMessages(garden.log, (entry) => entry.level === LogLevel.info).join("\n")

    expect(tokenAfterLogout).to.not.exist
    expect(logOutput).to.include("Succesfully logged out from Garden Enterprise.")
  })

  it("should be a no-op if the user is already logged out", async () => {
    const command = new LogOutCommand()
    const garden = await makeDummyGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
      noEnterprise: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
    })

    await command.action(makeCommandParams(garden))

    const logOutput = getLogMessages(garden.log, (entry) => entry.level === LogLevel.info).join("\n")
    expect(logOutput).to.include("You're already logged out from Garden Enterprise.")
  })

  it("should remove token even if Enterprise API can't be initialised", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }

    const command = new LogOutCommand()
    const garden = await makeDummyGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
      noEnterprise: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
    })

    await EnterpriseApi.saveAuthToken(garden.log, testToken)
    // Throw when initializing Enterprise API
    td.replace(EnterpriseApi.prototype, "factory", async () => {
      throw new Error("Not tonight")
    })

    // Double check token actually exists
    const savedToken = await ClientAuthToken.findOne()
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)

    await command.action(makeCommandParams(garden))

    const tokenAfterLogout = await ClientAuthToken.findOne()
    const logOutput = getLogMessages(garden.log, (entry) => entry.level === LogLevel.info).join("\n")

    expect(tokenAfterLogout).to.not.exist
    expect(logOutput).to.include("Succesfully logged out from Garden Enterprise.")
  })

  it("should remove token even if API calls fail", async () => {
    const postfix = randomString()
    const testToken = {
      token: `dummy-token-${postfix}`,
      refreshToken: `dummy-refresh-token-${postfix}`,
      tokenValidity: 60,
    }

    const command = new LogOutCommand()
    const garden = await makeDummyGarden(getDataDir("test-projects", "login", "has-domain-and-id"), {
      noEnterprise: false,
      commandInfo: { name: "foo", args: {}, opts: {} },
    })

    await EnterpriseApi.saveAuthToken(garden.log, testToken)
    // Throw when using Enterprise API to call call logout endpoint
    td.replace(EnterpriseApi.prototype, "post", async () => {
      throw new Error("Not tonight")
    })

    // Double check token actually exists
    const savedToken = await ClientAuthToken.findOne()
    expect(savedToken).to.exist
    expect(savedToken!.token).to.eql(testToken.token)
    expect(savedToken!.refreshToken).to.eql(testToken.refreshToken)

    await command.action(makeCommandParams(garden))

    const tokenAfterLogout = await ClientAuthToken.findOne()
    const logOutput = getLogMessages(garden.log, (entry) => entry.level === LogLevel.info).join("\n")

    expect(tokenAfterLogout).to.not.exist
    expect(logOutput).to.include("Succesfully logged out from Garden Enterprise.")
  })
})
