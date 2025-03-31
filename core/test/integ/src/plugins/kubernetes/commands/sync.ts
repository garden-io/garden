/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import type { Garden } from "../../../../../../src/garden.js"
import type { ConfigGraph } from "../../../../../../src/graph/config-graph.js"
import type { Log } from "../../../../../../src/logger/log-entry.js"
import { getMutagenDataDir, getMutagenMonitor } from "../../../../../../src/mutagen.js"
import type { PluginContext } from "../../../../../../src/plugin-context.js"
import { syncPause, syncResume, syncStatus } from "../../../../../../src/plugins/kubernetes/commands/sync.js"
import type { KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config.js"
import { DeployTask } from "../../../../../../src/tasks/deploy.js"
import { cleanProject } from "../../../../../helpers.js"
import { getContainerTestGarden } from "../container/container.js"

describe("sync plugin commands", () => {
  let garden: Garden
  let cleanup: (() => void) | undefined
  let graph: ConfigGraph
  let provider: KubernetesProvider
  let ctx: PluginContext
  let log: Log

  before(async () => {
    await init("local")
  })

  after(async () => {
    if (cleanup) {
      cleanup()
      const dataDir = getMutagenDataDir({ ctx: garden, log: garden.log })
      await getMutagenMonitor({ log, dataDir }).stop()
      await cleanProject(garden.gardenDirPath)
    }
  })

  const init = async (environmentName: string) => {
    // we use noTempDir here because the tests may fail otherwise locally
    // This has something to do with with the project being in a temp directory.
    ;({ garden, cleanup } = await getContainerTestGarden(environmentName, { noTempDir: true }))

    graph = await garden.getConfigGraph({
      log: garden.log,
      emit: false,
      actionModes: { sync: ["deploy.sync-mode"] },
    })
    provider = <KubernetesProvider>await garden.resolveProvider({ log: garden.log, name: "local-kubernetes" })
    ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
    log = garden.log
    const action = graph.getDeploy("sync-mode")

    // The deploy task actually creates the sync
    const deployTask = new DeployTask({
      garden,
      graph,
      log,
      action,
      force: true,
      forceBuild: false,
      startSync: true,
    })

    await garden.processTasks({ tasks: [deployTask], throwOnError: true })
  }

  describe("sync-status", () => {
    it("should print the Mutagen sync status", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = (await syncStatus.handler({ ctx, log, garden, graph, args: [] })) as any

      expect(res.result.syncSessions.length).to.equal(1)
      expect(res.result.syncSessions[0].alpha).to.exist
      expect(res.result.syncSessions[0].beta).to.exist
      expect(res.result.syncSessions[0].status).to.be.a("string")
      expect(res.result.syncSessions[0].paused).to.equal(false)
    })
  })

  describe("sync-pause and sync-resume", () => {
    it("should pause all Mutagen syncs", async () => {
      await syncPause.handler({ ctx, log, garden, graph, args: [] })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pausedStatus = (await syncStatus.handler({ ctx, log, garden, graph, args: [] })) as any

      await syncResume.handler({ ctx, log, garden, graph, args: [] })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resumedStatus = (await syncStatus.handler({ ctx, log, garden, graph, args: [] })) as any

      expect(pausedStatus.result.syncSessions[0].paused).to.equal(true)
      expect(resumedStatus.result.syncSessions[0].paused).to.equal(false)
    })
  })
})
