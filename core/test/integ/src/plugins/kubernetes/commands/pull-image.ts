/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { pullBuild } from "../../../../../../src/plugins/kubernetes/commands/pull-image.js"
import type { Garden } from "../../../../../../src/garden.js"
import type { ConfigGraph } from "../../../../../../src/graph/config-graph.js"
import { getContainerTestGarden } from "../container/container.js"
import type { PluginContext } from "../../../../../../src/plugin-context.js"
import type { KubernetesProvider, KubernetesPluginContext } from "../../../../../../src/plugins/kubernetes/config.js"
import { containerHelpers } from "../../../../../../src/plugins/container/helpers.js"
import { expect } from "chai"
import { grouped } from "../../../../../helpers.js"
import type { BuildAction, ResolvedBuildAction } from "../../../../../../src/actions/build.js"
import { createActionLog } from "../../../../../../src/logger/log-entry.js"
import { k8sContainerBuildExtension } from "../../../../../../src/plugins/kubernetes/container/extensions.js"

describe.skip("pull-image plugin command", () => {
  let garden: Garden
  let cleanup: (() => void) | undefined
  let graph: ConfigGraph
  let provider: KubernetesProvider
  let ctx: PluginContext
  const builder = k8sContainerBuildExtension()

  after(async () => {
    if (garden) {
      garden.close()
    }
  })

  const init = async (environmentName: string) => {
    ;({ garden, cleanup } = await getContainerTestGarden(environmentName, { remoteContainerAuth: true }))
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    provider = <KubernetesProvider>await garden.resolveProvider({ log: garden.log, name: "local-kubernetes" })
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
        action: resolvedAction,
      })

      await builder.handlers.build!({
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
      const actionLog = createActionLog({ log: garden.log, action })

      await builder.handlers.build!({
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
