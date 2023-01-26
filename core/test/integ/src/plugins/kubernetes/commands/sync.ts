/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { Garden } from "../../../../../../src/garden"
import { ConfigGraph } from "../../../../../../src/config-graph"
import { getContainerTestGarden } from "../container/container"
import { PluginContext } from "../../../../../../src/plugin-context"
import { KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config"
import { MutagenDaemon } from "../../../../../../src/plugins/kubernetes/mutagen"
import { syncPause, syncResume, syncStatus } from "../../../../../../src/plugins/kubernetes/commands/sync"
import { LogEntry } from "../../../../../../src/logger/log-entry"
import { DeployTask } from "../../../../../../src/tasks/deploy"

describe("sync plugin commands", () => {
  let garden: Garden
  let graph: ConfigGraph
  let provider: KubernetesProvider
  let ctx: PluginContext
  let log: LogEntry

  before(async () => {
    await init("local")
  })

  after(async () => {
    if (garden) {
      await garden.close()
      await MutagenDaemon.clearInstance()
    }
  })

  const init = async (environmentName: string) => {
    garden = await getContainerTestGarden(environmentName)
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    provider = <KubernetesProvider>await garden.resolveProvider(garden.log, "local-kubernetes")
    ctx = await garden.getPluginContext(provider)
    log = garden.log
    const service = graph.getService("dev-mode")

    // The deploy task actually creates the sync
    const deployTask = new DeployTask({
      garden,
      graph,
      log,
      service,
      force: true,
      forceBuild: false,
      devModeServiceNames: [service.name],
      hotReloadServiceNames: [],
      localModeServiceNames: [],
    })

    await garden.processTasks([deployTask], { throwOnError: true })

    await MutagenDaemon.start({ ctx, log })
  }

  describe("sync-status", () => {
    it("should print the Mutagen sync status", async () => {
      const modules = graph.getModules()
      const res = (await syncStatus.handler({ ctx, log, garden, modules, args: [] })) as any

      expect(res.result.syncSessions.length).to.equal(1)
      expect(res.result.syncSessions[0].alpha).to.exist
      expect(res.result.syncSessions[0].beta).to.exist
      expect(res.result.syncSessions[0].status).to.be.a("string")
      expect(res.result.syncSessions[0].paused).to.equal(false)
    })
  })

  describe("sync-pause and sync-resume", () => {
    it("should pause all Mutagen syncs", async () => {
      const modules = graph.getModules()
      await syncPause.handler({ ctx, log, garden, modules, args: [] })
      const pausedStatus = (await syncStatus.handler({ ctx, log, garden, modules, args: [] })) as any

      await syncResume.handler({ ctx, log, garden, modules, args: [] })
      const resumedStatus = (await syncStatus.handler({ ctx, log, garden, modules, args: [] })) as any

      expect(pausedStatus.result.syncSessions[0].paused).to.equal(true)
      expect(resumedStatus.result.syncSessions[0].paused).to.equal(false)
    })
  })
})
