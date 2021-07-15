/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { flatten, find, first } from "lodash"
import stripAnsi from "strip-ansi"
import { TestGarden, expectError } from "../../../../helpers"
import { ConfigGraph } from "../../../../../src/config-graph"
import { Provider } from "../../../../../src/config/provider"
import { DeployTask } from "../../../../../src/tasks/deploy"
import { KubeApi } from "../../../../../src/plugins/kubernetes/api"
import { KubernetesConfig, KubernetesPluginContext } from "../../../../../src/plugins/kubernetes/config"
import {
  getWorkloadPods,
  getServiceResourceSpec,
  findServiceResource,
  getResourceContainer,
} from "../../../../../src/plugins/kubernetes/util"
import { createWorkloadManifest } from "../../../../../src/plugins/kubernetes/container/deployment"
import { emptyRuntimeContext } from "../../../../../src/runtime-context"
import { getHelmTestGarden } from "./helm/common"
import { deline } from "../../../../../src/util/string"
import { getBaseModule, getChartResources } from "../../../../../src/plugins/kubernetes/helm/common"
import { buildHelmModule } from "../../../../../src/plugins/kubernetes/helm/build"
import { HotReloadableResource } from "../../../../../src/plugins/kubernetes/hot-reload/hot-reload"
import { LogEntry } from "../../../../../src/logger/log-entry"
import { BuildTask } from "../../../../../src/tasks/build"
import { getContainerTestGarden } from "./container/container"

describe("util", () => {
  let helmGarden: TestGarden
  let helmGraph: ConfigGraph
  let ctx: KubernetesPluginContext
  let log: LogEntry

  before(async () => {
    helmGarden = await getHelmTestGarden()
    log = helmGarden.log
    const provider = await helmGarden.resolveProvider(log, "local-kubernetes")
    ctx = (await helmGarden.getPluginContext(provider)) as KubernetesPluginContext
    helmGraph = await helmGarden.getConfigGraph(log)
    await buildModules()
  })

  beforeEach(async () => {
    helmGraph = await helmGarden.getConfigGraph(log)
  })

  after(async () => {
    return helmGarden && helmGarden.close()
  })

  async function buildModules() {
    const modules = await helmGraph.getModules()
    const tasks = modules.map(
      (module) => new BuildTask({ garden: helmGarden, graph: helmGraph, log, module, force: false, _guard: true })
    )
    const results = await helmGarden.processTasks(tasks)

    const err = first(Object.values(results).map((r) => r && r.error))

    if (err) {
      throw err
    }
  }

  // TODO: Add more test cases
  describe("getWorkloadPods", () => {
    it("should return workload pods", async () => {
      const garden = await getContainerTestGarden("local")

      try {
        const graph = await garden.getConfigGraph(garden.log)
        const provider = (await garden.resolveProvider(garden.log, "local-kubernetes")) as Provider<KubernetesConfig>
        const api = await KubeApi.factory(garden.log, ctx, provider)

        const service = graph.getService("simple-service")

        const deployTask = new DeployTask({
          force: false,
          forceBuild: false,
          garden,
          graph,
          log: garden.log,
          service,
          devModeServiceNames: [],
          hotReloadServiceNames: [],
        })

        const resource = await createWorkloadManifest({
          api,
          provider,
          service,
          runtimeContext: emptyRuntimeContext,
          namespace: provider.config.namespace!.name!,
          enableDevMode: false,
          enableHotReload: false,
          log: garden.log,
          production: false,
          blueGreen: false,
        })
        await garden.processTasks([deployTask], { throwOnError: true })

        const pods = await getWorkloadPods(api, "container", resource)
        const services = flatten(pods.map((pod) => pod.spec.containers.map((container) => container.name)))
        expect(services).to.eql(["simple-service"])
      } finally {
        await garden.close()
      }
    })
  })

  describe("getServiceResourceSpec", () => {
    it("should return the spec on the given module if it has no base module", async () => {
      const module = await helmGraph.getModule("api")
      expect(getServiceResourceSpec(module, undefined)).to.eql(module.spec.serviceResource)
    })

    it("should return the spec on the base module if there is none on the module", async () => {
      const module = await helmGraph.getModule("api")
      const baseModule = await helmGraph.getModule("postgres")
      module.spec.base = "postgres"
      delete module.spec.serviceResource
      module.buildDependencies = { postgres: baseModule }
      expect(getServiceResourceSpec(module, baseModule)).to.eql(baseModule.spec.serviceResource)
    })

    it("should merge the specs if both module and base have specs", async () => {
      const module = await helmGraph.getModule("api")
      const baseModule = await helmGraph.getModule("postgres")
      module.spec.base = "postgres"
      module.buildDependencies = { postgres: baseModule }
      expect(getServiceResourceSpec(module, baseModule)).to.eql({
        containerModule: "api-image",
        kind: "Deployment",
        name: "postgres",
      })
    })

    it("should throw if there is no base module and the module has no serviceResource spec", async () => {
      const module = await helmGraph.getModule("api")
      delete module.spec.serviceResource
      await expectError(
        () => getServiceResourceSpec(module, undefined),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(
            deline`helm module api doesn't specify a serviceResource in its configuration.
          You must specify a resource in the module config in order to use certain Garden features,
          such as hot reloading, tasks and tests.`
          )
      )
    })

    it("should throw if there is a base module but neither module has a spec", async () => {
      const module = await helmGraph.getModule("api")
      const baseModule = await helmGraph.getModule("postgres")
      module.spec.base = "postgres"
      module.buildDependencies = { postgres: baseModule }
      delete module.spec.serviceResource
      delete baseModule.spec.serviceResource
      await expectError(
        () => getServiceResourceSpec(module, getBaseModule(module)),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(
            deline`helm module api doesn't specify a serviceResource in its configuration.
          You must specify a resource in the module config in order to use certain Garden features,
          such as hot reloading, tasks and tests.`
          )
      )
    })
  })

  describe("findServiceResource", () => {
    it("should return the resource specified by serviceResource", async () => {
      const module = helmGraph.getModule("api")
      const manifests = await getChartResources({
        ctx,
        module,
        devMode: false,
        hotReload: false,
        log,
        version: module.version.versionString,
      })
      const resourceSpec = await getServiceResourceSpec(module, undefined)
      const result = await findServiceResource({
        ctx,
        log,
        module,
        manifests,
        resourceSpec,
      })
      const expected = find(manifests, (r) => r.kind === "Deployment")
      expect(result).to.eql(expected)
    })

    it("should throw if no resource of the specified kind is in the chart", async () => {
      const module = helmGraph.getModule("api")
      const manifests = await getChartResources({
        ctx,
        module,
        devMode: false,
        hotReload: false,
        log,
        version: module.version.versionString,
      })
      const resourceSpec = {
        ...module.spec.serviceResource,
        kind: "DaemonSet",
      }
      await expectError(
        () =>
          findServiceResource({
            ctx,
            log,
            module,
            manifests,
            resourceSpec,
          }),
        (err) => expect(stripAnsi(err.message)).to.equal("helm module api contains no DaemonSets.")
      )
    })

    it("should throw if matching resource is not found by name", async () => {
      const module = helmGraph.getModule("api")
      const manifests = await getChartResources({
        ctx,
        module,
        devMode: false,
        hotReload: false,
        log,
        version: module.version.versionString,
      })
      const resourceSpec = {
        ...module.spec.serviceResource,
        name: "foo",
      }
      await expectError(
        () =>
          findServiceResource({
            ctx,
            log,
            module,
            manifests,
            resourceSpec,
          }),
        (err) => expect(stripAnsi(err.message)).to.equal("helm module api does not contain specified Deployment foo")
      )
    })

    it("should throw if no name is specified and multiple resources are matched", async () => {
      const module = helmGraph.getModule("api")
      const manifests = await getChartResources({
        ctx,
        module,
        devMode: false,
        hotReload: false,
        log,
        version: module.version.versionString,
      })
      const deployment = find(manifests, (r) => r.kind === "Deployment")
      manifests.push(deployment!)
      const resourceSpec = getServiceResourceSpec(module, undefined)
      await expectError(
        () => findServiceResource({ ctx, log, module, manifests, resourceSpec }),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(
            "helm module api contains multiple Deployments. You must specify resource.name or serviceResource.name in the module config in order to identify the correct Deployment to use."
          )
      )
    })

    it("should resolve template string for resource name", async () => {
      const module = helmGraph.getModule("postgres")
      await buildHelmModule({ ctx, module, log })
      const manifests = await getChartResources({
        ctx,
        module,
        devMode: false,
        hotReload: false,
        log,
        version: module.version.versionString,
      })
      module.spec.serviceResource.name = `{{ template "postgresql.master.fullname" . }}`
      const resourceSpec = getServiceResourceSpec(module, undefined)
      const result = await findServiceResource({
        ctx,
        log,
        module,
        manifests,
        resourceSpec,
      })
      const expected = find(manifests, (r) => r.kind === "StatefulSet")
      expect(result).to.eql(expected)
    })
  })

  describe("getResourceContainer", () => {
    async function getDeployment() {
      const module = helmGraph.getModule("api")
      const manifests = await getChartResources({
        ctx,
        module,
        devMode: false,
        hotReload: false,
        log,
        version: module.version.versionString,
      })
      return <HotReloadableResource>find(manifests, (r) => r.kind === "Deployment")!
    }

    it("should get the first container on the resource if no name is specified", async () => {
      const deployment = await getDeployment()
      const expected = deployment.spec.template.spec!.containers[0]
      expect(getResourceContainer(deployment)).to.equal(expected)
    })

    it("should pick the container by name if specified", async () => {
      const deployment = await getDeployment()
      const expected = deployment.spec.template.spec!.containers[0]
      expect(getResourceContainer(deployment, "api")).to.equal(expected)
    })

    it("should throw if no containers are in resource", async () => {
      const deployment = await getDeployment()
      deployment.spec.template.spec!.containers = []
      await expectError(
        () => getResourceContainer(deployment),
        (err) => expect(err.message).to.equal("Deployment api-release has no containers configured.")
      )
    })

    it("should throw if name is specified and no containers match", async () => {
      const deployment = await getDeployment()
      await expectError(
        () => getResourceContainer(deployment, "foo"),
        (err) => expect(err.message).to.equal("Could not find container 'foo' in Deployment 'api-release'")
      )
    })
  })
})
