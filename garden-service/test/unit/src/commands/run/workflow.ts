/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { TestGarden, makeTestGardenA, withDefaultGlobalOpts } from "../../../../helpers"
import { LogEntry } from "../../../../../src/logger/log-entry"
import { DEFAULT_API_VERSION } from "../../../../../src/constants"
import { RunWorkflowCommand } from "../../../../../src/commands/run/workflow"

describe("RunWorkflowCommand", () => {
  const cmd = new RunWorkflowCommand()
  let garden: TestGarden
  let log: LogEntry
  let defaultParams

  before(async () => {
    garden = await makeTestGardenA()
    log = garden.log
    defaultParams = {
      garden,
      log,
      headerLog: log,
      footerLog: log,
      opts: withDefaultGlobalOpts({}),
    }
  })

  it("should run a workflow", async () => {
    garden.setWorkflowConfigs([
      {
        apiVersion: DEFAULT_API_VERSION,
        name: "workflow-a",
        kind: "Workflow",
        path: garden.projectRoot,
        steps: [
          { command: ["deploy"], description: "deploy services" },
          { command: ["get", "outputs"] },
          { command: ["test"] },
          { command: ["run", "test", "module-a", "unit"] },
          { command: ["run", "task", "task-a"] },
          { command: ["delete", "service", "service-a"] },
          { command: ["delete", "environment"] },
          { command: ["publish"] },
        ],
      },
    ])

    await cmd.action({ ...defaultParams, args: { workflow: "workflow-a" } })
  })
})
