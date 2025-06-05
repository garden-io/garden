/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import type { Log } from "../../../../../src/logger/log-entry.js"
import type { KubernetesPluginContext, KubernetesProvider } from "../../../../../src/plugins/kubernetes/config.js"
import { ingressControllerReady } from "../../../../../src/plugins/kubernetes/nginx/ingress-controller.js"
import { uninstallGardenServices } from "../../../../../src/plugins/kubernetes/commands/uninstall-garden-services.js"
import { prepareEnvironment } from "../../../../../src/plugins/kubernetes/init.js"
import type { PrepareEnvironmentParams } from "../../../../../src/plugin/handlers/Provider/prepareEnvironment.js"
import type { Garden } from "../../../../../src/garden.js"
import { getEmptyGardenWithLocalK8sProvider } from "../../../helpers.js"
import type { ConfigGraph } from "../../../../../src/graph/config-graph.js"

describe("It should manage ingress controller for respective cluster type", () => {
  let garden: Garden
  let graph: ConfigGraph
  let ctx: KubernetesPluginContext
  let provider: KubernetesProvider
  let log: Log

  before(async () => {
    garden = await getEmptyGardenWithLocalK8sProvider()
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
  })

  after(() => {
    garden && garden.close()
  })

  beforeEach(async () => {
    await init()
  })

  afterEach(async () => {
    await cleanup()
  })

  const cleanup = async () => {
    ctx.provider.config.setupIngressController = "nginx"
    await uninstallGardenServices.handler({
      garden,
      ctx,
      log: garden.log,
      args: [],
      graph,
    })
  }

  const init = async () => {
    provider = <KubernetesProvider>await garden.resolveProvider({ log: garden.log, name: "local-kubernetes" })
    ctx = <KubernetesPluginContext>(
      await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
    )
    log = garden.log
  }

  it("should install an nginx ingress controller during environment preparation when setupIngressController is set to nginx", async () => {
    const params: PrepareEnvironmentParams = {
      ctx,
      log: garden.log,
      force: false,
    }
    ctx.provider.config.setupIngressController = "nginx"
    await prepareEnvironment(params)
    const ingressControllerIsReady = await ingressControllerReady(ctx, log)
    expect(ingressControllerIsReady).to.eql(true)
  })

  it("should not install an nginx ingress controller during environment preparation when setupIngressController is set to null", async () => {
    const params: PrepareEnvironmentParams = {
      ctx,
      log: garden.log,
      force: false,
    }
    ctx.provider.config.setupIngressController = "null"
    await prepareEnvironment(params)

    const ingressControllerIsReady = await ingressControllerReady(ctx, log)
    expect(ingressControllerIsReady).to.eql(false)
  })

  it("should remove an nginx ingress controller installed by garden when using plugin command", async () => {
    const params: PrepareEnvironmentParams = {
      ctx,
      log: garden.log,
      force: false,
    }
    ctx.provider.config.setupIngressController = "nginx"
    await prepareEnvironment(params)

    const ingressControllerIsReadyAfterInstall = await ingressControllerReady(ctx, log)
    expect(ingressControllerIsReadyAfterInstall).to.eql(true)
    await cleanup()
    const ingressControllerIsReadyAfterUninstall = await ingressControllerReady(ctx, log)
    expect(ingressControllerIsReadyAfterUninstall).to.eql(false)
  })
})
