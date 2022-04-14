/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { ConfigGraph } from "../../../../../src/config-graph"
import { KubernetesPluginContext, KubernetesProvider } from "../../../../../src/plugins/kubernetes/config"
import { getContainerServiceStatus } from "../../../../../src/plugins/kubernetes/container/status"
import { emptyRuntimeContext } from "../../../../../src/runtime-context"
import { DeployTask } from "../../../../../src/tasks/deploy"
import { TestGarden } from "../../../../helpers"
import { getContainerTestGarden } from "./container/container"
import { join } from "path"
import { pathExists } from "fs-extra"
import { execSync } from "child_process"
import { PROXY_CONTAINER_USER_NAME } from "../../../../../src/plugins/kubernetes/constants"

describe("local mode deployments and ssh tunneling behavior", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let ctx: KubernetesPluginContext
  let provider: KubernetesProvider

  before(async () => {
    await init("local")
  })

  beforeEach(async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
  })

  afterEach(async () => {
    if (garden) {
      await garden.close()
    }
  })

  const init = async (environmentName: string) => {
    garden = await getContainerTestGarden(environmentName)
    graph = await garden.getConfigGraph({ log: garden.log, emit: false, noCache: true })
    provider = <KubernetesProvider>await garden.resolveProvider(garden.log, "local-kubernetes")
    ctx = <KubernetesPluginContext>await garden.getPluginContext(provider)
  }

  it("should deploy a service in local mode and successfully set a port-forwarding", async () => {
    await init("local")
    const service = graph.getService("local-mode")
    const module = service.module
    const log = garden.log
    const deployTask = new DeployTask({
      garden,
      graph,
      log,
      service,
      force: true,
      forceBuild: false,
      devModeServiceNames: [],
      hotReloadServiceNames: [],
      localModeServiceNames: [service.name],
    })

    await garden.processTasks([deployTask], { throwOnError: true })
    const status = await getContainerServiceStatus({
      ctx,
      module,
      service,
      runtimeContext: emptyRuntimeContext,
      log,
      devMode: false,
      hotReload: false,
      localMode: true,
    })
    expect(status.localMode).to.eql(true)

    const moduleSshKeysPath = join(module.proxySshKeyDirPath, module.name)
    const privateSshKeyPath = join(moduleSshKeysPath, service.name)
    const publicSshKeyPath = privateSshKeyPath + ".pub"
    expect(await pathExists(privateSshKeyPath)).to.be.true
    expect(await pathExists(publicSshKeyPath)).to.be.true

    const containerPort = service.config.spec.ports.find((p) => p.name === "http")!.containerPort
    const localPort = service.config.spec.localMode.localAppPort
    const outputBuffer = execSync(
      `ps aux | grep 'ssh -R ${containerPort}:127.0.0.1:${localPort} ${PROXY_CONTAINER_USER_NAME}@127.0.0.1'`
    )
    const processOutputLines = outputBuffer.toString("utf-8").split("\n")
    const expectedSshKeyParam = `-i ${privateSshKeyPath}`
    const isPortForwardingRunning = processOutputLines.some((line) => line.includes(expectedSshKeyParam))
    expect(isPortForwardingRunning).to.be.true

    // This is to make sure that the two-way sync doesn't recreate the local files we're about to delete here.
    const actions = await garden.getActionRouter()
    await actions.deleteService({ graph, log: garden.log, service })
  })
})
