/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { Log } from "../../../../../src/logger/log-entry"
import { KubernetesPluginContext, KubernetesProvider } from "../../../../../src/plugins/kubernetes/config"
import pRetry = require("p-retry")
import { sleep } from "../../../../../src/util/util"
import { ingressControllerReady } from "../../../../../src/plugins/kubernetes/nginx/ingress-controller"
import { uninstallGardenServices } from "../../../../../src/plugins/kubernetes/commands/uninstall-garden-services"
import { prepareEnvironment } from "../../../../../src/plugins/kubernetes/init"
import { PrepareEnvironmentParams } from "../../../../../src/plugin/handlers/Provider/prepareEnvironment"
import { defaultEnvironmentStatus } from "../../../../../src/plugin/handlers/Provider/getEnvironmentStatus"
import { getContainerTestGarden } from "./container/container"
import { Garden } from "../../../../../src"

describe("It should manage ingress controller for respective cluster type", () => {
  let garden: Garden
  let ctx: KubernetesPluginContext
  let provider: KubernetesProvider
  let log: Log

  before(async () => {
    await init()
  })

  after(async () => {
    await cleanup()
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
      graph: await garden.getConfigGraph({ log: garden.log, emit: false }),
    })
  }

  const init = async () => {
    ;({ garden } = await getContainerTestGarden())
    provider = <KubernetesProvider>await garden.resolveProvider(garden.log, "local-kubernetes")
    ctx = <KubernetesPluginContext>(
      await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
    )
    log = garden.log
  }

  it("should install an nginx ingress controller during environment preparation when setupIngressController is set to nginx", async () => {
    const params: PrepareEnvironmentParams = {
      ctx,
      log: garden.log,
      status: defaultEnvironmentStatus,
      force: false,
    }
    ctx.provider.config.setupIngressController = "nginx"
    await prepareEnvironment(params)

    let ingressControllerIsReady

    for (let i = 0; i < 5; i++) {
      ingressControllerIsReady = await ingressControllerReady(ctx, log)
      if (ingressControllerIsReady) {
        break
      }
      await sleep(5000)
    }
    expect(ingressControllerIsReady).to.eql(true)
  })

  it("should not install an nginx ingress controller during environment preparation when setupIngressController is set to null", async () => {
    const params: PrepareEnvironmentParams = {
      ctx,
      log: garden.log,
      status: defaultEnvironmentStatus,
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
      status: defaultEnvironmentStatus,
      force: false,
    }
    ctx.provider.config.setupIngressController = "nginx"
    await prepareEnvironment(params)

    let ingressControllerIsReadyAfterInstall

    for (let i = 0; i < 5; i++) {
      ingressControllerIsReadyAfterInstall = await ingressControllerReady(ctx, log)
      if (ingressControllerIsReadyAfterInstall) {
        break
      }
      await sleep(5000)
    }
    expect(ingressControllerIsReadyAfterInstall).to.eql(true)
    await cleanup()
    const ingressControllerIsReadyAfterUninstall = await ingressControllerReady(ctx, log)
    expect(ingressControllerIsReadyAfterUninstall).to.eql(false)
  })
})
