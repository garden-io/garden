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
import { RuntimeError } from "../../../../../src/exceptions"
import { LocalModeProcessRegistry, LocalModeSshPortRegistry } from "../../../../../src/plugins/kubernetes/local-mode"
import pRetry = require("p-retry")

describe("local mode deployments and ssh tunneling behavior", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let ctx: KubernetesPluginContext
  let provider: KubernetesProvider

  before(async () => {
    await init("local")
  })

  after(() => {
    LocalModeProcessRegistry.getInstance().shutdown()
    LocalModeSshPortRegistry.getInstance(garden.log).shutdown(garden.log)
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

  it("should deploy a service in local mode and successfully start a port-forwarding", async () => {
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

    const serviceSshKeysPath = join(module.localModeSshKeystorePath, service.name)
    const privateSshKeyPath = join(serviceSshKeysPath, "proxy-key")
    const publicSshKeyPath = join(serviceSshKeysPath, "proxy-key.pub")
    expect(await pathExists(privateSshKeyPath)).to.be.true
    expect(await pathExists(publicSshKeyPath)).to.be.true

    const firstTcpPort = service.config.spec.ports.find((p) => p.protocol === "TCP")
    const firstForwardablePort = firstTcpPort || service.config.spec.ports[0]
    const containerPort = firstForwardablePort.containerPort
    const localPort = service.config.spec.localMode.localPort

    const grepSshTunnelCommand = `ps -ef | grep 'ssh -T -R ${containerPort}:127.0.0.1:${localPort} ${PROXY_CONTAINER_USER_NAME}@127.0.0.1'`
    log.info(`Looking for running ssh reverse port forwarding with command: ${grepSshTunnelCommand}`)

    // give some time (30 sec) to local mode to start
    const isPortForwardingRunning = await pRetry(
      () => {
        const grepResult = execSync(grepSshTunnelCommand).toString("utf-8").split("\n")

        const expectedSshKeyParam = `-i ${privateSshKeyPath}`
        const res = grepResult.some((line) => line.includes(expectedSshKeyParam))
        if (!res) {
          log.warn(
            "Reverse ssh port forwarding has not been found. See the errors above if any, " +
              `or check if the ssh process grep command was correct: ${grepSshTunnelCommand}`
          )
        }
        if (!res) {
          throw new RuntimeError("Port-forwarding is still not running", {})
        }
        return res
      },
      {
        retries: 5,
        minTimeout: 6000,
        onFailedAttempt: async (err) => {
          log.warn(`${err.message}. ${err.retriesLeft} attempts left.`)
        },
      }
    ).catch((_err) => false)
    expect(isPortForwardingRunning).to.be.true
    // no need to delete the running k8s service.
    // It will cause failing retry process for port-forwarding and eventually will kill the testing job.
  })
})
