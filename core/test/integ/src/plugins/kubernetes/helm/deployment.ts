/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import { TestGarden } from "../../../../../helpers"
import { deployHelmService } from "../../../../../../src/plugins/kubernetes/helm/deployment"
import { emptyRuntimeContext } from "../../../../../../src/runtime-context"
import { KubernetesPluginContext, KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config"
import { getReleaseStatus } from "../../../../../../src/plugins/kubernetes/helm/status"
import { getReleaseName } from "../../../../../../src/plugins/kubernetes/helm/common"
import { KubeApi } from "../../../../../../src/plugins/kubernetes/api"
import { getHelmTestGarden, buildHelmModules } from "./common"
import { ConfigGraph } from "../../../../../../src/config-graph"

describe("deployHelmService", () => {
  let garden: TestGarden
  let provider: KubernetesProvider
  let ctx: KubernetesPluginContext
  let graph: ConfigGraph

  before(async () => {
    garden = await getHelmTestGarden()
    provider = <KubernetesProvider>await garden.resolveProvider(garden.log, "local-kubernetes")
    ctx = <KubernetesPluginContext>await garden.getPluginContext(provider)
    graph = await garden.getConfigGraph(garden.log)
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
    graph = await garden.getConfigGraph(garden.log)
    const service = graph.getService("api")

    const status = await deployHelmService({
      ctx,
      log: garden.log,
      module: service.module,
      service,
      force: false,
      devMode: false,
      hotReload: false,
      runtimeContext: emptyRuntimeContext,
    })

    const releaseName = getReleaseName(service.module)
    const releaseStatus = await getReleaseStatus({
      ctx,
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
    graph = await garden.getConfigGraph(garden.log)
    const service = graph.getService("api")

    await deployHelmService({
      ctx,
      log: garden.log,
      module: service.module,
      service,
      force: false,
      devMode: false,
      hotReload: true, // <----
      runtimeContext: emptyRuntimeContext,
    })

    const releaseName = getReleaseName(service.module)
    const status = await getReleaseStatus({
      ctx,
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
    graph = await garden.getConfigGraph(garden.log)
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
      runtimeContext: emptyRuntimeContext,
    })

    const status = await getReleaseStatus({
      ctx,
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
    graph = await garden.getConfigGraph(garden.log)
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
      runtimeContext: emptyRuntimeContext,
    })

    const releaseName = getReleaseName(service.module)
    const status = await getReleaseStatus({
      ctx,
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
})
