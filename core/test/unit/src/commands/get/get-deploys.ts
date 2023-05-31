/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { GetDeploysCommand } from "../../../../../src/commands/get/get-deploys"
import { makeTestGarden, withDefaultGlobalOpts, getDataDir } from "../../../../helpers"
import { expect } from "chai"

describe("GetDeploysCommand", () => {
  const projectRoot = getDataDir("test-project-b")

  it("should run without errors when called without arguments", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetDeploysCommand()

    await command.action({
      garden,
      log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "detail": false, "sort": "kind", "include-state": false }),
    })
  })

  it("should run without errors when called with a list of deploy action names", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetDeploysCommand()

    await command.action({
      garden,
      log,
      args: { names: ["service-a"] },
      opts: withDefaultGlobalOpts({ "detail": false, "sort": "name", "include-state": false }),
    })
  })

  it("should return all deploy actions in a project", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetDeploysCommand()

    const { result } = await command.action({
      garden,
      log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "detail": false, "sort": "name", "include-state": false }),
    })

    const graph = await garden.getConfigGraph({ log, emit: false })
    const expected = graph.getDeploys().map((d) => {
      return { name: d.name, kind: d.kind, type: d.type }
    })

    expect(command.outputsSchema().validate(result).error).to.be.undefined
    expect(result?.actions).to.eql(expected)
  })
})
