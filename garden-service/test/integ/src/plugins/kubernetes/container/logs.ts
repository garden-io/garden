/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { Garden } from "../../../../../../src/garden"
import { getDataDir, makeTestGarden } from "../../../../../helpers"
import { ConfigGraph } from "../../../../../../src/config-graph"
import { Provider } from "../../../../../../src/config/provider"
import { DeployTask } from "../../../../../../src/tasks/deploy"
import { getServiceLogs } from "../../../../../../src/plugins/kubernetes/container/logs"
import { Stream } from "ts-stream"
import { ServiceLogEntry } from "../../../../../../src/types/plugin/service/getServiceLogs"
import { PluginContext } from "../../../../../../src/plugin-context"

describe("kubernetes", () => {
  describe("getServiceLogs", () => {
    let garden: Garden
    let graph: ConfigGraph
    let provider: Provider
    let ctx: PluginContext

    before(async () => {
      const root = getDataDir("test-projects", "container")
      garden = await makeTestGarden(root)
      graph = await garden.getConfigGraph(garden.log)
      provider = await garden.resolveProvider("local-kubernetes")
      ctx = garden.getPluginContext(provider)
    })

    after(async () => {
      await garden.close()
    })

    it("should write service logs to stream", async () => {
      const module = graph.getModule("simple-service")
      const service = graph.getService("simple-service")

      const entries: ServiceLogEntry[] = []

      const deployTask = new DeployTask({
        force: true,
        forceBuild: true,
        garden,
        graph,
        log: garden.log,
        service,
      })

      await garden.processTasks([deployTask], { throwOnError: true })
      const stream = new Stream<ServiceLogEntry>()

      void stream.forEach((entry) => {
        entries.push(entry)
      })

      await getServiceLogs({
        ctx,
        module,
        service,
        log: garden.log,
        stream,
        follow: false,
        tail: -1,
      })

      expect(entries[0].msg).to.include("Server running...")
    })
  })
})
