/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { getDataDir, makeTestGarden, withDefaultGlobalOpts } from "../../../../helpers.js"
import { GetGraphCommand } from "../../../../../src/commands/get/get-graph.js"

describe("GetGraphCommand", () => {
  // TODO: Switch to a stable topological sorting algorithm that's more amenable to testing.
  it("should get the project's serialized dependency graph", async () => {
    const garden = await makeTestGarden(getDataDir("test-project-dependants"))
    const log = garden.log
    const command = new GetGraphCommand()

    const res = await command.action({
      garden,
      log,
      args: {},
      opts: withDefaultGlobalOpts({}),
    })

    expect(Object.keys(res.result!).sort()).to.eql(["nodes", "relationships"])
  })
})
