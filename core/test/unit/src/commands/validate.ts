/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { ValidateCommand, getActionsToResolve } from "../../../../src/commands/validate.js"
import {
  expectError,
  withDefaultGlobalOpts,
  makeTestGardenA,
  makeTestGarden,
  getDataDir,
  type TestGarden,
} from "../../../helpers.js"
import type { ConfigGraph } from "../../../../src/graph/config-graph.js"
import type { Log } from "../../../../src/logger/log-entry.js"

describe("commands.validate", () => {
  it(`should successfully validate a test project`, async () => {
    const garden = await makeTestGardenA()
    const log = garden.log
    const command = new ValidateCommand()

    await command.action({
      garden,
      log,
      args: {},
      opts: withDefaultGlobalOpts({ resolve: undefined }),
    })
  })

  it("should fail validating the bad-project project", async () => {
    const root = getDataDir("validate", "bad-project")

    await expectError(async () => await makeTestGarden(root, { noTempDir: true, noCache: true }), "configuration")
  })

  it("should fail validating the bad-module project", async () => {
    const root = getDataDir("validate", "bad-module")
    const garden = await makeTestGarden(root)
    const log = garden.log
    const command = new ValidateCommand()

    await expectError(
      async () =>
        await command.action({
          garden,
          log,
          args: {},
          opts: withDefaultGlobalOpts({ resolve: undefined }),
        }),
      "configuration"
    )
  })

  it("should fail validating the bad-workflow project", async () => {
    const root = getDataDir("validate", "bad-workflow")
    const garden = await makeTestGarden(root, { noTempDir: true, noCache: true })
    const log = garden.log
    const command = new ValidateCommand()

    await expectError(
      async () =>
        await command.action({
          garden,
          log,
          args: {},
          opts: withDefaultGlobalOpts({ resolve: undefined }),
        }),
      "configuration"
    )
  })

  describe("getActionsToResolve", () => {
    let garden: TestGarden
    let log: Log
    let graph: ConfigGraph
    before(async () => {
      garden = await makeTestGardenA()
      log = garden.log
      graph = await garden.getConfigGraph({ log, emit: false })
    })

    it("should return all actions when no action ref list is specified", async () => {
      expect(getActionsToResolve(undefined, graph).length).to.equal(graph.getActions().length)
    })

    it("should return all actions when an empty list of action refs or a wildcard is specified", async () => {
      expect(getActionsToResolve([], graph).length).to.equal(graph.getActions().length)
      expect(getActionsToResolve(["*"], graph).length).to.equal(graph.getActions().length)
    })

    it("should return the specified actions when a list of refs is specified", async () => {
      const toResolve = getActionsToResolve(["deploy.service-a", "run.task-a"], graph)
      expect(toResolve.map((a) => a.key()).sort()).to.eql(["deploy.service-a", "run.task-a"])
    })
  })
})
