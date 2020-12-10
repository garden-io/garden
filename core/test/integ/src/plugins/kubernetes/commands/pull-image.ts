/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { pullModule } from "../../../../../../src/plugins/kubernetes/commands/pull-image"
import { Garden } from "../../../../../../src/garden"
import { ConfigGraph } from "../../../../../../src/config-graph"
import { getContainerTestGarden } from "../container/container"
import { k8sBuildContainer } from "../../../../../../src/plugins/kubernetes/container/build"
import { PluginContext } from "../../../../../../src/plugin-context"
import { KubernetesProvider, KubernetesPluginContext } from "../../../../../../src/plugins/kubernetes/config"
import { GardenModule } from "../../../../../../src/types/module"
import { containerHelpers } from "../../../../../../src/plugins/container/helpers"
import { expect } from "chai"
import { LogEntry } from "../../../../../../src/logger/log-entry"
import { grouped } from "../../../../../helpers"
import { ContainerModule } from "../../../../../../src/plugins/container/config"

describe("pull-image plugin command", () => {
  let garden: Garden
  let graph: ConfigGraph
  let provider: KubernetesProvider
  let ctx: PluginContext

  after(async () => {
    if (garden) {
      await garden.close()
    }
  })

  const init = async (environmentName: string) => {
    garden = await getContainerTestGarden(environmentName)
    graph = await garden.getConfigGraph(garden.log)
    provider = <KubernetesProvider>await garden.resolveProvider(garden.log, "local-kubernetes")
    ctx = await garden.getPluginContext(provider)
  }

  async function ensureImagePulled(module: ContainerModule, log: LogEntry) {
    const imageId = module.outputs["local-image-id"]
    const imageHash = await containerHelpers.dockerCli({
      cwd: module.buildPath,
      args: ["images", "-q", imageId],
      log,
      ctx,
    })

    expect(imageHash.stdout.length).to.be.greaterThan(0)
  }

  grouped("cluster-docker", "remote-only").context("using an external cluster registry", () => {
    let module: GardenModule

    before(async () => {
      await init("cluster-docker-remote-registry")

      module = graph.getModule("remote-registry-test")

      // build the image
      await garden.buildStaging.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })
    })

    it("should pull the image", async () => {
      await pullModule(ctx as KubernetesPluginContext, module, garden.log)
      await ensureImagePulled(module, garden.log)
    })
  })

  grouped("cluster-docker").context("using the in cluster registry", () => {
    let module: GardenModule

    before(async () => {
      await init("cluster-docker")

      module = graph.getModule("simple-service")

      // build the image
      await garden.buildStaging.syncFromSrc(module, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        module,
      })
    })

    it("should pull the image", async () => {
      await pullModule(ctx as KubernetesPluginContext, module, garden.log)
      await ensureImagePulled(module, garden.log)
    })
  })
})
