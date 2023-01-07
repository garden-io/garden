/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { pullBuild } from "../../../../../../src/plugins/kubernetes/commands/pull-image"
import { Garden } from "../../../../../../src/garden"
import { ConfigGraph } from "../../../../../../src/graph/config-graph"
import { getContainerTestGarden } from "../container/container"
import { k8sBuildContainer } from "../../../../../../src/plugins/kubernetes/container/build/build"
import { PluginContext } from "../../../../../../src/plugin-context"
import { KubernetesProvider, KubernetesPluginContext } from "../../../../../../src/plugins/kubernetes/config"
import { containerHelpers } from "../../../../../../src/plugins/container/helpers"
import { expect } from "chai"
import { grouped } from "../../../../../helpers"
import { BuildAction } from "../../../../../../src/actions/build"

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
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    provider = <KubernetesProvider>await garden.resolveProvider(garden.log, "local-kubernetes")
    ctx = await garden.getPluginContext(provider)
  }

  async function removeImage(action: BuildAction) {
    const imageId = action._outputs["local-image-id"]
    try {
      await containerHelpers.dockerCli({
        cwd: "/tmp",
        args: ["rmi", imageId],
        log: garden.log,
        ctx,
      })
    } catch {
      // This is fine, the image may not already be there
    }
  }

  async function ensureImagePulled(action: BuildAction) {
    const imageId = action._outputs["local-image-id"]
    const imageHash = await containerHelpers.dockerCli({
      cwd: action.getBuildPath(),
      args: ["run", imageId, "echo", "ok"],
      log: garden.log,
      ctx,
    })

    expect(imageHash.stdout.trim()).to.equal("ok")
  }

  grouped("kaniko", "remote-only").context("using an external cluster registry with kaniko", () => {
    let action: BuildAction

    before(async () => {
      await init("kaniko")

      action = graph.getBuild("remote-registry-test.build") as BuildAction
      const resolvedAction = await garden.resolveAction({ action, graph, log: garden.log })

      // build the image
      await garden.buildStaging.syncFromSrc(action, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        action: resolvedAction,
      })
    })

    it("should pull the image", async () => {
      await removeImage(action)
      await pullBuild({
        localId: action._outputs["local-image-id"],
        remoteId: action._outputs["deployment-image-id"],
        ctx: ctx as KubernetesPluginContext,
        action,
        log: garden.log,
      })
      await ensureImagePulled(action)
    })
  })

  grouped("cluster-buildkit", "remote-only").context("using an external cluster registry with buildkit", () => {
    let action: BuildAction

    before(async () => {
      await init("cluster-buildkit")

      action = graph.getBuild("remote-registry-test.build")
      const resolvedAction = await garden.resolveAction({ action, graph, log: garden.log })

      // build the image
      await garden.buildStaging.syncFromSrc(action, garden.log)

      await k8sBuildContainer({
        ctx,
        log: garden.log,
        action: resolvedAction,
      })
    })

    it("should pull the image", async () => {
      await removeImage(action)
      await pullBuild({
        localId: action._outputs["local-image-id"],
        remoteId: action._outputs["deployment-image-id"],
        ctx: ctx as KubernetesPluginContext,
        action,
        log: garden.log,
      })
      await ensureImagePulled(action)
    })
  })
})
