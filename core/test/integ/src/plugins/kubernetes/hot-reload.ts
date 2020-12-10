/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import { TestGarden, expectError } from "../../../../helpers"
import { deline } from "../../../../../src/util/string"
import { ConfigGraph } from "../../../../../src/config-graph"
import { getHelmTestGarden, buildHelmModules } from "./helm/common"
import { getChartResources } from "../../../../../src/plugins/kubernetes/helm/common"
import { PluginContext } from "../../../../../src/plugin-context"
import { KubernetesProvider } from "../../../../../src/plugins/kubernetes/config"
import { findServiceResource, getServiceResourceSpec } from "../../../../../src/plugins/kubernetes/util"
import {
  getHotReloadSpec,
  getHotReloadContainerName,
  configureHotReload,
} from "../../../../../src/plugins/kubernetes/hot-reload/helpers"

describe("getHotReloadSpec", () => {
  let garden: TestGarden
  let graph: ConfigGraph

  before(async () => {
    garden = await getHelmTestGarden()
    graph = await garden.getConfigGraph(garden.log)
    await buildHelmModules(garden, graph)
  })

  beforeEach(async () => {
    graph = await garden.getConfigGraph(garden.log)
  })

  it("should retrieve the hot reload spec on the service's source module", async () => {
    const service = graph.getService("api")
    expect(getHotReloadSpec(service)).to.eql({
      sync: [
        {
          source: "*",
          target: "/app",
        },
      ],
    })
  })

  it("should throw if the module doesn't specify serviceResource.imageModule", async () => {
    const service = graph.getService("api")
    delete service.module.spec.serviceResource.imageModule
    await expectError(
      () => getHotReloadSpec(service),
      (err) =>
        expect(err.message).to.equal(
          "Module 'api' must specify `serviceResource.imageModule` in order to enable hot-reloading."
        )
    )
  })

  it("should throw if the referenced module is not a container module", async () => {
    const service = graph.getService("api")
    const otherModule = graph.getModule("postgres")
    service.sourceModule = otherModule
    await expectError(
      () => getHotReloadSpec(service),
      (err) =>
        expect(err.message).to.equal(deline`
        Module 'api-image', referenced on module 'api' under \`serviceResource.imageModule\`,
        is not a container module. Please specify the appropriate container module that contains
        the sources for the resource.
      `)
    )
  })

  it("should throw if the referenced module is not configured for hot reloading", async () => {
    const service = graph.getService("api")
    delete service.sourceModule.spec.hotReload
    await expectError(
      () => getHotReloadSpec(service),
      (err) =>
        expect(err.message).to.equal(deline`
        Module 'api-image', referenced on module 'api' under \`serviceResource.imageModule\`,
        is not configured for hot-reloading. Please specify \`hotReload\` on the 'api-image'
        module in order to enable hot-reloading.
      `)
    )
  })
})

describe("configureHotReload", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let provider: KubernetesProvider
  let ctx: PluginContext

  before(async () => {
    garden = await getHelmTestGarden()
    provider = <KubernetesProvider>await garden.resolveProvider(garden.log, "local-kubernetes")
    ctx = await garden.getPluginContext(provider)
  })

  beforeEach(async () => {
    graph = await garden.getConfigGraph(garden.log)
  })

  it("should only mount the sync volume on the main/resource container", async () => {
    const log = garden.log
    const service = graph.getService("two-containers")
    const module = service.module
    const manifests = await getChartResources(ctx, module, true, log)
    const resourceSpec = getServiceResourceSpec(module, undefined)
    const hotReloadSpec = getHotReloadSpec(service)
    const hotReloadTarget = await findServiceResource({
      ctx,
      log,
      module,
      manifests,
      resourceSpec,
      baseModule: undefined,
    })
    const containerName = getHotReloadContainerName(module)
    configureHotReload({
      containerName,
      hotReloadSpec,
      target: hotReloadTarget,
    })
    const containers: any[] = hotReloadTarget.spec.template.spec?.containers || []
    // This is a second, non-main/resource container included by the Helm chart, which should not mount the sync volume.
    const secondContainer = containers.find((c) => c.name === "second-container")

    expect(secondContainer.volumeMounts || []).to.be.empty
  })
})
