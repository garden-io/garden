/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import { TestGarden, getDataDir, makeTestGarden } from "../../../../../helpers"
import { deployHelmService } from "../../../../../../src/plugins/kubernetes/helm/deployment"
import { Provider } from "../../../../../../src/config/provider"
import { emptyRuntimeContext } from "../../../../../../src/runtime-context"
import { KubernetesPluginContext } from "../../../../../../src/plugins/kubernetes/config"
import { getReleaseStatus } from "../../../../../../src/plugins/kubernetes/helm/status"
import { getReleaseName } from "../../../../../../src/plugins/kubernetes/helm/common"
import { Service } from "../../../../../../src/types/service"
import { BuildTask } from "../../../../../../src/tasks/build"
import { DEFAULT_API_VERSION } from "../../../../../../src/constants"
import { defaultDotIgnoreFiles } from "../../../../../../src/util/fs"

describe("deployHelmService", () => {
  let garden: TestGarden
  let provider: Provider
  let ctx: KubernetesPluginContext
  let service: Service

  before(async () => {
    const projectRoot = getDataDir("test-projects", "helm")
    garden = await makeTestGarden(projectRoot, {
      config: {
        apiVersion: DEFAULT_API_VERSION,
        kind: "Project",
        name: "helm-deploy-test",
        path: projectRoot,
        defaultEnvironment: "local",
        environments: [{ name: "local", variables: {} }],
        dotIgnoreFiles: defaultDotIgnoreFiles,
        providers: [{ name: "local-kubernetes" }],
        variables: {},
      },
    })
    provider = await garden.resolveProvider("local-kubernetes")
    ctx = garden.getPluginContext(provider) as KubernetesPluginContext
    const graph = await garden.getConfigGraph(garden.log)
    service = await graph.getService("api")
    await garden.processTasks([
      ...(await BuildTask.factory({
        garden,
        log: garden.log,
        module: service.module,
        force: false,
      })),
      ...(await BuildTask.factory({
        garden,
        log: garden.log,
        module: await graph.getModule("api-image"),
        force: false,
      })),
    ])
  })

  after(async () => {
    const actions = await garden.getActionRouter()
    await actions.deleteService({ log: garden.log, service })
  })

  it("should deploy a chart", async () => {
    await deployHelmService({
      ctx,
      log: garden.log,
      module: service.module,
      service,
      force: false,
      hotReload: false,
      runtimeContext: emptyRuntimeContext,
    })

    const releaseName = getReleaseName(service.module)
    const status = await getReleaseStatus(ctx, service.module, releaseName, garden.log, false)

    expect(status.state).to.equal("ready")
    expect(status.detail["values"][".garden"]).to.eql({
      moduleName: "api",
      projectName: garden.projectName,
      version: service.module.version.versionString,
    })
  })

  it("should deploy a chart with hotReload enabled", async () => {
    await deployHelmService({
      ctx,
      log: garden.log,
      module: service.module,
      service,
      force: false,
      hotReload: true,
      runtimeContext: emptyRuntimeContext,
    })

    const releaseName = getReleaseName(service.module)
    const status = await getReleaseStatus(ctx, service.module, releaseName, garden.log, true)

    expect(status.state).to.equal("ready")
    expect(status.detail["values"][".garden"]).to.eql({
      moduleName: "api",
      projectName: garden.projectName,
      version: service.module.version.versionString,
      hotReload: true,
    })
  })
})
