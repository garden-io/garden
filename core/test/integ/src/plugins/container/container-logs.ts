/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expectLogsContain, getRootLogMessages, type TestGarden } from "../../../../../src/util/testing.js"
import { getDataDir, makeTestGarden } from "../../../../helpers.js"
import type { ActionLog } from "../../../../../src/logger/log-entry.js"
import { createActionLog } from "../../../../../src/logger/log-entry.js"
import { gardenPlugin as gardenContainerPlugin } from "../../../../../src/plugins/container/container.js"
import { uuidv4 } from "../../../../../src/util/random.js"

describe("dockerBuildLogs", () => {
  const projectRoot = getDataDir("test-project-container-build-logs")

  let garden: TestGarden
  let log: ActionLog

  before(async () => {
    garden = await makeTestGarden(projectRoot, { plugins: [gardenContainerPlugin()] })
    log = createActionLog({ log: garden.log, action: { name: "simple-build", kind: "Build", uid: uuidv4() } })
  })

  after(() => {
    garden && garden.close()
  })

  it("should output docker build logs in human readable text in log level verbose", async () => {
    const graph = await garden.getConfigGraph({ emit: false, log })
    const build = graph.getBuild("simple-build")
    const resolved = await garden.resolveAction({ action: build, graph, log })
    await garden.executeAction({ action: resolved, graph, log })
    const logMessages = getRootLogMessages(log)
    expectLogsContain(logMessages, "Hello i am a docker build log line")
  })
})
