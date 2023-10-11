/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { flatten, find, first } from "lodash"
import stripAnsi from "strip-ansi"
import { TestGarden, expectError } from "../../../../helpers"
import { ConfigGraph } from "../../../../../src/graph/config-graph"
import { actionFromConfig } from "../../../../../src/graph/actions"
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
  getTargetResource,
  getResourceContainer,
  getResourcePodSpec,
} from "../../../../../src/plugins/kubernetes/util"
import { createWorkloadManifest } from "../../../../../src/plugins/kubernetes/container/deployment"
import { getHelmTestGarden } from "./helm/common"
import { getChartResources } from "../../../../../src/plugins/kubernetes/helm/common"
import { createActionLog, Log } from "../../../../../src/logger/log-entry"
import { BuildTask } from "../../../../../src/tasks/build"
import { getContainerTestGarden } from "./container/container"
import {
  KubernetesDeployment,
  KubernetesPod,
  KubernetesWorkload,
  SyncableKind,
} from "../../../../../src/plugins/kubernetes/types"
import { getAppNamespace } from "../../../../../src/plugins/kubernetes/namespace"
import { convertModules } from "../../../../../src/resolve-module"
import { BuildAction } from "../../../../../src/actions/build"
import { DeployAction } from "../../../../../src/actions/deploy"
import { HelmDeployAction } from "../../../../../src/plugins/kubernetes/helm/config"

describe("util", () => {
  let helmGarden: TestGarden
  let helmGraph: ConfigGraph
  let ctx: KubernetesPluginContext
  let log: Log
  let api: KubeApi

  before(async () => {
    helmGarden = await getHelmTestGarden()
    log = helmGarden.log
    const provider = await helmGarden.resolveProvider(log, "local-kubernetes")
    ctx = (await helmGarden.getPluginContext({
      provider,
      templateContext: undefined,
      events: undefined,
    })) as KubernetesPluginContext
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
    const graph = helmGraph
    const router = await helmGarden.getActionRouter()
    const { actions } = await convertModules(helmGarden, helmGarden.log, modules, graph.moduleGraph)

    const tasks = await Promise.all(
      actions.map(async (rawAction) => {
        const action = (await actionFromConfig({
          garden: helmGarden,
          graph,
          config: rawAction,
          log: helmGarden.log,
          configsByKey: {},
          router,
          mode: "default",
          linkedSources: {},
        })) as BuildAction
        return new BuildTask({
          garden: helmGarden,
          graph: helmGraph,
          log,
          action,
          force: false,
        })
      })
    )
    const results = await helmGarden.processTasks({ tasks })

    const err = first(Object.values(results).map((r) => r && r.error))

    if (err) {
      throw err
    }
  }

  // TODO: Add more test cases
  describe("getWorkloadPods", () => {
    let garden: TestGarden
    let cleanup: (() => void) | undefined

    beforeEach(async () => {
      ;({ garden, cleanup } = await getContainerTestGarden("local"))
    })

    afterEach(async () => {
      if (cleanup) {
        cleanup()
      }
    })

    it("should return workload pods", async () => {
      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const provider = (await garden.resolveProvider(garden.log, "local-kubernetes")) as Provider<KubernetesConfig>

      const rawAction = graph.getDeploy("simple-service")
      const action = await garden.resolveAction({
        action: rawAction,
        log: garden.log,
        graph,
      })

      const deployTask = new DeployTask({
        force: false,
        forceBuild: false,
        garden,
        graph,
        log: garden.log,
        action,
      })

      const resource = await createWorkloadManifest({
        api,
        provider,
        action,
        ctx,
        imageId: action.getSpec().image,
        namespace: provider.config.namespace!.name!,
        log: createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind }),
        production: false,
      })
      await garden.processTasks({ tasks: [deployTask], throwOnError: true })

      const pods = await getWorkloadPods(api, "container", resource)
      const services = flatten(pods.map((pod) => pod.spec.containers.map((container) => container.name)))
      expect(services).to.eql(["simple-service"])
    })

    it("should read a Pod from a namespace directly when given a Pod manifest", async () => {
      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const rawAction = graph.getDeploy("simple-service")
      const action = await garden.resolveAction({
        action: rawAction,
        log: garden.log,
        graph,
      })

      const deployTask = new DeployTask({
        force: false,
        forceBuild: false,
        garden,
        graph,
        log: garden.log,
        action,
      })

      const provider = (await garden.resolveProvider(garden.log, "local-kubernetes")) as Provider<KubernetesConfig>
      await garden.processTasks({ tasks: [deployTask], throwOnError: true })

      const namespace = await getAppNamespace(ctx, log, provider)
      const allPods = await api.core.listNamespacedPod(namespace)

      const pod = allPods.items[0]

      const pods = await getWorkloadPods(api, namespace, pod)
      expect(pods.length).to.equal(1)
      expect(pods[0].kind).to.equal("Pod")
      expect(pods[0].metadata.name).to.equal(pod.metadata.name)
    })
  })

  describe("getServiceResourceSpec", () => {
    it("should return the spec on the given module if it has no base module", async () => {
      const module = helmGraph.getModule("artifacts")
      expect(getServiceResourceSpec(module, undefined)).to.eql(module.spec.serviceResource)
    })

    it("should return the spec on the base module if there is none on the module", async () => {
      const module = helmGraph.getModule("artifacts")
      const baseModule = helmGraph.getModule("postgres")
      module.spec.base = "postgres"
      delete module.spec.serviceResource
      module.buildDependencies = { postgres: baseModule }
      expect(getServiceResourceSpec(module, baseModule)).to.eql(baseModule.spec.serviceResource)
    })

    it("should merge the specs if both module and base have specs", async () => {
      const module = helmGraph.getModule("artifacts")
      module.spec.serviceResource.containerModule = "api-image"
      const baseModule = helmGraph.getModule("postgres")
      module.spec.base = "postgres"
      module.buildDependencies = { postgres: baseModule }
      expect(getServiceResourceSpec(module, baseModule)).to.eql({
        containerModule: "api-image",
        kind: "Deployment",
        name: "postgres",
      })
    })

    it("returns undefined if there is no serviceResource spec", async () => {
      const module = helmGraph.getModule("artifacts")
      delete module.spec.serviceResource
      const spec = getServiceResourceSpec(module, undefined)
      expect(spec).to.be.undefined
    })
  })

  describe("getTargetResource", () => {
    it("should return the resource specified by the query", async () => {
      const rawAction = helmGraph.getDeploy("api")
      const action = await helmGarden.resolveAction<HelmDeployAction>({
        action: rawAction,
        log: helmGarden.log,
        graph: helmGraph,
      })
      await helmGarden.executeAction<DeployAction>({ action: rawAction, log: helmGarden.log, graph: helmGraph })
      const manifests = await getChartResources({
        ctx,
        action,

        log,
      })
      const result = await getTargetResource({
        ctx,
        log,
        provider: ctx.provider,
        action,
        manifests,
        query: {
          name: action.getSpec().releaseName,
          kind: "Deployment",
        },
      })
      const expected = find(manifests, (r) => r.kind === "Deployment")
      expect(result).to.eql(expected)
    })

    it("should throw if no query is specified", async () => {
      const rawAction = helmGraph.getDeploy("api")
      const action = await helmGarden.resolveAction<DeployAction>({
        action: rawAction,
        log: helmGarden.log,
        graph: helmGraph,
      })
      const manifests = await getChartResources({
        ctx,
        action,

        log,
      })
      delete action._config.spec.serviceResource
      await expectError(
        () =>
          getTargetResource({
            ctx,
            log,
            provider: ctx.provider,
            action,
            manifests,
            query: {},
          }),
        (err) => expect(stripAnsi(err.message)).to.include("Neither kind nor podSelector set in resource query")
      )
    })

    it("should throw if no resource of the specified kind is in the chart", async () => {
      const rawAction = helmGraph.getDeploy("api")
      const action = await helmGarden.resolveAction<HelmDeployAction>({
        action: rawAction,
        log: helmGarden.log,
        graph: helmGraph,
      })
      const manifests = await getChartResources({
        ctx,
        action,

        log,
      })
      await expectError(
        () =>
          getTargetResource({
            ctx,
            log,
            provider: ctx.provider,
            action,
            manifests,
            query: {
              ...action._config.spec.defaultTarget,
              kind: "DaemonSet" as SyncableKind,
            },
          }),
        (err) => expect(stripAnsi(err.message)).to.include("does not contain specified DaemonSet")
      )
    })

    it("should throw if matching resource is not found by name", async () => {
      const rawAction = helmGraph.getDeploy("api")
      const action = await helmGarden.resolveAction<HelmDeployAction>({
        action: rawAction,
        log: helmGarden.log,
        graph: helmGraph,
      })
      const manifests = await getChartResources({
        ctx,
        action,

        log,
      })
      await expectError(
        () =>
          getTargetResource({
            ctx,
            log,
            provider: ctx.provider,
            action,
            manifests,
            query: {
              ...action._config.spec.defaultTarget,
              name: "foo",
            },
          }),
        (err) => expect(stripAnsi(err.message)).to.contain("does not contain specified Deployment foo")
      )
    })

    it("should throw if no name is specified and multiple resources are matched", async () => {
      const rawAction = helmGraph.getDeploy("api")
      const action = await helmGarden.resolveAction<HelmDeployAction>({
        action: rawAction,
        log: helmGarden.log,
        graph: helmGraph,
      })
      const manifests = await getChartResources({
        ctx,
        action,

        log,
      })
      const deployment = find(manifests, (r) => r.kind === "Deployment")
      manifests.push(deployment!)

      await expectError(
        () =>
          getTargetResource({
            ctx,
            log,
            provider: ctx.provider,
            action,
            manifests,
            query: {
              kind: "Deployment",
            },
          }),
        (err) =>
          expect(stripAnsi(err.message)).to.include(
            "contains multiple Deployments. You must specify a resource name in the appropriate config in order to identify the correct Deployment to use."
          )
      )
    })

    it("should resolve template string for resource name", async () => {
      const rawAction = helmGraph.getDeploy("postgres")
      const action = await helmGarden.resolveAction<HelmDeployAction>({
        action: rawAction,
        log: helmGarden.log,
        graph: helmGraph,
      })
      const manifests = await getChartResources({
        ctx,
        action,
        log,
      })
      action._config.spec.defaultTarget = { name: `{{ template "postgresql.primary.fullname" . }}` }
      const result = await getTargetResource({
        ctx,
        log,
        provider: ctx.provider,
        action,
        manifests,
        query: {
          name: "postgres",
          kind: "StatefulSet",
        },
      })
      const expected = find(manifests, (r) => r.kind === "StatefulSet")
      expect(result).to.eql(expected)
    })

    context("podSelector", () => {
      before(async () => {
        const rawAction = helmGraph.getDeploy("api")
        const action = await helmGarden.resolveAction<HelmDeployAction>({
          action: rawAction,
          log: helmGarden.log,
          graph: helmGraph,
        })
        const deployTask = new DeployTask({
          force: false,
          forceBuild: false,
          garden: helmGarden,
          graph: helmGraph,
          log: helmGarden.log,
          action,
        })

        await helmGarden.processTasks({ tasks: [deployTask], throwOnError: true })
      })

      it("returns running Pod if one is found matching podSelector", async () => {
        const rawAction = helmGraph.getDeploy("api")
        const action = await helmGarden.resolveAction<HelmDeployAction>({
          action: rawAction,
          log: helmGarden.log,
          graph: helmGraph,
        })
        const resourceSpec: ServiceResourceSpec = {
          podSelector: {
            "app.kubernetes.io/name": "api",
            "app.kubernetes.io/instance": "api-release",
          },
        }

        const pod = await getTargetResource({
          ctx,
          log,
          provider: ctx.provider,
          action,
          manifests: [],

          query: resourceSpec,
        })

        expect(pod.kind).to.equal("Pod")
        expect(pod.metadata.labels?.["app.kubernetes.io/name"]).to.equal("api")
        expect(pod.metadata.labels?.["app.kubernetes.io/instance"]).to.equal("api-release")
      })

      it("throws if podSelector is set and no Pod is found matching the selector", async () => {
        const rawAction = helmGraph.getDeploy("api")
        const action = await helmGarden.resolveAction<HelmDeployAction>({
          action: rawAction,
          log: helmGarden.log,
          graph: helmGraph,
        })
        const resourceSpec: ServiceResourceSpec = {
          podSelector: {
            "app.kubernetes.io/name": "boo",
            "app.kubernetes.io/instance": "foo",
          },
        }

        await expectError(
          () =>
            getTargetResource({
              ctx,
              log,
              provider: ctx.provider,
              action,
              manifests: [],

              query: resourceSpec,
            }),
          (err) => expect(stripAnsi(err.message)).to.include("Could not find any Pod matching provided podSelector")
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
    async function getK8sDeployment() {
      const rawAction = helmGraph.getDeploy("api")
      const action = await helmGarden.resolveAction<HelmDeployAction>({
        action: rawAction,
        log: helmGarden.log,
        graph: helmGraph,
      })
      const manifests = await getChartResources({
        ctx,
        action,

        log,
      })
      return <KubernetesWorkload>find(manifests, (r) => r.kind === "Deployment")!
    }

    it("should get the first container on the resource if no name is specified", async () => {
      const deployment = await getK8sDeployment()
      const expected = deployment.spec.template?.spec!.containers[0]
      expect(getResourceContainer(deployment)).to.equal(expected)
    })

    it("should pick the container by name if specified", async () => {
      const deployment = await getK8sDeployment()
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
      const deployment = await getK8sDeployment()
      deployment.spec.template!.spec!.containers = []
      await expectError(
        () => getResourceContainer(deployment),
        (err) => expect(err.message).to.equal("Deployment api-release has no containers configured.")
      )
    })

    it("should throw if name is specified and no containers match", async () => {
      const deployment = await getK8sDeployment()
      await expectError(
        () => getResourceContainer(deployment, "foo"),
        (err) => expect(err.message).to.equal("Could not find container 'foo' in Deployment 'api-release'")
      )
    })
  })
})
