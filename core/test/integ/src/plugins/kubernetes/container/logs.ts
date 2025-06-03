/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import type { TestGarden } from "../../../../../helpers.js"
import { getDataDir, makeTestGarden } from "../../../../../helpers.js"
import type { ConfigGraph } from "../../../../../../src/graph/config-graph.js"
import { DeployTask } from "../../../../../../src/tasks/deploy.js"
import { k8sGetContainerDeployLogs } from "../../../../../../src/plugins/kubernetes/container/logs.js"
import type { DeployLogEntry } from "../../../../../../src/types/service.js"
import type { KubernetesPluginContext, KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config.js"
import { K8sLogFollower, makeDeployLogEntry } from "../../../../../../src/plugins/kubernetes/logs.js"
import { KubeApi } from "../../../../../../src/plugins/kubernetes/api.js"
import { createWorkloadManifest } from "../../../../../../src/plugins/kubernetes/container/deployment.js"
import { sleep } from "../../../../../../src/util/util.js"
import { DeleteDeployTask } from "../../../../../../src/tasks/delete-deploy.js"
import { getDeployedImageId } from "../../../../../../src/plugins/kubernetes/container/util.js"
import type { ContainerDeployAction } from "../../../../../../src/plugins/container/config.js"
import { createActionLog } from "../../../../../../src/logger/log-entry.js"

describe("kubernetes", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let provider: KubernetesProvider
  let ctx: KubernetesPluginContext

  before(async () => {
    const root = getDataDir("test-projects", "container")
    garden = await makeTestGarden(root)
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    provider = (await garden.resolveProvider({ log: garden.log, name: "local-kubernetes" })) as KubernetesProvider
    ctx = (await garden.getPluginContext({
      provider,
      templateContext: undefined,
      events: undefined,
    })) as KubernetesPluginContext
  })

  after(async () => {
    garden.close()
  })

  describe("k8sGetContainerDeployLogs", () => {
    it("should write Deploy logs to stream", async () => {
      const action = graph.getDeploy("simple-service")
      const actionLog = createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind })

      const entries: DeployLogEntry[] = []

      const deployTask = new DeployTask({
        force: true,
        forceBuild: true,

        garden,
        graph,
        log: garden.log,
        action,
      })

      await garden.processTasks({ tasks: [deployTask], throwOnError: true })
      const resolvedDeployAction = await garden.resolveAction<ContainerDeployAction>({ action, log: garden.log, graph })

      const onLogEntry = (entry: DeployLogEntry) => entries.push(entry)
      await k8sGetContainerDeployLogs({
        ctx,
        action: resolvedDeployAction,
        log: actionLog,
        onLogEntry,
        follow: false,
      })

      const deployLog = entries.find((e) => e.msg.includes("Server running..."))
      expect(deployLog).to.exist
    })
    describe("K8sLogsFollower", () => {
      let logsFollower: K8sLogFollower<DeployLogEntry>

      afterEach(() => {
        logsFollower.close()
      })

      it("should write Deploy logs to stream and listen for more", async () => {
        const action = graph.getDeploy("simple-service")
        const log = garden.log
        const namespace = provider.config.namespace!.name!
        const api = await KubeApi.factory(log, ctx, provider)

        const entries: DeployLogEntry[] = []

        const deployTask = new DeployTask({
          force: true,
          forceBuild: true,

          garden,
          graph,
          log: garden.log,
          action,
        })

        await garden.processTasks({ tasks: [deployTask], throwOnError: true })
        const resolvedDeployAction = await garden.resolveAction<ContainerDeployAction>({
          action,
          log: garden.log,
          graph,
        })

        const actionLog = createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind })
        const resources = [
          await createWorkloadManifest({
            ctx,
            api,
            provider,
            action: resolvedDeployAction,
            namespace,
            imageId: getDeployedImageId(resolvedDeployAction),

            production: ctx.production,
            log: actionLog,
          }),
        ]

        const onLogEntry = (entry: DeployLogEntry) => entries.push(entry)
        logsFollower = new K8sLogFollower({
          defaultNamespace: provider.config.namespace!.name!,
          log,
          onLogEntry,
          entryConverter: makeDeployLogEntry(action.name),
          resources,
          k8sApi: api,
        })

        setTimeout(() => {
          logsFollower.close()
        }, 5000)
        await logsFollower.followLogs({})

        expect(ctx.log.toString()).to.match(/Connected to container 'simple-service'/)

        const deployLog = entries.find((e) => e.msg.includes("Server running..."))

        expect(deployLog).to.exist
        expect(deployLog!.name).to.eql("simple-service")
        expect(deployLog!.timestamp).to.be.an.instanceOf(Date)
        expect(deployLog!.level).to.eql(2)
      })

      it("should automatically connect if a Deploy that was missing is deployed", async () => {
        const action = graph.getDeploy("simple-service")
        const namespace = provider.config.namespace!.name!
        const api = await KubeApi.factory(garden.log, ctx, provider)

        const entries: DeployLogEntry[] = []

        const deployTask = new DeployTask({
          force: true,
          forceBuild: true,

          garden,
          graph,
          log: garden.log,
          action,
        })
        const deleteTask = new DeleteDeployTask({
          garden,
          graph,
          action,
          log: garden.log,

          force: false,
        })
        const resolvedDeployAction = await garden.resolveAction<ContainerDeployAction>({
          action,
          log: garden.log,
          graph,
        })

        const actionLog = createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind })
        const resources = [
          await createWorkloadManifest({
            ctx,
            api,
            provider,
            action: resolvedDeployAction,
            namespace,
            imageId: getDeployedImageId(resolvedDeployAction),
            production: ctx.production,
            log: actionLog,
          }),
        ]

        const retryIntervalMs = 1000
        const onLogEntry = (entry: DeployLogEntry) => entries.push(entry)
        logsFollower = new K8sLogFollower({
          defaultNamespace: provider.config.namespace!.name!,
          onLogEntry,
          log: actionLog,
          entryConverter: makeDeployLogEntry(action.name),
          resources,
          k8sApi: api,
          retryIntervalMs,
        })

        // Start by deleting the Deploy in case it already exists
        await garden.processTasks({ tasks: [deleteTask], throwOnError: true })

        // Start following logs even when no Deploys are live
        // (we don't wait for the Promise since it won't resolve unless we close the connection)
        void logsFollower.followLogs({})
        await sleep(1500)

        await garden.processTasks({ tasks: [deployTask], throwOnError: true })
        await sleep(1500)

        logsFollower.close()

        const logString = actionLog.toString()

        // First we expect to see a "missing container" entry because the Deploy hasn't been completed
        expect(logString).to.match(
          new RegExp(
            `<No running containers found for Deployment simple-service. Will retry in ${retryIntervalMs / 1000}s...>`
          )
        )

        // Then we expect to see a "container connected" entry when the Deploy has been completed
        expect(logString).to.match(/<Connected to container 'simple-service' in Pod/)

        const deployLog = entries.find((e) => e.msg.includes("Server running..."))
        expect(deployLog).to.exist
      })
    })
  })
})
