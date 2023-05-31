/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GetBuildsCommand } from "../../../../../src/commands/get/get-builds"
import { makeTestGarden, withDefaultGlobalOpts, getDataDir } from "../../../../helpers"
import { expect } from "chai"
import { getActionsToSimpleOutput } from "./get-actions"

describe("GetBuildsCommand", () => {
  const projectRoot = getDataDir("test-project-b")

  it("should run without errors when called without arguments", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetBuildsCommand()

    await command.action({
      garden,
      log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "detail": false, "sort": "kind", "include-state": false }),
    })
  })

  it("should run without errors when called with a list of build action names", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetBuildsCommand()

    await command.action({
      garden,
      log,
      args: { names: ["module-b"] },
      opts: withDefaultGlobalOpts({ "detail": false, "sort": "name", "include-state": false }),
    })
  })

  it("should return all build actions in a project", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetBuildsCommand()

    const { result } = await command.action({
      garden,
      log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "detail": false, "sort": "name", "include-state": false }),
    })

    const graph = await garden.getConfigGraph({ log, emit: false })
    const expected = graph.getBuilds().map(getActionsToSimpleOutput)

    expect(command.outputsSchema().validate(result).error).to.be.undefined
    expect(result?.actions).to.eql(expected)
  })
})
