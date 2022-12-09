/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { RunModuleCommand } from "../../../../../src/commands/run/run-module"
import { makeTestGardenA, TestGarden, withDefaultGlobalOpts } from "../../../../helpers"
import { omit } from "lodash"
import { LogEntry } from "../../../../../src/logger/log-entry"
import { ConfigGraph } from "../../../../../src/graph/config-graph"

describe("RunModuleCommand", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let log: LogEntry

  beforeEach(async () => {
    garden = await makeTestGardenA()
    log = garden.log
    graph = await garden.getConfigGraph({ log, emit: false })
  })

  const omittedKeys = ["durationMsec", "completedAt", "startedAt"]

  it("should run a module without an arguments param", async () => {
    const cmd = new RunModuleCommand()
    const { result } = await cmd.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { name: "module-a", arguments: [] },
      opts: withDefaultGlobalOpts({
        "command": undefined,
        "interactive": false,
        "force-build": false,
      }),
    })

    // The `command` and `moduleName` fields are specific to the exec plugin's "run build" handler
    const expected = {
      aborted: false,
      log: "",
      moduleName: "module-a",
      command: [],
      version: graph.getBuild("module-a").versionString(),
      success: true,
    }

    expect(omit(result!.result, omittedKeys)).to.eql(expected)
  })

  it("should run a module with an arguments param", async () => {
    const cmd = new RunModuleCommand()
    const { result } = await cmd.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { name: "module-a", arguments: ["echo", "my", "command"] },
      opts: withDefaultGlobalOpts({
        "command": undefined,
        "interactive": false,
        "force-build": false,
      }),
    })

    const expected = {
      aborted: false,
      moduleName: "module-a",
      command: ["echo", "my", "command"],
      log: "my command",
      version: graph.getBuild("module-a").versionString(),
      success: true,
    }

    expect(omit(result!.result, omittedKeys)).to.eql(expected)
  })

  it("should run a module with a command option", async () => {
    const cmd = new RunModuleCommand()
    const { result } = await cmd.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { name: "module-a", arguments: ["my", "command"] },
      opts: withDefaultGlobalOpts({
        "interactive": false,
        "force-build": false,
        "command": "echo",
      }),
    })

    const expected = {
      aborted: false,
      moduleName: "module-a",
      command: ["echo", "my", "command"],
      log: "my command",
      version: graph.getBuild("module-a").versionString(),
      success: true,
    }

    expect(omit(result!.result, omittedKeys)).to.eql(expected)
  })
})
