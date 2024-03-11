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
import { helmDeploy } from "../../../../../../src/plugins/kubernetes/helm/deployment.js"
import type { KubernetesPluginContext, KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config.js"
import {
  gardenCloudAECPauseAnnotation,
  getReleaseStatus,
  getRenderedResources,
} from "../../../../../../src/plugins/kubernetes/helm/status.js"
import { getReleaseName } from "../../../../../../src/plugins/kubernetes/helm/common.js"
import { KubeApi } from "../../../../../../src/plugins/kubernetes/api.js"
import { buildHelmModules, getHelmLocalModeTestGarden, getHelmTestGarden } from "./common.js"
import type { ConfigGraph } from "../../../../../../src/graph/config-graph.js"
import { isWorkload } from "../../../../../../src/plugins/kubernetes/util.js"
import { getRootLogger } from "../../../../../../src/logger/logger.js"
import { LocalModeProcessRegistry, ProxySshKeystore } from "../../../../../../src/plugins/kubernetes/local-mode.js"
import type { HelmDeployAction } from "../../../../../../src/plugins/kubernetes/helm/config.js"
import { createActionLog } from "../../../../../../src/logger/log-entry.js"
import type { NamespaceStatus } from "../../../../../../src/types/namespace.js"
import { FakeCloudApi } from "../../../../../helpers/api.js"

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
      garden.close()
    }
  })

  afterEach(async () => {
    // shut down local app and tunnels to avoid retrying after redeploy
    LocalModeProcessRegistry.getInstance().shutdown()
  })

  // TODO-G2
  it.skip("should deploy a chart with local mode enabled", async () => {
    graph = await garden.getConfigGraph({
      log: garden.log,
      emit: false,
      actionModes: { local: ["deploy.backend"] }, // <-----
    })
    const action = await garden.resolveAction<HelmDeployAction>({
      action: graph.getDeploy("backend"),
      log: garden.log,
      graph,
    })
    const actionLog = createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind })

    const releaseName = getReleaseName(action)
    await helmDeploy({
      ctx,
      log: actionLog,
      action,
      force: false,
    })

    const status = await getReleaseStatus({
      ctx,
      action,
      releaseName,
      log: garden.log,
    })

    expect(status.state).to.equal("ready")
    expect(status.mode).to.equal("local")
    expect(status.detail["values"][".garden"]).to.eql({
      moduleName: "backend",
      projectName: garden.projectName,
      version: action.versionString(),
      mode: "local",
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
    // https://app.circleci.com/pipelines/github/garden-io/garden/15885/workflows/6026638c-7544-45a8-bc07-16f8963c5b9f/jobs/265663?invite=true#step-113-577
    // sometimes the release is already purged
    try {
      const actions = await garden.getActionRouter()
      await actions.deleteDeploys({ graph, log: garden.log })
      if (garden) {
        garden.close()
      }
    } catch {}
  })

  it("should deploy a chart", async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const action = await garden.resolveAction<HelmDeployAction>({
      action: graph.getDeploy("api"),
      log: garden.log,
      graph,
    })
    const actionLog = createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind })

    // Here, we're not going through a router, so we listen for the `namespaceStatus` event directly.
    let namespaceStatus: NamespaceStatus | null = null
    ctx.events.once("namespaceStatus", (status) => (namespaceStatus = status))
    await helmDeploy({
      ctx,
      log: actionLog,
      action,
      force: false,
    })
    expect(namespaceStatus).to.exist
    expect(namespaceStatus!.namespaceName).to.eql("helm-test-default")

    const releaseName = getReleaseName(action)
    const releaseStatus = await getReleaseStatus({
      ctx,
      action,
      releaseName,
      log: garden.log,
    })

    expect(releaseStatus.state).to.equal("ready")
    expect(releaseStatus.detail["values"][".garden"]).to.eql({
      moduleName: "api",
      projectName: garden.projectName,
      version: action.versionString(),
      mode: "default",
    })
  })

  it("should deploy a chart from a converted Helm module referencing a container module version in its image tag", async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const action = await garden.resolveAction<HelmDeployAction>({
      action: graph.getDeploy("api-module"),
      log: garden.log,
      graph,
    })
    const actionLog = createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind })

    // Here, we're not going through a router, so we listen for the `namespaceStatus` event directly.
    let namespaceStatus: NamespaceStatus | null = null
    ctx.events.once("namespaceStatus", (status) => (namespaceStatus = status))
    await helmDeploy({
      ctx,
      log: actionLog,
      action,
      force: false,
    })
    expect(namespaceStatus).to.exist
    expect(namespaceStatus!.namespaceName).to.eql("helm-test-default")

    const releaseName = getReleaseName(action)
    const releaseStatus = await getReleaseStatus({
      ctx,
      action,
      releaseName,
      log: garden.log,
    })

    expect(releaseStatus.state).to.equal("ready")
    expect(releaseStatus.detail["values"][".garden"]).to.eql({
      moduleName: "api-module",
      projectName: garden.projectName,
      version: action.versionString(),
      mode: "default",
    })
  })

  it("should deploy a chart with sync enabled", async () => {
    graph = await garden.getConfigGraph({
      log: garden.log,
      emit: false,
      actionModes: { sync: ["deploy.api"] }, // <-----
    })
    const action = await garden.resolveAction<HelmDeployAction>({
      action: graph.getDeploy("api"),
      log: garden.log,
      graph,
    })
    const actionLog = createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind })

    const releaseName = getReleaseName(action)
    await helmDeploy({
      ctx,
      log: actionLog,
      action,
      force: false,
    })

    const status = await getReleaseStatus({
      ctx,
      action,
      releaseName,
      log: garden.log,
    })

    expect(status.state).to.equal("ready")
    expect(status.detail.mode).to.eql("sync")
    expect(status.detail["values"][".garden"]).to.eql({
      moduleName: "api",
      projectName: garden.projectName,
      version: action.versionString(),
      mode: "sync",
    })
  })

  it("should deploy a chart with an alternate namespace set", async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const action = await garden.resolveAction<HelmDeployAction>({
      action: graph.getDeploy("chart-with-namespace"),
      log: garden.log,
      graph,
    })
    const actionLog = createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind })

    const namespace = action.getSpec().namespace!
    expect(namespace).to.equal(provider.config.namespace!.name + "-extra")

    await helmDeploy({
      ctx,
      log: actionLog,
      action,
      force: false,
    })

    const releaseName = getReleaseName(action)
    const status = await getReleaseStatus({
      ctx,
      action,
      releaseName,
      log: garden.log,
    })

    expect(status.state).to.equal("ready")

    const api = await KubeApi.factory(garden.log, ctx, provider)

    // Namespace should exist
    await api.core.readNamespace({ name: namespace })

    // Deployment should exist
    await api.apps.readNamespacedDeployment({ name: "chart-with-namespace", namespace })
  })

  it("should mark a chart that has been paused by Garden Cloud AEC as outdated", async () => {
    const log = getRootLogger().createLog()
    const fakeCloudApi = await FakeCloudApi.factory({ log })

    const projectRoot = getDataDir("test-projects", "helm")
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
    const actionLog = createActionLog({ log: gardenWithCloudApi.log, actionName: action.name, actionKind: action.kind })

    await helmDeploy({
      ctx: ctxWithCloudApi,
      log: actionLog,
      action,
      force: false,
    })

    const releaseName = getReleaseName(action)
    const releaseStatus = await getReleaseStatus({
      ctx: ctxWithCloudApi,
      action,
      releaseName,
      log: gardenWithCloudApi.log,
    })

    expect(releaseStatus.state).to.equal("ready")
    expect(releaseStatus.detail["values"][".garden"]).to.eql({
      moduleName: "api",
      projectName: gardenWithCloudApi.projectName,
      version: action.versionString(),
      mode: "default",
    })

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
      await Promise.all(
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

    await api.apps.patchNamespacedDeployment({
      name: apiDeployment.metadata?.name,
      namespace: "helm-test-default",
      body: apiDeployment,
    })

    const releaseStatusAfterScaleDown = await getReleaseStatus({
      ctx: ctxWithCloudApi,
      action,
      releaseName,
      log: gardenWithCloudApi.log,
    })
    expect(releaseStatusAfterScaleDown.state).to.equal("outdated")
  })
})
