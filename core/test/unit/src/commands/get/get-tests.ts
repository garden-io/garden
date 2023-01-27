/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
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

    const res = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({}),
    })

    const graph = await garden.getConfigGraph({ log, emit: false })
    const action = graph.getTest("module-a-integration")

    expect(res.errors).to.be.undefined

    const result = res.result!

    expect(Object.keys(result).length).to.equal(5)
    expect(result["test.module-a-integration"]).to.eql(action.describe())
  })

  it("should return only the applicable tests when called with a list of test names", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetTestsCommand()

    const res = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { names: ["module-a-integration"] },
      opts: withDefaultGlobalOpts({}),
    })

    const graph = await garden.getConfigGraph({ log, emit: false })
    const action = graph.getTest("module-a-integration")

    const result = res.result!

    expect(result).to.eql({
      "test.module-a-integration": action.describe(),
    })
  })
})
