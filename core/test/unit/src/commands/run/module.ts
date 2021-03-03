/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import td from "testdouble"

import { RunModuleCommand } from "../../../../../src/commands/run/module"
import { Garden } from "../../../../../src/garden"
import { makeTestGardenA, testModuleVersion, testNow, withDefaultGlobalOpts } from "../../../../helpers"
import { omit } from "lodash"

describe("RunModuleCommand", () => {
  // TODO: test optional flags
  let garden
  let log

  beforeEach(async () => {
    td.replace(Garden.prototype, "resolveVersion", async () => testModuleVersion)
    garden = await makeTestGardenA()
    log = garden.log
  })

  it("should run a module without an arguments param", async () => {
    const cmd = new RunModuleCommand()
    const { result } = await cmd.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { module: "module-a", arguments: [] },
      opts: withDefaultGlobalOpts({
        "command": undefined,
        "interactive": false,
        "force-build": false,
      }),
    })

    const expected = {
      aborted: false,
      moduleName: "module-a",
      command: [],
      completedAt: testNow,
      log: "",
      version: testModuleVersion.versionString,
      startedAt: testNow,
      success: true,
    }

    expect(result!.result.durationMsec).to.gte(0)

    expect(omit(result!.result, ["durationMsec"])).to.eql(expected)
  })

  it("should run a module with an arguments param", async () => {
    const cmd = new RunModuleCommand()
    const { result } = await cmd.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { module: "module-a", arguments: ["my", "command"] },
      opts: withDefaultGlobalOpts({
        "command": undefined,
        "interactive": false,
        "force-build": false,
      }),
    })

    const expected = {
      aborted: false,
      moduleName: "module-a",
      command: ["my", "command"],
      completedAt: testNow,
      log: "my command",
      version: testModuleVersion.versionString,
      startedAt: testNow,
      success: true,
    }

    expect(result!.result.durationMsec).to.gte(0)

    expect(omit(result!.result, ["durationMsec"])).to.eql(expected)
  })

  it("should run a module with a command option", async () => {
    const cmd = new RunModuleCommand()
    const { result } = await cmd.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { module: "module-a", arguments: ["my", "command"] },
      opts: withDefaultGlobalOpts({
        "interactive": false,
        "force-build": false,
        "command": "/bin/sh -c",
      }),
    })

    const expected = {
      aborted: false,
      moduleName: "module-a",
      command: ["/bin/sh", "-c", "my", "command"],
      completedAt: testNow,
      log: "/bin/sh -c my command",
      version: testModuleVersion.versionString,
      startedAt: testNow,
      success: true,
    }

    expect(result!.result.durationMsec).to.gte(0)

    expect(omit(result!.result, ["durationMsec"])).to.eql(expected)
  })
})
