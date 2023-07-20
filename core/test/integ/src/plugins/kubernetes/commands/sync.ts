/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { Garden } from "../../../../../../src/garden"
import { ConfigGraph } from "../../../../../../src/graph/config-graph"
import { Log } from "../../../../../../src/logger/log-entry"
import { getMutagenDataDir, getMutagenMonitor } from "../../../../../../src/mutagen"
import { PluginContext } from "../../../../../../src/plugin-context"
import { syncPause, syncResume, syncStatus } from "../../../../../../src/plugins/kubernetes/commands/sync"
import { KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config"
import { DeployTask } from "../../../../../../src/tasks/deploy"
import { cleanProject } from "../../../../../helpers"
import { getContainerTestGarden } from "../container/container"

describe("sync plugin commands", () => {
  let garden: Garden
  let graph: ConfigGraph
  let provider: KubernetesProvider
  let ctx: PluginContext
  let log: Log

  before(async () => {
    await init("local")
  })

  after(async () => {
    if (garden) {
      garden.close()
      const dataDir = getMutagenDataDir(garden.gardenDirPath, garden.log)
      await getMutagenMonitor({ log, dataDir }).stop()
      await cleanProject(garden.gardenDirPath)
    }
  })

  const init = async (environmentName: string) => {
    // we use noTempDir here because the tests may fail otherwise locally
    // This has something to do with with the project being in a temp directory.
    garden = await getContainerTestGarden(environmentName, { noTempDir: true })
    graph = await garden.getConfigGraph({
      log: garden.log,
      emit: false,
      actionModes: { sync: ["deploy.sync-mode"] },
    })
    provider = <KubernetesProvider>await garden.resolveProvider(garden.log, "local-kubernetes")
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

    await garden.processTasks({ log, tasks: [deployTask], throwOnError: true })
  }

  describe("sync-status", () => {
    it("should print the Mutagen sync status", async () => {
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
      const pausedStatus = (await syncStatus.handler({ ctx, log, garden, graph, args: [] })) as any

      await syncResume.handler({ ctx, log, garden, graph, args: [] })
      const resumedStatus = (await syncStatus.handler({ ctx, log, garden, graph, args: [] })) as any

      expect(pausedStatus.result.syncSessions[0].paused).to.equal(true)
      expect(resumedStatus.result.syncSessions[0].paused).to.equal(false)
    })
  })
})
