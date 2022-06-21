/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
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
import {
  KubernetesConfig,
  KubernetesPluginContext,
  ServiceResourceSpec,
} from "../../../../../src/plugins/kubernetes/config"
import {
  getWorkloadPods,
  getServiceResourceSpec,
  getServiceResource,
  getResourceContainer,
  getResourcePodSpec,
} from "../../../../../src/plugins/kubernetes/util"
import { createWorkloadManifest } from "../../../../../src/plugins/kubernetes/container/deployment"
import { emptyRuntimeContext } from "../../../../../src/runtime-context"
import { getHelmTestGarden } from "./helm/common"
import { deline } from "../../../../../src/util/string"
import { getBaseModule, getChartResources } from "../../../../../src/plugins/kubernetes/helm/common"
import { buildHelmModule } from "../../../../../src/plugins/kubernetes/helm/build"
import { LogEntry } from "../../../../../src/logger/log-entry"
import { BuildTask } from "../../../../../src/tasks/build"
import { getContainerTestGarden } from "./container/container"
import { KubernetesDeployment, KubernetesPod, KubernetesWorkload } from "../../../../../src/plugins/kubernetes/types"
import { getAppNamespace } from "../../../../../src/plugins/kubernetes/namespace"

describe("util", () => {
  let helmGarden: TestGarden
  let helmGraph: ConfigGraph
  let ctx: KubernetesPluginContext
  let log: LogEntry
  let api: KubeApi

  before(async () => {
    helmGarden = await getHelmTestGarden()
    log = helmGarden.log
    const provider = await helmGarden.resolveProvider(log, "local-kubernetes")
    ctx = (await helmGarden.getPluginContext(provider)) as KubernetesPluginContext
    helmGraph = await helmGarden.getConfigGraph({ log, emit: false })
    await buildModules()
    api = await KubeApi.factory(helmGarden.log, ctx, ctx.provider)
  })

  beforeEach(async () => {
    helmGraph = await helmGarden.getConfigGraph({ log, emit: false })
  })

  after(async () => {
    return helmGarden && helmGarden.close()
  })

  async function buildModules() {
    const modules = helmGraph.getModules()
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
        const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
        const provider = (await garden.resolveProvider(garden.log, "local-kubernetes")) as Provider<KubernetesConfig>

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
          localModeServiceNames: [],
        })

        const resource = await createWorkloadManifest({
          ctx,
          api,
          provider,
          service,
          runtimeContext: emptyRuntimeContext,
          namespace: provider.config.namespace!.name!,
          enableDevMode: false,
          enableHotReload: false,
          enableLocalMode: false,
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

    it("should read a Pod from a namespace directly when given a Pod manifest", async () => {
      const garden = await getContainerTestGarden("local")

      try {
        const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
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
          localModeServiceNames: [],
        })

        const provider = (await garden.resolveProvider(garden.log, "local-kubernetes")) as Provider<KubernetesConfig>
        await garden.processTasks([deployTask], { throwOnError: true })

        const namespace = await getAppNamespace(ctx, log, provider)
        const allPods = await api.core.listNamespacedPod(namespace)

        const pod = allPods.items[0]

        const pods = await getWorkloadPods(api, namespace, pod)
        expect(pods.length).to.equal(1)
        expect(pods[0].kind).to.equal("Pod")
        expect(pods[0].metadata.name).to.equal(pod.metadata.name)
      } finally {
        await garden.close()
      }
    })
  })

  describe("getServiceResourceSpec", () => {
    it("should return the spec on the given module if it has no base module", async () => {
      const module = helmGraph.getModule("api")
      expect(getServiceResourceSpec(module, undefined)).to.eql(module.spec.serviceResource)
    })

    it("should return the spec on the base module if there is none on the module", async () => {
      const module = helmGraph.getModule("api")
      const baseModule = helmGraph.getModule("postgres")
      module.spec.base = "postgres"
      delete module.spec.serviceResource
      module.buildDependencies = { postgres: baseModule }
      expect(getServiceResourceSpec(module, baseModule)).to.eql(baseModule.spec.serviceResource)
    })

    it("should merge the specs if both module and base have specs", async () => {
      const module = helmGraph.getModule("api")
      const baseModule = helmGraph.getModule("postgres")
      module.spec.base = "postgres"
      module.buildDependencies = { postgres: baseModule }
      expect(getServiceResourceSpec(module, baseModule)).to.eql({
        containerModule: "api-image",
        kind: "Deployment",
        name: "postgres",
      })
    })

    it("should throw if there is no base module and the module has no serviceResource spec", async () => {
      const module = helmGraph.getModule("api")
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
      const module = helmGraph.getModule("api")
      const baseModule = helmGraph.getModule("postgres")
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

  describe("getServiceResource", () => {
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
      const result = await getServiceResource({
        ctx,
        log,
        provider: ctx.provider,
        module,
        manifests,
        resourceSpec: getServiceResourceSpec(module, undefined),
      })
      const expected = find(manifests, (r) => r.kind === "Deployment")
      expect(result).to.eql(expected)
    })

    it("should throw if no resourceSpec or serviceResource is specified", async () => {
      const module = helmGraph.getModule("api")
      const manifests = await getChartResources({
        ctx,
        module,
        devMode: false,
        hotReload: false,
        log,
        version: module.version.versionString,
      })
      delete module.spec.serviceResource
      await expectError(
        () =>
          getServiceResource({
            ctx,
            log,
            provider: ctx.provider,
            module,
            manifests,
            resourceSpec: getServiceResourceSpec(module, undefined),
          }),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(
            deline`helm module api doesn't specify a serviceResource in its configuration.
          You must specify a resource in the module config in order to use certain Garden features,
          such as hot reloading, tasks and tests.`
          )
      )
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
          getServiceResource({
            ctx,
            log,
            provider: ctx.provider,
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
          getServiceResource({
            ctx,
            log,
            provider: ctx.provider,
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

      await expectError(
        () =>
          getServiceResource({
            ctx,
            log,
            provider: ctx.provider,
            module,
            manifests,
            resourceSpec: getServiceResourceSpec(module, undefined),
          }),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(
            "helm module api contains multiple Deployments. You must specify a resource name in the appropriate config in order to identify the correct Deployment to use."
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
      module.spec.serviceResource.name = `{{ template "postgresql.primary.fullname" . }}`
      const result = await getServiceResource({
        ctx,
        log,
        provider: ctx.provider,
        module,
        manifests,
        resourceSpec: getServiceResourceSpec(module, undefined),
      })
      const expected = find(manifests, (r) => r.kind === "StatefulSet")
      expect(result).to.eql(expected)
    })

    context("podSelector", () => {
      before(async () => {
        const service = helmGraph.getService("api")

        const deployTask = new DeployTask({
          force: false,
          forceBuild: false,
          garden: helmGarden,
          graph: helmGraph,
          log: helmGarden.log,
          service,
          devModeServiceNames: [],
          hotReloadServiceNames: [],
          localModeServiceNames: [],
        })

        await helmGarden.processTasks([deployTask], { throwOnError: true })
      })

      it("returns running Pod if one is found matching podSelector", async () => {
        const module = helmGraph.getModule("api")
        const resourceSpec: ServiceResourceSpec = {
          podSelector: {
            "app.kubernetes.io/name": "api",
            "app.kubernetes.io/instance": "api-release",
          },
        }

        const pod = await getServiceResource({
          ctx,
          log,
          provider: ctx.provider,
          module,
          manifests: [],

          resourceSpec,
        })

        expect(pod.kind).to.equal("Pod")
        expect(pod.metadata.labels?.["app.kubernetes.io/name"]).to.equal("api")
        expect(pod.metadata.labels?.["app.kubernetes.io/instance"]).to.equal("api-release")
      })

      it("throws if podSelector is set and no Pod is found matching the selector", async () => {
        const module = helmGraph.getModule("api")
        const resourceSpec: ServiceResourceSpec = {
          podSelector: {
            "app.kubernetes.io/name": "boo",
            "app.kubernetes.io/instance": "foo",
          },
        }

        await expectError(
          () =>
            getServiceResource({
              ctx,
              log,
              provider: ctx.provider,
              module,
              manifests: [],

              resourceSpec,
            }),
          (err) =>
            expect(stripAnsi(err.message)).to.equal(
              "Could not find any Pod matching provided podSelector (app.kubernetes.io/name=boo,app.kubernetes.io/instance=foo) for resource in helm module api"
            )
        )
      })
    })
  })

  describe("getResourcePodSpec", () => {
    it("should return the spec for a Pod resource", () => {
      const pod: KubernetesPod = {
        apiVersion: "v1",
        kind: "Pod",
        metadata: {
          name: "foo",
          namespace: "bar",
        },
        spec: {
          containers: [
            {
              name: "main",
            },
          ],
        },
      }
      expect(getResourcePodSpec(pod)).to.equal(pod.spec)
    })

    it("should returns the Pod template spec for a Deployment", () => {
      const deployment: KubernetesDeployment = {
        apiVersion: "v1",
        kind: "Deployment",
        metadata: {
          name: "foo",
          namespace: "bar",
        },
        spec: {
          selector: {},
          template: {
            spec: {
              containers: [
                {
                  name: "main",
                },
              ],
            },
          },
        },
      }
      expect(getResourcePodSpec(deployment)).to.equal(deployment.spec.template.spec)
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
      return <KubernetesWorkload>find(manifests, (r) => r.kind === "Deployment")!
    }

    it("should get the first container on the resource if no name is specified", async () => {
      const deployment = await getDeployment()
      const expected = deployment.spec.template?.spec!.containers[0]
      expect(getResourceContainer(deployment)).to.equal(expected)
    })

    it("should pick the container by name if specified", async () => {
      const deployment = await getDeployment()
      const expected = deployment.spec.template?.spec!.containers[0]
      expect(getResourceContainer(deployment, "api")).to.equal(expected)
    })

    it("should return a container from a Pod resource", async () => {
      const pod: KubernetesPod = {
        apiVersion: "v1",
        kind: "Pod",
        metadata: {
          name: "foo",
          namespace: "bar",
        },
        spec: {
          containers: [
            {
              name: "main",
            },
          ],
        },
      }
      const expected = pod.spec!.containers[0]
      expect(getResourceContainer(pod)).to.equal(expected)
    })

    it("should throw if no containers are in resource", async () => {
      const deployment = await getDeployment()
      deployment.spec.template!.spec!.containers = []
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
