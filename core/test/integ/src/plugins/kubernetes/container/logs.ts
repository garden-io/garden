/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { Garden } from "../../../../../../src/garden"
import { getDataDir, makeTestGarden } from "../../../../../helpers"
import { ConfigGraph } from "../../../../../../src/config-graph"
import { DeployTask } from "../../../../../../src/tasks/deploy"
import { getServiceLogs } from "../../../../../../src/plugins/kubernetes/container/logs"
import { Stream } from "ts-stream"
import { ServiceLogEntry } from "../../../../../../src/types/plugin/service/getServiceLogs"
import { KubernetesPluginContext, KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config"
import { K8sLogFollower } from "../../../../../../src/plugins/kubernetes/logs"
import { KubeApi } from "../../../../../../src/plugins/kubernetes/api"
import { emptyRuntimeContext } from "../../../../../../src/runtime-context"
import { createWorkloadManifest } from "../../../../../../src/plugins/kubernetes/container/deployment"
import { sleep } from "../../../../../../src/util/util"
import { DeleteServiceTask } from "../../../../../../src/tasks/delete-service"

describe("kubernetes", () => {
  let garden: Garden
  let graph: ConfigGraph
  let provider: KubernetesProvider
  let ctx: KubernetesPluginContext

  before(async () => {
    const root = getDataDir("test-projects", "container")
    garden = await makeTestGarden(root)
    graph = await garden.getConfigGraph(garden.log)
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
      let logsFollower: K8sLogFollower

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
        })

        await garden.processTasks([deployTask], { throwOnError: true })
        const stream = new Stream<ServiceLogEntry>()

        void stream.forEach((entry) => {
          entries.push(entry)
        })

        const resources = [
          await createWorkloadManifest({
            api,
            provider,
            service,
            // No need for the proper context here
            runtimeContext: emptyRuntimeContext,
            namespace,
            enableDevMode: false,
            enableHotReload: false,
            production: ctx.production,
            log,
            blueGreen: provider.config.deploymentStrategy === "blue-green",
          }),
        ]
        logsFollower = new K8sLogFollower({
          defaultNamespace: provider.config.namespace!.name!,
          service,
          stream,
          resources,
          k8sApi: api,
        })

        setTimeout(() => {
          logsFollower.close()
        }, 2500)
        await logsFollower.followLogs()

        const debugEntry = entries.find((e) => e.msg.includes("Connected to container 'simple-service'"))
        const serviceLog = entries.find((e) => e.msg.includes("Server running..."))

        expect(debugEntry).to.exist
        expect(debugEntry!.serviceName).to.eql("simple-service")
        expect(debugEntry!.timestamp).to.be.an.instanceOf(Date)
        expect(debugEntry!.level).to.eql(4)

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
            api,
            provider,
            service,
            // No need for the proper context here
            runtimeContext: emptyRuntimeContext,
            namespace,
            enableDevMode: false,
            enableHotReload: false,
            production: ctx.production,
            log,
            blueGreen: provider.config.deploymentStrategy === "blue-green",
          }),
        ]
        const retryIntervalMs = 1000
        logsFollower = new K8sLogFollower({
          defaultNamespace: provider.config.namespace!.name!,
          service,
          stream,
          resources,
          k8sApi: api,
          retryIntervalMs,
        })

        // Start by deleting the service in case it already exists
        await garden.processTasks([deleteTask], { throwOnError: true })

        // Start following logs even when no services is deployed
        // (we don't wait for the Promise since it won't resolve unless we close the connection)
        // tslint:disable-next-line: no-floating-promises
        logsFollower.followLogs()
        await sleep(1500)

        // Deploy the service
        await garden.processTasks([deployTask], { throwOnError: true })
        await sleep(1500)

        logsFollower.close()

        const missingContainerDebugEntry = entries.find((e) =>
          e.msg.includes(`<No running containers found for service. Will retry in ${retryIntervalMs / 1000}s...>`)
        )
        const connectedDebugEntry = entries.find((e) =>
          e.msg.includes("<Connected to container 'simple-service' in Pod")
        )
        const serviceLog = entries.find((e) => e.msg.includes("Server running..."))

        // First we expect to see a "missing container" entry because the service hasn't been deployed
        expect(missingContainerDebugEntry).to.exist
        expect(missingContainerDebugEntry!.serviceName).to.eql("simple-service")
        expect(missingContainerDebugEntry!.timestamp).to.be.an.instanceOf(Date)
        expect(missingContainerDebugEntry!.level).to.eql(4)

        // Then we expect to see a "container connected" entry when the service has been deployed
        expect(connectedDebugEntry).to.exist
        expect(connectedDebugEntry!.serviceName).to.eql("simple-service")
        expect(connectedDebugEntry!.timestamp).to.be.an.instanceOf(Date)
        expect(connectedDebugEntry!.timestamp!.getTime() > missingContainerDebugEntry!.timestamp!.getTime()).to.be.true
        expect(connectedDebugEntry!.level).to.eql(4)

        // Finally we expect to see the service log
        expect(serviceLog).to.exist
        expect(serviceLog!.serviceName).to.eql("simple-service")
        expect(serviceLog!.timestamp).to.be.an.instanceOf(Date)
        expect(serviceLog!.timestamp!.getTime() > connectedDebugEntry!.timestamp!.getTime()).to.be.true
        expect(serviceLog!.level).to.eql(2)
      })
    })
  })
})
