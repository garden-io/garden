/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import td from "testdouble"
import tmp from "tmp-promise"
import { ProjectConfig, defaultNamespace } from "../../../../src/config/project"
import { exec } from "../../../../src/util/util"
import { DEFAULT_API_VERSION } from "../../../../src/constants"
import { TestGarden, withDefaultGlobalOpts, expectError } from "../../../helpers"
const Auth = require("../../../../src/enterprise/auth")
import { LoginCommand } from "../../../../src/commands/login"
import stripAnsi from "strip-ansi"

function makeCommandParams(garden: TestGarden) {
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
  let tmpDir: tmp.DirectoryResult
  let projectConfig: ProjectConfig
  const dummyDomain = "http://dummy-domain.com"

  before(async () => {
    tmpDir = await tmp.dir({ unsafeCleanup: true })
    await exec("git", ["init"], { cwd: tmpDir.path })

    projectConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Project",
      name: "test",
      path: tmpDir.path,
      defaultEnvironment: "default",
      dotIgnoreFiles: [],
      environments: [{ name: "default", defaultNamespace, variables: {} }],
      providers: [{ name: "test" }],
      variables: {},
    }
  })

  beforeEach(async () => {
    td.replace(Auth, "login", async () => "dummy-auth-token")
  })

  after(async () => {
    await tmpDir.cleanup()
  })

  it("should log in if the project has a domain and an id", async () => {
    const config = { ...projectConfig, domain: dummyDomain, id: "dummy-id" }
    const garden = await TestGarden.factory(tmpDir.path, { config })
    const command = new LoginCommand()
    await command.action(makeCommandParams(garden))
  })

  it("should log in if the project has a domain but no id", async () => {
    const config = { ...projectConfig, domain: dummyDomain }
    const garden = await TestGarden.factory(tmpDir.path, { config })
    const command = new LoginCommand()
    await command.action(makeCommandParams(garden))
  })

  it("should throw if the project doesn't have a domain", async () => {
    const garden = await TestGarden.factory(tmpDir.path, { config: projectConfig })
    const command = new LoginCommand()
    await expectError(
      () => command.action(makeCommandParams(garden)),
      (err) => expect(stripAnsi(err.message)).to.match(/Your project configuration does not specify a domain/)
    )
  })
})
