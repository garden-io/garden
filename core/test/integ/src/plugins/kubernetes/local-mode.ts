/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { ConfigGraph } from "../../../../../src/graph/config-graph"
import { k8sGetContainerDeployStatus } from "../../../../../src/plugins/kubernetes/container/status"
import { KubernetesPluginContext, KubernetesProvider } from "../../../../../src/plugins/kubernetes/config"
import { TestGarden } from "../../../../helpers"
import { getContainerTestGarden } from "./container/container"
import { join } from "path"
import { pathExists } from "fs-extra"
import { execSync } from "child_process"
import { PROXY_CONTAINER_USER_NAME } from "../../../../../src/plugins/kubernetes/constants"
import { RuntimeError } from "../../../../../src/exceptions"
import { LocalModeProcessRegistry, ProxySshKeystore } from "../../../../../src/plugins/kubernetes/local-mode"
import pRetry = require("p-retry")
import { sleep } from "../../../../../src/util/util"
import { DeployTask } from "../../../../../src/tasks/deploy"
import { createActionLog } from "../../../../../src/logger/log-entry"

describe("local mode deployments and ssh tunneling behavior", () => {
  let garden: TestGarden
  let cleanup: (() => void) | undefined
  let graph: ConfigGraph
  let ctx: KubernetesPluginContext
  let provider: KubernetesProvider

  before(async () => {
    await init("local")
  })

  after(async () => {
    if (cleanup) {
      cleanup()
    }
  })

  beforeEach(async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
  })

  afterEach(async () => {
    LocalModeProcessRegistry.getInstance().shutdown()
    ProxySshKeystore.getInstance(garden.log).shutdown(garden.log)
    if (garden) {
      garden.close()
    }
  })

  const init = async (environmentName: string) => {
    ;({ garden, cleanup } = await getContainerTestGarden(environmentName))
    graph = await garden.getConfigGraph({
      log: garden.log,
      emit: false,
      noCache: true,
      actionModes: { local: ["deploy.local-mode"] },
    })
    provider = <KubernetesProvider>await garden.resolveProvider(garden.log, "local-kubernetes")
    ctx = <KubernetesPluginContext>(
      await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
    )
  }

  // TODO: figure out why state is always outdated
  it.skip("should deploy a service in local mode and successfully start a port-forwarding", async () => {
    const action = graph.getDeploy("local-mode")
    const log = garden.log

    const resolvedAction = await garden.resolveAction({ action, log: garden.log, graph })
    const task = new DeployTask({
      garden,
      log,
      graph,
      action,
      force: false,
      forceBuild: false,
      skipRuntimeDependencies: "always",
    })
    await garden.processTask(task, log, {})
    const actionLog = createActionLog({ log, actionName: action.name, actionKind: action.kind })

    const status = await pRetry(
      async () => {
        await sleep(3000)
        const _status = await k8sGetContainerDeployStatus({
          ctx,
          action: resolvedAction,
          log: actionLog,
        })
        if (_status.state === "not-ready") {
          throw "not-yet ready, wait a bit and try again"
        }
        return _status
      },
      {
        retries: 3,
      }
    )
    expect(status.state).to.eql("ready")
    expect(status.detail?.mode).to.eql("local")

    const actionSshKeysPath = ProxySshKeystore.getSshDirPath(ctx.gardenDirPath)
    const actionSshKeyName = action.key()
    const privateSshKeyPath = join(actionSshKeysPath, actionSshKeyName)
    const publicSshKeyPath = join(actionSshKeysPath, `${actionSshKeyName}.pub`)
    expect(await pathExists(privateSshKeyPath)).to.be.true
    expect(await pathExists(publicSshKeyPath)).to.be.true

    const localModePortSpec = action.getConfig("spec").localMode.ports[0]
    const containerPort = localModePortSpec.remote
    const localPort = localModePortSpec.local

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
          throw new RuntimeError({ message: "Port-forwarding is still not running" })
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
    )
    expect(isPortForwardingRunning).to.be.true
    // no need to delete the running k8s service.
    // It will cause failing retry process for port-forwarding and eventually will kill the testing job.
  })
})
