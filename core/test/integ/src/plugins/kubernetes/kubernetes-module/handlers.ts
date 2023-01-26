/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import execa from "execa"
import { cloneDeep } from "lodash"
import tmp from "tmp-promise"

import { TestGarden } from "../../../../../helpers"
import { getKubernetesTestGarden } from "./common"
import { DeployTask } from "../../../../../../src/tasks/deploy"
import { getManifests } from "../../../../../../src/plugins/kubernetes/kubernetes-type/common"
import { KubeApi } from "../../../../../../src/plugins/kubernetes/api"
import { LogEntry } from "../../../../../../src/logger/log-entry"
import { KubernetesPluginContext, KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config"
import { getActionNamespace } from "../../../../../../src/plugins/kubernetes/namespace"
import { getDeployedResource } from "../../../../../../src/plugins/kubernetes/status/status"
import { ModuleConfig } from "../../../../../../src/config/module"
import { BaseResource, KubernetesResource } from "../../../../../../src/plugins/kubernetes/types"
import { DeleteDeployTask } from "../../../../../../src/tasks/delete-deploy"
import {
  kubernetesDeploy,
  getKubernetesDeployStatus,
} from "../../../../../../src/plugins/kubernetes/kubernetes-type/handlers"
import Bluebird from "bluebird"
import { buildHelmModules } from "../helm/common"
import { gardenAnnotationKey } from "../../../../../../src/util/string"
import { getServiceStatuses } from "../../../../../../src/tasks/helpers"
import { LocalModeProcessRegistry, ProxySshKeystore } from "../../../../../../src/plugins/kubernetes/local-mode"
import { KubernetesDeployAction } from "../../../../../../src/plugins/kubernetes/kubernetes-type/config"
import { DEFAULT_API_VERSION } from "../../../../../../src/constants"

describe("kubernetes-module handlers", () => {
  let tmpDir: tmp.DirectoryResult
  let garden: TestGarden
  let log: LogEntry
  let ctx: KubernetesPluginContext
  let api: KubeApi
  /**
   * To speed up the test suite, getKubernetesTestGarden caches a garden instance to avoid repeatedly resolving
   * providers for the various integ test cases that use it.
   *
   * Therefore, when overriding the module configs in a test case, we restore the original module configs when we're
   * done.
   */
  let moduleConfigBackup: ModuleConfig[]
  let nsModuleConfig: ModuleConfig
  let ns1Manifest: KubernetesResource<BaseResource> | undefined
  let ns1Resource: KubernetesResource<BaseResource> | null
  let ns2Manifest: KubernetesResource<BaseResource> | undefined
  let ns2Resource: KubernetesResource<BaseResource> | null

  const withNamespace = (moduleConfig: ModuleConfig, nsName: string): ModuleConfig => {
    const cloned = cloneDeep(moduleConfig)
    cloned.spec.manifests[0].metadata.name = nsName
    cloned.spec.manifests[0].metadata.labels.name = nsName
    return cloned
  }

  const findDeployedResources = async (manifests: KubernetesResource<BaseResource>[], logEntry: LogEntry) => {
    const maybeDeployedObjects = await Bluebird.map(manifests, (resource) =>
      getDeployedResource(ctx, ctx.provider, resource, logEntry)
    )
    return <KubernetesResource[]>maybeDeployedObjects.filter((o) => o !== null)
  }

  before(async () => {
    garden = await getKubernetesTestGarden()
    moduleConfigBackup = await garden.getRawModuleConfigs()
    log = garden.log
    const provider = <KubernetesProvider>await garden.resolveProvider(log, "local-kubernetes")
    ctx = <KubernetesPluginContext>(
      await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
    )
    api = await KubeApi.factory(log, ctx, ctx.provider)
    tmpDir = await tmp.dir({ unsafeCleanup: true })
    await execa("git", ["init", "--initial-branch=main"], { cwd: tmpDir.path })
    nsModuleConfig = {
      apiVersion: DEFAULT_API_VERSION,
      kind: "Module",
      disabled: false,
      allowPublish: false,
      build: { dependencies: [] },
      description: "Kubernetes module that includes a Namespace resource",
      name: "namespace-resource",
      path: tmpDir.path,
      serviceConfigs: [],
      spec: {
        manifests: [
          {
            apiVersion: "v1",
            kind: "Namespace",
            metadata: {
              name: "kubernetes-module-ns-1",
              labels: { name: "kubernetes-module-ns-1" },
            },
          },
        ],
        serviceResource: {
          kind: "Deployment",
          name: "busybox-deployment",
        },
        build: { dependencies: [] },
      },
      testConfigs: [],
      type: "kubernetes",
      taskConfigs: [],
    }

    const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    await buildHelmModules(garden, graph)
  })

  after(async () => {
    garden.setActionConfigs(moduleConfigBackup)
    await tmpDir.cleanup()
    if (garden) {
      await garden.close()
    }
  })

  describe("getServiceStatus", () => {
    it("should return missing status for a manifest with a missing resource type", async () => {
      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const action = graph.getDeploy("module-simple")
      const deployParams = {
        ctx,
        log: garden.log,
        action: await garden.resolveAction<KubernetesDeployAction>({ action, log: garden.log, graph }),
        force: false,
        devMode: false,
        localMode: false,
      }
      action.getConfig().spec.manifests = [
        {
          apiVersion: "foo.bar/baz",
          kind: "Whatever",
          metadata: { name: "foo" },
          spec: {},
        },
      ]

      const status = await getKubernetesDeployStatus(deployParams)
      expect(status.state).to.equal("missing")
    })
  })

  describe("kubernetesDeploy", () => {
    it("should successfully deploy when serviceResource doesn't have a containerModule", async () => {
      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const action = graph.getDeploy("module-simple")
      const deployParams = {
        ctx,
        log: garden.log,
        action: await garden.resolveAction<KubernetesDeployAction>({ action, log: garden.log, graph }),
        force: false,
        devMode: false,
        localMode: false,
      }
      const status = await kubernetesDeploy(deployParams)
      expect(status.state).to.eql("ready")
      expect(status.detail?.namespaceStatuses).to.eql([
        {
          pluginName: "local-kubernetes",
          namespaceName: "kubernetes-module-test-default",
          state: "ready",
        },
      ])
    })

    it("should toggle devMode", async () => {
      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const action = graph.getDeploy("with-source-module")
      const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({ action, log: garden.log, graph })
      const namespace = await getActionNamespace({
        ctx,
        log,
        action: resolvedAction,
        provider: ctx.provider,
        skipCreate: true,
      })
      const deployParams = {
        ctx,
        log: garden.log,
        action: resolvedAction,
        force: false,
        devMode: false,
        localMode: false,
      }
      const manifests = await getManifests({
        ctx,
        api,
        log,
        action: resolvedAction,
        defaultNamespace: namespace,
        readFromSrcDir: true,
      })

      // Deploy without dev mode
      await kubernetesDeploy(deployParams)
      const res1 = await findDeployedResources(manifests, log)

      // Deploy with dev mode
      await kubernetesDeploy({ ...deployParams, devMode: true })
      const res2 = await findDeployedResources(manifests, log)

      // Deploy without dev mode again
      await kubernetesDeploy(deployParams)
      const res3 = await findDeployedResources(manifests, log)

      expect(res1[0].metadata.annotations![gardenAnnotationKey("dev-mode")]).to.equal("false")
      expect(res2[0].metadata.annotations![gardenAnnotationKey("dev-mode")]).to.equal("true")
      expect(res3[0].metadata.annotations![gardenAnnotationKey("dev-mode")]).to.equal("false")
    })

    it("should toggle localMode", async () => {
      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const action = graph.getDeploy("with-source-module")
      const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({ action, log: garden.log, graph })
      const namespace = await getActionNamespace({
        ctx,
        log,
        action: resolvedAction,
        provider: ctx.provider,
        skipCreate: true,
      })
      const deployParams = {
        ctx,
        log: garden.log,
        action: resolvedAction,
        force: false,
        devMode: false,
        localMode: false,
      }
      const manifests = await getManifests({
        ctx,
        api,
        log,
        action: resolvedAction,
        defaultNamespace: namespace,
        readFromSrcDir: true,
      })

      // Deploy without local mode
      await kubernetesDeploy(deployParams)
      const res1 = await findDeployedResources(manifests, log)

      // Deploy with local mode
      await kubernetesDeploy({ ...deployParams, localMode: true })
      const res2 = await findDeployedResources(manifests, log)
      // shut down local app and tunnels to avoid retrying after redeploy
      LocalModeProcessRegistry.getInstance().shutdown()
      ProxySshKeystore.getInstance(log).shutdown(log)

      // Deploy without local mode again
      await kubernetesDeploy(deployParams)
      const res3 = await findDeployedResources(manifests, log)

      expect(res1[0].metadata.annotations![gardenAnnotationKey("local-mode")]).to.equal("false")
      expect(res2[0].metadata.annotations![gardenAnnotationKey("local-mode")]).to.equal("true")
      expect(res3[0].metadata.annotations![gardenAnnotationKey("local-mode")]).to.equal("false")
    })

    it("localMode should always take precedence over devMode", async () => {
      const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      const action = graph.getDeploy("with-source-module")
      const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({ action, log: garden.log, graph })
      const namespace = await getActionNamespace({
        ctx,
        log,
        action: resolvedAction,
        provider: ctx.provider,
        skipCreate: true,
      })
      const deployParams = {
        ctx,
        log: garden.log,
        action: resolvedAction,
        force: false,
        devMode: false,
        localMode: false,
      }
      const manifests = await getManifests({
        ctx,
        api,
        log,
        action: resolvedAction,
        defaultNamespace: namespace,
        readFromSrcDir: true,
      })

      // Deploy without local mode
      await kubernetesDeploy(deployParams)
      const res1 = await findDeployedResources(manifests, log)

      // Deploy with local mode
      await kubernetesDeploy({ ...deployParams, localMode: true, devMode: true })
      const res2 = await findDeployedResources(manifests, log)
      // shut down local app and tunnels to avoid retrying after redeploy
      LocalModeProcessRegistry.getInstance().shutdown()
      ProxySshKeystore.getInstance(log).shutdown(log)

      // Deploy without local mode again
      await kubernetesDeploy(deployParams)
      const res3 = await findDeployedResources(manifests, log)

      expect(res1[0].metadata.annotations![gardenAnnotationKey("local-mode")]).to.equal("false")
      expect(res2[0].metadata.annotations![gardenAnnotationKey("local-mode")]).to.equal("true")
      expect(res3[0].metadata.annotations![gardenAnnotationKey("local-mode")]).to.equal("false")

      expect(res1[0].metadata.annotations![gardenAnnotationKey("dev-mode")]).to.equal("false")
      expect(res2[0].metadata.annotations![gardenAnnotationKey("dev-mode")]).to.equal("false")
      expect(res3[0].metadata.annotations![gardenAnnotationKey("dev-mode")]).to.equal("false")
    })

    it("should not delete previously deployed namespace resources", async () => {
      garden.setActionConfigs([withNamespace(nsModuleConfig, "kubernetes-module-ns-1")])
      let graph = await garden.getConfigGraph({ log, emit: false })
      let action = graph.getDeploy("namespace-resource")
      const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({ action, log: garden.log, graph })
      const defaultNamespace = await getActionNamespace({ ctx, log, action: resolvedAction, provider: ctx.provider })
      let manifests = await getManifests({ ctx, api, log, action: resolvedAction, defaultNamespace })
      ns1Manifest = manifests.find((resource) => resource.kind === "Namespace")

      const deployTask = new DeployTask({
        garden,
        graph,
        log,
        action,
        force: true,
        forceBuild: false,
        fromWatch: false,
        devModeDeployNames: [],
        localModeDeployNames: [],
      })
      const results = await garden.processTasks({ tasks: [deployTask], throwOnError: true })
      const status = getServiceStatuses(results.results)["namespace-resource"]
      ns1Resource = await getDeployedResource(ctx, ctx.provider, ns1Manifest!, log)

      expect(ns1Manifest, "ns1Manifest").to.exist
      expect(ns1Manifest!.metadata.name).to.match(/ns-1/)
      expect(ns1Resource, "ns1Resource").to.exist
      // Here, we expect one status for the app namespace, and one status for the namespace resource defined by
      // this module.
      expect(status.detail?.namespaceStatuses).to.eql([
        {
          pluginName: "local-kubernetes",
          namespaceName: "kubernetes-module-test-default",
          state: "ready",
        },
        {
          pluginName: "local-kubernetes",
          namespaceName: "kubernetes-module-ns-1",
          state: "ready",
        },
      ])

      // This should result in a new namespace with a new name being deployed.
      garden.setActionConfigs([withNamespace(nsModuleConfig, "kubernetes-module-ns-2")])
      graph = await garden.getConfigGraph({ log, emit: false })
      action = graph.getDeploy("namespace-resource")
      manifests = await getManifests({
        ctx,
        api,
        log,
        action: await garden.resolveAction({ action, log: garden.log, graph }),
        defaultNamespace,
      })
      ns2Manifest = manifests.find((resource) => resource.kind === "Namespace")
      const deployTask2 = new DeployTask({
        garden,
        graph,
        log,
        action,
        force: true,
        forceBuild: true,
        fromWatch: false,
        devModeDeployNames: [],
        localModeDeployNames: [],
      })
      await garden.processTasks({ tasks: [deployTask2], throwOnError: true })
      ns2Resource = await getDeployedResource(ctx, ctx.provider, ns2Manifest!, log)

      expect(ns2Manifest, "ns2Manifest").to.exist
      expect(ns2Manifest!.metadata.name).to.match(/ns-2/)
      expect(ns2Resource, "ns2Resource").to.exist

      // Finally, we verify that the original namespace resource is still in the cluster.
      const ns1ResourceRefreshed = await getDeployedResource(ctx, ctx.provider, ns1Manifest!, log)

      expect(ns1ResourceRefreshed, "originalNamespaceRefreshed").to.exist
    })
  })

  describe("deleteService", () => {
    it("should only delete namespace resources having the current name in the manifests", async () => {
      // First, we verify that the namespaces created in the preceding test case are still there.
      expect(await getDeployedResource(ctx, ctx.provider, ns1Manifest!, log), "ns1resource").to.exist
      expect(await getDeployedResource(ctx, ctx.provider, ns2Manifest!, log), "ns2resource").to.exist

      const graph = await garden.getConfigGraph({ log, emit: false })
      const deleteServiceTask = new DeleteDeployTask({
        garden,
        graph,
        log,
        action: graph.getDeploy("namespace-resource"),
        force: false,
        fromWatch: false,
        devModeDeployNames: [],
        localModeDeployNames: [],
      })

      // This should only delete kubernetes-module-ns-2.
      await garden.processTasks({ tasks: [deleteServiceTask], throwOnError: true })

      expect(await getDeployedResource(ctx, ctx.provider, ns1Manifest!, log), "ns1resource").to.exist
      expect(await getDeployedResource(ctx, ctx.provider, ns2Manifest!, log), "ns2resource").to.not.exist
    })
  })
})
