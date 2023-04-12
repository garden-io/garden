/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { getDataDir, makeTestGarden, TestGarden } from "../../../../../helpers"
import { ConfigGraph } from "../../../../../../src/graph/config-graph"
import { DeployTask } from "../../../../../../src/tasks/deploy"
import { k8sGetContainerDeployLogs } from "../../../../../../src/plugins/kubernetes/container/logs"
import { Stream } from "ts-stream"
import { DeployLogEntry } from "../../../../../../src/types/service"
import { KubernetesPluginContext, KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config"
import { K8sLogFollower, makeDeployLogEntry } from "../../../../../../src/plugins/kubernetes/logs"
import { KubeApi } from "../../../../../../src/plugins/kubernetes/api"
import { createWorkloadManifest } from "../../../../../../src/plugins/kubernetes/container/deployment"
import { sleep } from "../../../../../../src/util/util"
import { DeleteDeployTask } from "../../../../../../src/tasks/delete-deploy"
import { getDeployedImageId } from "../../../../../../src/plugins/kubernetes/container/util"
import { ContainerDeployAction } from "../../../../../../src/plugins/container/config"
import { createActionLog } from "../../../../../../src/logger/log-entry"

describe("kubernetes", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let provider: KubernetesProvider
  let ctx: KubernetesPluginContext

  before(async () => {
    const root = getDataDir("test-projects", "container")
    garden = await makeTestGarden(root)
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    provider = (await garden.resolveProvider(garden.log, "local-kubernetes")) as KubernetesProvider
    ctx = (await garden.getPluginContext({
      provider,
      templateContext: undefined,
      events: undefined,
    })) as KubernetesPluginContext
  })

  after(async () => {
    await garden.close()
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
      const stream = new Stream<DeployLogEntry>()

      void stream.forEach((entry) => {
        entries.push(entry)
      })

      const resolvedDeployAction = await garden.resolveAction<ContainerDeployAction>({ action, log: garden.log, graph })

      await k8sGetContainerDeployLogs({
        ctx,
        action: resolvedDeployAction,
        log: actionLog,
        stream,
        follow: false,
      })

      expect(entries[0].msg).to.include("Server running...")
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
        const stream = new Stream<DeployLogEntry>()

        void stream.forEach((entry) => {
          entries.push(entry)
        })

        const resolvedDeployAction = await garden.resolveAction<ContainerDeployAction>({
          action,
          log: garden.log,
          graph,
        })

        const resources = [
          await createWorkloadManifest({
            ctx,
            api,
            provider,
            action: resolvedDeployAction,
            namespace,
            imageId: getDeployedImageId(resolvedDeployAction, provider),

            production: ctx.production,
            log,
          }),
        ]
        logsFollower = new K8sLogFollower({
          defaultNamespace: provider.config.namespace!.name!,
          log,
          stream,
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
        const deleteTask = new DeleteDeployTask({
          garden,
          graph,
          action,
          log: garden.log,

          force: false,
        })

        const stream = new Stream<DeployLogEntry>()

        void stream.forEach((entry) => {
          entries.push(entry)
        })

        const resolvedDeployAction = await garden.resolveAction<ContainerDeployAction>({
          action,
          log: garden.log,
          graph,
        })

        const resources = [
          await createWorkloadManifest({
            ctx,
            api,
            provider,
            action: resolvedDeployAction,
            namespace,
            imageId: getDeployedImageId(resolvedDeployAction, provider),
            production: ctx.production,
            log,
          }),
        ]
        const retryIntervalMs = 1000
        logsFollower = new K8sLogFollower({
          defaultNamespace: provider.config.namespace!.name!,
          stream,
          log,
          entryConverter: makeDeployLogEntry(action.name),
          resources,
          k8sApi: api,
          retryIntervalMs,
        })

        // Start by deleting the Deploy in case it already exists
        await garden.processTasks({ tasks: [deleteTask], throwOnError: true })

        // Start following logs even when no Deploys are live
        // (we don't wait for the Promise since it won't resolve unless we close the connection)
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        logsFollower.followLogs({})
        await sleep(1500)

        await garden.processTasks({ tasks: [deployTask], throwOnError: true })
        await sleep(1500)

        logsFollower.close()

        const logString = log.toString()

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
