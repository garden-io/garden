/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import { dataDir, makeTestGarden, TestGarden } from "../../../../../helpers"
import { helmDeploy } from "../../../../../../src/plugins/kubernetes/helm/deployment"
import { KubernetesPluginContext, KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config"
import {
  gardenCloudAECPauseAnnotation,
  getReleaseStatus,
  getRenderedResources,
} from "../../../../../../src/plugins/kubernetes/helm/status"
import { getReleaseName } from "../../../../../../src/plugins/kubernetes/helm/common"
import { KubeApi } from "../../../../../../src/plugins/kubernetes/api"
import { buildHelmModules, getHelmLocalModeTestGarden, getHelmTestGarden } from "./common"
import { ConfigGraph } from "../../../../../../src/graph/config-graph"
import { isWorkload } from "../../../../../../src/plugins/kubernetes/util"
import Bluebird from "bluebird"
import { CloudApi } from "../../../../../../src/cloud/api"
import { resolve } from "path"
import { getLogger } from "../../../../../../src/logger/logger"
import { LocalModeProcessRegistry, ProxySshKeystore } from "../../../../../../src/plugins/kubernetes/local-mode"
import { HelmDeployAction } from "../../../../../../src/plugins/kubernetes/helm/config"

describe("helmDeploy in local-mode", () => {
  let garden: TestGarden
  let provider: KubernetesProvider
  let ctx: KubernetesPluginContext
  let graph: ConfigGraph

  before(async () => {
    garden = await getHelmLocalModeTestGarden()
    provider = <KubernetesProvider>await garden.resolveProvider(garden.log, "local-kubernetes")
    ctx = <KubernetesPluginContext>(
      await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
    )
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    await buildHelmModules(garden, graph)
  })

  after(async () => {
    LocalModeProcessRegistry.getInstance().shutdown()
    ProxySshKeystore.getInstance(garden.log).shutdown(garden.log)
    const actions = await garden.getActionRouter()
    await actions.deleteDeploys({ graph, log: garden.log })
    if (garden) {
      await garden.close()
    }
  })

  afterEach(async () => {
    // shut down local app and tunnels to avoid retrying after redeploy
    LocalModeProcessRegistry.getInstance().shutdown()
  })

  it("should deploy a chart with localMode enabled", async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const action = await garden.resolveAction<HelmDeployAction>({
      action: graph.getDeploy("backend"),
      log: garden.log,
      graph,
    })

    const releaseName = getReleaseName(action)
    await helmDeploy({
      ctx,
      log: garden.log,
      action,
      force: false,
      devMode: false,
      localMode: true, // <-----
    })

    const status = await getReleaseStatus({
      ctx,
      action,
      releaseName,
      log: garden.log,
      devMode: false,
      localMode: true, // <-----
    })

    expect(status.state).to.equal("ready")
    expect(status.localMode).to.be.true
    expect(status.devMode).to.be.false
    expect(status.detail["values"][".garden"]).to.eql({
      moduleName: "backend",
      projectName: garden.projectName,
      version: action.versionString(),
      localMode: true,
    })
  })

  it("localMode should always take precedence over devMode", async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const action = await garden.resolveAction<HelmDeployAction>({
      action: graph.getDeploy("backend"),
      log: garden.log,
      graph,
    })

    const releaseName = getReleaseName(action)
    await helmDeploy({
      ctx,
      log: garden.log,
      action,
      force: false,
      devMode: true, // <-----
      localMode: true, // <-----
    })

    const status = await getReleaseStatus({
      ctx,
      action,
      releaseName,
      log: garden.log,
      devMode: false,
      localMode: true, // <-----
    })

    expect(status.state).to.equal("ready")
    expect(status.localMode).to.be.true
    expect(status.devMode).to.be.false
    expect(status.detail["values"][".garden"]).to.eql({
      moduleName: "backend",
      projectName: garden.projectName,
      version: action.versionString(),
      localMode: true,
    })
  })
})

describe("helmDeploy", () => {
  let garden: TestGarden
  let provider: KubernetesProvider
  let ctx: KubernetesPluginContext
  let graph: ConfigGraph

  before(async () => {
    garden = await getHelmTestGarden()
    provider = <KubernetesProvider>await garden.resolveProvider(garden.log, "local-kubernetes")
    ctx = <KubernetesPluginContext>(
      await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
    )
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    await buildHelmModules(garden, graph)
  })

  after(async () => {
    const actions = await garden.getActionRouter()
    await actions.deleteDeploys({ graph, log: garden.log })
    if (garden) {
      await garden.close()
    }
  })

  it("should deploy a chart", async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const action = await garden.resolveAction<HelmDeployAction>({
      action: graph.getDeploy("api"),
      log: garden.log,
      graph,
    })

    const status = await helmDeploy({
      ctx,
      log: garden.log,
      action,
      force: false,
      devMode: false,
      localMode: false,
    })

    const releaseName = getReleaseName(action)
    const releaseStatus = await getReleaseStatus({
      ctx,
      action,
      releaseName,
      log: garden.log,
      devMode: false,
      localMode: false,
    })

    expect(releaseStatus.state).to.equal("ready")
    expect(releaseStatus.detail["values"][".garden"]).to.eql({
      moduleName: "api",
      projectName: garden.projectName,
      version: action.versionString(),
    })
    expect(status.detail?.namespaceStatuses).to.eql([
      {
        pluginName: "local-kubernetes",
        namespaceName: "helm-test-default",
        state: "ready",
      },
    ])
  })

  it("should deploy a chart with devMode enabled", async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const action = await garden.resolveAction<HelmDeployAction>({
      action: graph.getDeploy("api"),
      log: garden.log,
      graph,
    })

    const releaseName = getReleaseName(action)
    await helmDeploy({
      ctx,
      log: garden.log,
      action,
      force: false,
      devMode: true, // <-----
      localMode: false,
    })

    const status = await getReleaseStatus({
      ctx,
      action,
      releaseName,
      log: garden.log,
      devMode: true, // <-----
      localMode: false,
    })

    expect(status.state).to.equal("ready")
    expect(status.detail["values"][".garden"]).to.eql({
      moduleName: "api",
      projectName: garden.projectName,
      version: action.versionString(),
      devMode: true,
    })
  })

  it("should deploy a chart with an alternate namespace set", async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const action = await garden.resolveAction<HelmDeployAction>({
      action: graph.getDeploy("chart-with-namespace"),
      log: garden.log,
      graph,
    })

    const namespace = action.getSpec().namespace!
    expect(namespace).to.equal(provider.config.namespace!.name + "-extra")

    await helmDeploy({
      ctx,
      log: garden.log,
      action,
      force: false,
      devMode: false,
      localMode: false,
    })

    const releaseName = getReleaseName(action)
    const status = await getReleaseStatus({
      ctx,
      action,
      releaseName,
      log: garden.log,
      devMode: false,
      localMode: false,
    })

    expect(status.state).to.equal("ready")

    const api = await KubeApi.factory(garden.log, ctx, provider)

    // Namespace should exist
    await api.core.readNamespace(namespace)

    // Deployment should exist
    await api.apps.readNamespacedDeployment("chart-with-namespace", namespace)
  })

  it("should mark a chart that has been paused by Garden Cloud AEC as outdated", async () => {
    const fakeCloudApi = new CloudApi(getLogger().placeholder(), "https://test.cloud.garden.io")
    const projectRoot = resolve(dataDir, "test-projects", "helm")
    const gardenWithCloudApi = await makeTestGarden(projectRoot, { cloudApi: fakeCloudApi, noCache: true })

    graph = await gardenWithCloudApi.getConfigGraph({ log: gardenWithCloudApi.log, emit: false })
    const providerWithApi = <KubernetesProvider>await garden.resolveProvider(gardenWithCloudApi.log, "local-kubernetes")
    const ctxWithCloudApi = <KubernetesPluginContext>await gardenWithCloudApi.getPluginContext({
      provider: providerWithApi,
      templateContext: undefined,
      events: undefined,
    })

    const action = await garden.resolveAction<HelmDeployAction>({
      action: graph.getDeploy("api"),
      log: garden.log,
      graph,
    })

    const status = await helmDeploy({
      ctx: ctxWithCloudApi,
      log: gardenWithCloudApi.log,
      action,
      force: false,
      devMode: false,
      localMode: false,
    })

    const releaseName = getReleaseName(action)
    const releaseStatus = await getReleaseStatus({
      ctx: ctxWithCloudApi,
      action,
      releaseName,
      log: gardenWithCloudApi.log,
      devMode: false,
      localMode: false,
    })

    expect(releaseStatus.state).to.equal("ready")
    expect(releaseStatus.detail["values"][".garden"]).to.eql({
      moduleName: "api",
      projectName: gardenWithCloudApi.projectName,
      version: action.versionString(),
    })
    expect(status.detail?.namespaceStatuses).to.eql([
      {
        pluginName: "local-kubernetes",
        namespaceName: "helm-test-default",
        state: "ready",
      },
    ])

    const api = await KubeApi.factory(gardenWithCloudApi.log, ctxWithCloudApi, ctxWithCloudApi.provider)
    const renderedResources = await getRenderedResources({
      ctx: ctxWithCloudApi,
      action,
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
      action,
      releaseName,
      log: gardenWithCloudApi.log,
      devMode: false,
      localMode: false,
    })
    expect(releaseStatusAfterScaleDown.state).to.equal("outdated")
  })
})
