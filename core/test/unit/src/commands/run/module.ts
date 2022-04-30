/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { RunModuleCommand } from "../../../../../src/commands/run/module"
import { makeTestGardenA, TestGarden, testNow, withDefaultGlobalOpts } from "../../../../helpers"
import { omit } from "lodash"
import { LogEntry } from "../../../../../src/logger/log-entry"
import { ConfigGraph } from "../../../../../src/graph/config-graph"

describe("RunModuleCommand", () => {
  // TODO: test optional flags
  let garden: TestGarden
  let graph: ConfigGraph
  let log: LogEntry

  beforeEach(async () => {
    garden = await makeTestGardenA()
    log = garden.log
    graph = await garden.getConfigGraph({ log, emit: false })
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
      version: graph.getModule("module-a").version.versionString,
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
      version: graph.getModule("module-a").version.versionString,
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
      version: graph.getModule("module-a").version.versionString,
      startedAt: testNow,
      success: true,
    }

    expect(result!.result.durationMsec).to.gte(0)

    expect(omit(result!.result, ["durationMsec"])).to.eql(expected)
  })
})
