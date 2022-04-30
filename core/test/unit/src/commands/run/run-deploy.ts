/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { RunDeployCommand } from "../../../../../src/commands/run/run-deploy"
import { makeTestGardenA, testNow, withDefaultGlobalOpts, expectError, TestGarden } from "../../../../helpers"
import { expect } from "chai"
import { LogEntry } from "../../../../../src/logger/log-entry"
import stripAnsi from "strip-ansi"
import { omit } from "lodash"
import { ConfigGraph } from "../../../../../src/graph/config-graph"

describe("RunDeployCommand", () => {
  // TODO: test optional flags
  let garden: TestGarden
  let graph: ConfigGraph
  let log: LogEntry
  const cmd = new RunDeployCommand()

  beforeEach(async () => {
    garden = await makeTestGardenA()
    log = garden.log
    graph = await garden.getConfigGraph({ log, emit: false })
  })

  it("should run a service", async () => {
    const { result } = await cmd.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { name: "service-a" },
      opts: withDefaultGlobalOpts({ "force": false, "force-build": false }),
    })

    const expected = {
      aborted: false,
      moduleName: "module-a",
      command: ["service-a"],
      completedAt: testNow,
      log: "service-a",
      version: graph.getModule("module-a").version.versionString,
      startedAt: testNow,
      success: true,
    }

    expect(result!.result.durationMsec).to.gte(0)

    expect(omit(result!.result, ["durationMsec"])).to.eql(expected)
  })

  it("should throw if the service is disabled", async () => {
    await garden.getRawModuleConfigs()
    garden["moduleConfigs"]["module-a"].disabled = true

    await expectError(
      () =>
        cmd.action({
          garden,
          log,
          headerLog: log,
          footerLog: log,
          args: { name: "service-a" },
          opts: withDefaultGlobalOpts({ "force": false, "force-build": false }),
        }),
      (err) =>
        expect(stripAnsi(err.message)).to.equal(
          "Service service-a is disabled for the local environment. If you're sure you want to run it anyway, " +
            "please run the command again with the --force flag."
        )
    )
  })

  it("should allow running a disabled service with --force flag", async () => {
    await garden.scanAndAddConfigs()
    garden["moduleConfigs"]["module-a"].disabled = true

    const { errors } = await cmd.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { name: "service-a" },
      opts: withDefaultGlobalOpts({ "force": true, "force-build": false }),
    })

    expect(errors).to.not.exist
  })
})
