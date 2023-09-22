/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
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
import { BuildAction, ResolvedBuildAction } from "../../../../../../src/actions/build"
import { createActionLog } from "../../../../../../src/logger/log-entry"

describe("pull-image plugin command", () => {
  let garden: Garden
  let cleanup: (() => void) | undefined
  let graph: ConfigGraph
  let provider: KubernetesProvider
  let ctx: PluginContext

  after(async () => {
    if (garden) {
      garden.close()
    }
  })

  const init = async (environmentName: string) => {
    ;({ garden, cleanup } = await getContainerTestGarden(environmentName, { remoteContainerAuth: true }))
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    provider = <KubernetesProvider>await garden.resolveProvider(garden.log, "local-kubernetes")
    ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
  }

  async function removeImage(action: BuildAction) {
    const imageId = action._staticOutputs["local-image-id"]

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
    const imageId = action._staticOutputs["local-image-id"]
    const imageHash = await containerHelpers.dockerCli({
      cwd: action.getBuildPath(),
      args: ["run", imageId, "echo", "ok"],
      log: garden.log,
      ctx,
    })

    expect(imageHash.stdout.trim()).to.equal("ok")
  }

  grouped("kaniko", "remote-only").context("using an external cluster registry with kaniko", () => {
    let resolvedAction: ResolvedBuildAction
    let action: BuildAction

    before(async () => {
      await init("kaniko")

      action = graph.getBuild("remote-registry-test")
      resolvedAction = await garden.resolveAction({ action, graph, log: garden.log })

      // build the image
      await garden.buildStaging.syncFromSrc({ action, log: garden.log })
      const actionLog = createActionLog({
        log: garden.log,
        actionName: resolvedAction.name,
        actionKind: resolvedAction.kind,
      })

      await k8sBuildContainer({
        ctx,
        log: actionLog,
        action: resolvedAction,
      })
    })

    after(async () => {
      if (cleanup) {
        cleanup()
      }
    })

    it("should pull the image", async () => {
      await removeImage(resolvedAction)
      await pullBuild({
        localId: resolvedAction._staticOutputs["local-image-id"],
        remoteId: resolvedAction._staticOutputs["deployment-image-id"],
        ctx: ctx as KubernetesPluginContext,
        action,
        log: garden.log,
      })
      await ensureImagePulled(resolvedAction)
    })
  })

  grouped("cluster-buildkit", "remote-only").context("using an external cluster registry with buildkit", () => {
    let action: BuildAction
    let resolvedAction: ResolvedBuildAction

    before(async () => {
      await init("cluster-buildkit")

      action = graph.getBuild("remote-registry-test")
      resolvedAction = await garden.resolveAction({ action, graph, log: garden.log })

      // build the image
      await garden.buildStaging.syncFromSrc({ action, log: garden.log })
      const actionLog = createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind })

      await k8sBuildContainer({
        ctx,
        log: actionLog,
        action: resolvedAction,
      })
    })

    after(async () => {
      if (cleanup) {
        cleanup()
      }
    })

    it("should pull the image", async () => {
      await removeImage(resolvedAction)
      await pullBuild({
        localId: resolvedAction._staticOutputs["local-image-id"],
        remoteId: resolvedAction._staticOutputs["deployment-image-id"],
        ctx: ctx as KubernetesPluginContext,
        action,
        log: garden.log,
      })
      await ensureImagePulled(resolvedAction)
    })
  })
})
