/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { resolve } from "path"
import { makeTestGarden, dataDir, withDefaultGlobalOpts } from "../../../../helpers"
import { GetRunsCommand } from "../../../../../src/commands/get/get-runs"

describe("GetRunsCommand", () => {
  const projectRoot = resolve(dataDir, "test-project-b")

  it("should run without errors when called without arguments", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetRunsCommand()

    await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({}),
    })
  })

  it("should run without errors when called with a list of task names", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetRunsCommand()

    await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: { names: ["task-a"] },
      opts: withDefaultGlobalOpts({}),
    })
  })
})
