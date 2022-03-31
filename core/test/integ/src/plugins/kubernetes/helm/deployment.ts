/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import { dataDir, makeTestGarden, TestGarden } from "../../../../../helpers"
import { deployHelmService } from "../../../../../../src/plugins/kubernetes/helm/deployment"
import { emptyRuntimeContext } from "../../../../../../src/runtime-context"
import { KubernetesPluginContext, KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config"
import {
  gardenCloudAECPauseAnnotation,
  getReleaseStatus,
  getRenderedResources,
} from "../../../../../../src/plugins/kubernetes/helm/status"
import { getReleaseName } from "../../../../../../src/plugins/kubernetes/helm/common"
import { KubeApi } from "../../../../../../src/plugins/kubernetes/api"
import { getHelmTestGarden, buildHelmModules } from "./common"
import { ConfigGraph } from "../../../../../../src/config-graph"
import { isWorkload } from "../../../../../../src/plugins/kubernetes/util"
import Bluebird from "bluebird"
import { CloudApi } from "../../../../../../src/cloud/api"
import { resolve } from "path"
import { getLogger } from "../../../../../../src/logger/logger"

describe("deployHelmService", () => {
  let garden: TestGarden
  let provider: KubernetesProvider
  let ctx: KubernetesPluginContext
  let graph: ConfigGraph

  before(async () => {
    garden = await getHelmTestGarden()
    provider = <KubernetesProvider>await garden.resolveProvider(garden.log, "local-kubernetes")
    ctx = <KubernetesPluginContext>await garden.getPluginContext(provider)
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    await buildHelmModules(garden, graph)
  })

  after(async () => {
    const actions = await garden.getActionRouter()
    await actions.deleteServices(graph, garden.log)
    if (garden) {
      await garden.close()
    }
  })

  it("should deploy a chart", async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const service = graph.getService("api")

    const status = await deployHelmService({
      ctx,
      log: garden.log,
      module: service.module,
      service,
      force: false,
      devMode: false,
      hotReload: false,
      localMode: false,
      runtimeContext: emptyRuntimeContext,
    })

    const releaseName = getReleaseName(service.module)
    const releaseStatus = await getReleaseStatus({
      ctx,
      module: service.module,
      service,
      releaseName,
      log: garden.log,
      devMode: false,
      hotReload: false,
    })

    expect(releaseStatus.state).to.equal("ready")
    expect(releaseStatus.detail["values"][".garden"]).to.eql({
      moduleName: "api",
      projectName: garden.projectName,
      version: service.version,
    })
    expect(status.namespaceStatuses).to.eql([
      {
        pluginName: "local-kubernetes",
        namespaceName: "helm-test-default",
        state: "ready",
      },
    ])
  })

  it("should deploy a chart with hotReload enabled", async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const service = graph.getService("api")

    await deployHelmService({
      ctx,
      log: garden.log,
      module: service.module,
      service,
      force: false,
      devMode: false,
      hotReload: true, // <----
      localMode: false,
      runtimeContext: emptyRuntimeContext,
    })

    const releaseName = getReleaseName(service.module)
    const status = await getReleaseStatus({
      ctx,
      module: service.module,
      service,
      releaseName,
      log: garden.log,
      devMode: false,
      hotReload: true, // <----
    })

    expect(status.state).to.equal("ready")
    expect(status.detail["values"][".garden"]).to.eql({
      moduleName: "api",
      projectName: garden.projectName,
      version: service.version,
      hotReload: true, // <----
    })
  })

  it("should deploy a chart with devMode enabled", async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const service = graph.getService("api")

    const releaseName = getReleaseName(service.module)
    await deployHelmService({
      ctx,
      log: garden.log,
      module: service.module,
      service,
      force: false,
      devMode: true, // <-----
      hotReload: false,
      localMode: false,
      runtimeContext: emptyRuntimeContext,
    })

    const status = await getReleaseStatus({
      ctx,
      module: service.module,
      service,
      releaseName,
      log: garden.log,
      devMode: true, // <-----
      hotReload: false,
    })

    expect(status.state).to.equal("ready")
    expect(status.detail["values"][".garden"]).to.eql({
      moduleName: "api",
      projectName: garden.projectName,
      version: service.version,
      devMode: true,
    })
  })

  it("should deploy a chart with an alternate namespace set", async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const service = graph.getService("chart-with-namespace")

    const namespace = service.module.spec.namespace
    expect(namespace).to.equal(provider.config.namespace!.name + "-extra")

    await deployHelmService({
      ctx,
      log: garden.log,
      module: service.module,
      service,
      force: false,
      devMode: false,
      hotReload: false,
      localMode: false,
      runtimeContext: emptyRuntimeContext,
    })

    const releaseName = getReleaseName(service.module)
    const status = await getReleaseStatus({
      ctx,
      module: service.module,
      service,
      releaseName,
      log: garden.log,
      devMode: false,
      hotReload: false,
    })

    expect(status.state).to.equal("ready")

    const api = await KubeApi.factory(garden.log, ctx, provider)

    // Namespace should exist
    await api.core.readNamespace(namespace)

    // Deployment should exist
    await api.apps.readNamespacedDeployment("chart-with-namespace", namespace)
  })

  it("should mark a chart that has been paused by Garden Cloud AEC as outdated", async () => {
    const fakeCloudApi = new CloudApi(getLogger().placeholder(), "https://test.cloud.garden.io", "project-id")
    const projectRoot = resolve(dataDir, "test-projects", "helm")
    const gardenWithCloudApi = await makeTestGarden(projectRoot, { cloudApi: fakeCloudApi, noCache: true })

    graph = await gardenWithCloudApi.getConfigGraph({ log: gardenWithCloudApi.log, emit: false })
    const providerWithApi = <KubernetesProvider>await garden.resolveProvider(gardenWithCloudApi.log, "local-kubernetes")
    const ctxWithCloudApi = <KubernetesPluginContext>await gardenWithCloudApi.getPluginContext(providerWithApi)

    const service = graph.getService("api")

    const status = await deployHelmService({
      ctx: ctxWithCloudApi,
      log: gardenWithCloudApi.log,
      module: service.module,
      service,
      force: false,
      devMode: false,
      hotReload: false,
      localMode: false,
      runtimeContext: emptyRuntimeContext,
    })

    const releaseName = getReleaseName(service.module)
    const releaseStatus = await getReleaseStatus({
      ctx: ctxWithCloudApi,
      module: service.module,
      service,
      releaseName,
      log: gardenWithCloudApi.log,
      devMode: false,
      hotReload: false,
    })

    expect(releaseStatus.state).to.equal("ready")
    expect(releaseStatus.detail["values"][".garden"]).to.eql({
      moduleName: "api",
      projectName: gardenWithCloudApi.projectName,
      version: service.version,
    })
    expect(status.namespaceStatuses).to.eql([
      {
        pluginName: "local-kubernetes",
        namespaceName: "helm-test-default",
        state: "ready",
      },
    ])

    const api = await KubeApi.factory(gardenWithCloudApi.log, ctxWithCloudApi, ctxWithCloudApi.provider)
    const renderedResources = await getRenderedResources({
      ctx: ctxWithCloudApi,
      module: service.module,
      releaseName,
      log: gardenWithCloudApi.log,
    })
    const workloads = renderedResources.filter(
      (resource) => isWorkload(resource) && resource.metadata.name === "api-release"
    )
    const apiDeployment = (
      await Bluebird.all(
        workloads.map((workload) =>
          api.readBySpec({ log: gardenWithCloudApi.log, namespace: "helm-test-default", manifest: workload })
        )
      )
    )[0]
    const existingAnnotations = apiDeployment.metadata.annotations
    apiDeployment.metadata.annotations = {
      ...existingAnnotations,
      [gardenCloudAECPauseAnnotation]: "paused",
    }

    await api.apps.patchNamespacedDeployment(apiDeployment.metadata?.name, "helm-test-default", apiDeployment)

    const releaseStatusAfterScaleDown = await getReleaseStatus({
      ctx: ctxWithCloudApi,
      module: service.module,
      service,
      releaseName,
      log: gardenWithCloudApi.log,
      devMode: false,
      hotReload: false,
    })
    expect(releaseStatusAfterScaleDown.state).to.equal("outdated")
  })
})
