/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import td from "testdouble"
import { withDefaultGlobalOpts, expectError, getDataDir } from "../../../helpers"
const Auth = require("../../../../src/enterprise/auth")
import { LoginCommand } from "../../../../src/commands/login"
import stripAnsi from "strip-ansi"
import { makeDummyGarden } from "../../../../src/cli/cli"
import { Garden } from "../../../../src"

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

describe("LoginCommand", () => {
  beforeEach(async () => {
    td.replace(Auth, "login", async () => "dummy-auth-token")
  })

  it("should log in if the project has a domain and an id", async () => {
    const garden = await makeDummyGarden(getDataDir("test-projects", "login", "has-domain-and-id"))
    const command = new LoginCommand()
    await command.action(makeCommandParams(garden))
  })

  it("should log in if the project has a domain but no id", async () => {
    const garden = await makeDummyGarden(getDataDir("test-projects", "login", "has-domain"))
    const command = new LoginCommand()
    await command.action(makeCommandParams(garden))
  })

  it("should throw if the project doesn't have a domain", async () => {
    const garden = await makeDummyGarden(getDataDir("test-projects", "login", "missing-domain"))
    const command = new LoginCommand()
    await expectError(
      () => command.action(makeCommandParams(garden)),
      (err) => expect(stripAnsi(err.message)).to.match(/Your project configuration does not specify a domain/)
    )
  })

  it("should log in if the project config uses secrets in project variables", async () => {
    const garden = await makeDummyGarden(getDataDir("test-projects", "login", "secret-in-project-variables"))
    const command = new LoginCommand()
    await command.action(makeCommandParams(garden))
  })
})
