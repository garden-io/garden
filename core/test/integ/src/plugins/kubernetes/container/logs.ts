/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { getDataDir, makeTestGarden, TestGarden } from "../../../../../helpers"
import { ConfigGraph } from "../../../../../../src/config-graph"
import { DeployTask } from "../../../../../../src/tasks/deploy"
import { getServiceLogs } from "../../../../../../src/plugins/kubernetes/container/logs"
import { Stream } from "ts-stream"
import { ServiceLogEntry } from "../../../../../../src/types/plugin/service/getServiceLogs"
import { KubernetesPluginContext, KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config"
import { K8sLogFollower, makeServiceLogEntry } from "../../../../../../src/plugins/kubernetes/logs"
import { KubeApi } from "../../../../../../src/plugins/kubernetes/api"
import { emptyRuntimeContext } from "../../../../../../src/runtime-context"
import { createWorkloadManifest } from "../../../../../../src/plugins/kubernetes/container/deployment"
import { sleep } from "../../../../../../src/util/util"
import { DeleteServiceTask } from "../../../../../../src/tasks/delete-service"

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
    ctx = (await garden.getPluginContext(provider)) as KubernetesPluginContext
  })

  after(async () => {
    await garden.close()
  })

  describe("getServiceLogs", () => {
    it("should write service logs to stream", async () => {
      const module = graph.getModule("simple-service")
      const service = graph.getService("simple-service")

      const entries: ServiceLogEntry[] = []

      const deployTask = new DeployTask({
        force: true,
        forceBuild: true,
        garden,
        graph,
        log: garden.log,
        service,
        devModeServiceNames: [],
        hotReloadServiceNames: [],
        localModeServiceNames: [],
      })

      await garden.processTasks([deployTask], { throwOnError: true })
      const stream = new Stream<ServiceLogEntry>()

      void stream.forEach((entry) => {
        entries.push(entry)
      })

      await getServiceLogs({
        ctx,
        module,
        service,
        log: garden.log,
        stream,
        follow: false,
      })

      expect(entries[0].msg).to.include("Server running...")
    })
    describe("K8sLogsFollower", () => {
      let logsFollower: K8sLogFollower<ServiceLogEntry>

      afterEach(() => {
        logsFollower.close()
      })

      it("should write service logs to stream and listen for more", async () => {
        const service = graph.getService("simple-service")
        const log = garden.log
        const namespace = provider.config.namespace!.name!
        const api = await KubeApi.factory(log, ctx, provider)

        const entries: ServiceLogEntry[] = []

        const deployTask = new DeployTask({
          force: true,
          forceBuild: true,
          garden,
          graph,
          log: garden.log,
          service,
          devModeServiceNames: [],
          hotReloadServiceNames: [],
          localModeServiceNames: [],
        })

        await garden.processTasks([deployTask], { throwOnError: true })
        const stream = new Stream<ServiceLogEntry>()

        void stream.forEach((entry) => {
          entries.push(entry)
        })

        const resources = [
          await createWorkloadManifest({
            ctx,
            api,
            provider,
            service,
            // No need for the proper context here
            runtimeContext: emptyRuntimeContext,
            namespace,
            enableDevMode: false,
            enableHotReload: false,
            enableLocalMode: false,
            production: ctx.production,
            log,
            blueGreen: provider.config.deploymentStrategy === "blue-green",
          }),
        ]
        logsFollower = new K8sLogFollower({
          defaultNamespace: provider.config.namespace!.name!,
          log,
          stream,
          entryConverter: makeServiceLogEntry(service.name),
          resources,
          k8sApi: api,
        })

        setTimeout(() => {
          logsFollower.close()
        }, 2500)
        await logsFollower.followLogs({ limitBytes: null })

        expect(ctx.log.toString()).to.match(/Connected to container 'simple-service'/)

        const serviceLog = entries.find((e) => e.msg.includes("Server running..."))

        expect(serviceLog).to.exist
        expect(serviceLog!.serviceName).to.eql("simple-service")
        expect(serviceLog!.timestamp).to.be.an.instanceOf(Date)
        expect(serviceLog!.level).to.eql(2)
      })

      it("should automatically connect if a service that was missing is deployed", async () => {
        const service = graph.getService("simple-service")
        const log = garden.log
        const namespace = provider.config.namespace!.name!
        const api = await KubeApi.factory(log, ctx, provider)

        const entries: ServiceLogEntry[] = []

        const deployTask = new DeployTask({
          force: true,
          forceBuild: true,
          garden,
          graph,
          log: garden.log,
          service,
          devModeServiceNames: [],
          hotReloadServiceNames: [],
          localModeServiceNames: [],
        })
        const deleteTask = new DeleteServiceTask({
          garden,
          graph,
          log: garden.log,
          service,
        })

        const stream = new Stream<ServiceLogEntry>()

        void stream.forEach((entry) => {
          entries.push(entry)
        })

        const resources = [
          await createWorkloadManifest({
            ctx,
            api,
            provider,
            service,
            // No need for the proper context here
            runtimeContext: emptyRuntimeContext,
            namespace,
            enableDevMode: false,
            enableHotReload: false,
            enableLocalMode: false,
            production: ctx.production,
            log,
            blueGreen: provider.config.deploymentStrategy === "blue-green",
          }),
        ]
        const retryIntervalMs = 1000
        logsFollower = new K8sLogFollower({
          defaultNamespace: provider.config.namespace!.name!,
          stream,
          log,
          entryConverter: makeServiceLogEntry(service.name),
          resources,
          k8sApi: api,
          retryIntervalMs,
        })

        // Start by deleting the service in case it already exists
        await garden.processTasks([deleteTask], { throwOnError: true })

        // Start following logs even when no services is deployed
        // (we don't wait for the Promise since it won't resolve unless we close the connection)
        // tslint:disable-next-line: no-floating-promises
        logsFollower.followLogs({ limitBytes: null })
        await sleep(1500)

        // Deploy the service
        await garden.processTasks([deployTask], { throwOnError: true })
        await sleep(1500)

        logsFollower.close()

        const missingContainerRegex = new RegExp(
          `<No running containers found for service. Will retry in ${retryIntervalMs / 1000}s...>`
        )
        const connectedRegex = new RegExp("<Connected to container 'simple-service' in Pod")
        const serverRunningRegex = new RegExp("Server running...")
        expect(ctx.log.toString()).to.match(missingContainerRegex)
        expect(ctx.log.toString()).to.match(connectedRegex)
        expect(ctx.log.toString()).to.match(serverRunningRegex)

        // First we expect to see a "missing container" entry because the service hasn't been deployed

        // Then we expect to see a "container connected" entry when the service has been deployed

        // Finally we expect to see the service log
      })
    })
  })
})
