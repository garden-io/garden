/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Garden } from "../../../../../src/garden"
import { Provider } from "../../../../../src/config/provider"
import { KubernetesConfig } from "../../../../../src/plugins/kubernetes/config"
import { getDataDir, makeTestGarden } from "../../../../helpers"
import { randomString } from "../../../../../src/util/string"
import { expect } from "chai"
import { storeTaskResult, getTaskResult } from "../../../../../src/plugins/kubernetes/task-results"
import { MAX_RUN_RESULT_LOG_LENGTH } from "../../../../../src/plugins/kubernetes/constants"

describe("kubernetes task results", () => {
  let garden: Garden
  let provider: Provider<KubernetesConfig>

  before(async () => {
    const root = getDataDir("test-projects", "container")
    garden = await makeTestGarden(root)
    provider = (await garden.resolveProvider("local-kubernetes")) as Provider<KubernetesConfig>
  })

  after(async () => {
    await garden.close()
  })

  describe("storeTaskResult", () => {
    it("should trim logs when necessary", async () => {
      const ctx = garden.getPluginContext(provider)
      const graph = await garden.getConfigGraph(garden.log)
      const task = await graph.getTask("echo-task")

      const data = randomString(1024 * 1024)

      const trimmed = await storeTaskResult({
        ctx,
        log: garden.log,
        module: task.module,
        taskName: task.name,
        taskVersion: task.module.version,
        result: {
          moduleName: task.module.name,
          taskName: task.name,
          outputs: { log: data },
          log: data,
          startedAt: new Date(),
          completedAt: new Date(),
          command: [],
          version: task.module.version.versionString,
          success: true,
        },
      })

      expect(trimmed.log.length).to.be.lte(MAX_RUN_RESULT_LOG_LENGTH)

      const stored = await getTaskResult({
        ctx,
        log: garden.log,
        module: task.module,
        task,
        taskVersion: task.module.version,
      })

      expect(stored).to.exist
      expect(stored!.log.length).to.equal(trimmed.log.length)

      const outputsLog = stored!.outputs.log as string
      expect(outputsLog.length).to.equal(trimmed.log.length)
    })
  })
})
