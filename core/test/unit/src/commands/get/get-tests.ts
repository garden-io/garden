/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { makeTestGarden, withDefaultGlobalOpts, getDataDir } from "../../../../helpers"
import { GetTestsCommand } from "../../../../../src/commands/get/get-tests"
import { expect } from "chai"

describe("GetTestsCommand", () => {
  const projectRoot = getDataDir("test-project-a")

  it("should return all tests in the project", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetTestsCommand()

    const { result } = await command.action({
      garden,
      log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "detail": false, "sort": "name", "include-state": false }),
    })
    expect(result?.actions.length).to.equal(5)
  })

  it("should return only the applicable tests when called with a list of test names", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetTestsCommand()

    const { result } = await command.action({
      garden,
      log,
      args: { names: ["module-a-integration"] },
      opts: withDefaultGlobalOpts({ "detail": false, "sort": "name", "include-state": false }),
    })
    const graph = await garden.getConfigGraph({ log, emit: false })
    const action = graph.getTest("module-a-integration")

    expect(result?.actions.length).to.equal(1)
    expect(result?.actions[0].name).to.equal(action.name)
  })
})
