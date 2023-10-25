/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import execa from "execa"
import cloneDeep from "fast-copy"

import tmp from "tmp-promise"

import { TestGarden } from "../../../../../helpers"
import { getKubernetesTestGarden } from "./common"
import { DeployTask } from "../../../../../../src/tasks/deploy"
import {
  getManifests,
  getMetadataManifest,
  parseMetadataResource,
  readManifests,
} from "../../../../../../src/plugins/kubernetes/kubernetes-type/common"
import { KubeApi } from "../../../../../../src/plugins/kubernetes/api"
import { ActionLog, createActionLog, Log } from "../../../../../../src/logger/log-entry"
import { KubernetesPluginContext, KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config"
import { getActionNamespace } from "../../../../../../src/plugins/kubernetes/namespace"
import {
  getDeployedResource,
  k8sManifestHashAnnotationKey,
} from "../../../../../../src/plugins/kubernetes/status/status"
import { ModuleConfig } from "../../../../../../src/config/module"
import { BaseResource, KubernetesResource } from "../../../../../../src/plugins/kubernetes/types"
import { DeleteDeployTask } from "../../../../../../src/tasks/delete-deploy"
import {
  deleteKubernetesDeploy,
  getKubernetesDeployStatus,
  kubernetesDeploy,
} from "../../../../../../src/plugins/kubernetes/kubernetes-type/handlers"
import { buildHelmModules } from "../helm/common"
import { gardenAnnotationKey } from "../../../../../../src/util/string"
import { LocalModeProcessRegistry, ProxySshKeystore } from "../../../../../../src/plugins/kubernetes/local-mode"
import { KubernetesDeployAction } from "../../../../../../src/plugins/kubernetes/kubernetes-type/config"
import { DEFAULT_BUILD_TIMEOUT_SEC, GardenApiVersion } from "../../../../../../src/constants"
import { ActionModeMap } from "../../../../../../src/actions/types"
import { NamespaceStatus } from "../../../../../../src/types/namespace"

describe("kubernetes-type handlers", () => {
  let tmpDir: tmp.DirectoryResult
  let garden: TestGarden
  let log: Log
  let actionLog: ActionLog
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

  function withNamespace(moduleConfig: ModuleConfig, nsName: string): ModuleConfig {
    const cloned = cloneDeep(moduleConfig)
    cloned.spec.manifests[0].metadata.name = nsName
    cloned.spec.manifests[0].metadata.labels.name = nsName
    return cloned
  }

  async function findDeployedResources(manifests: KubernetesResource<BaseResource>[], logCtx: Log) {
    const maybeDeployedObjects = await Promise.all(
      manifests.map((resource) => getDeployedResource(ctx, ctx.provider, resource, logCtx))
    )
    return <KubernetesResource[]>maybeDeployedObjects.filter((o) => o !== null)
  }

  async function prepareActionDeployParams(actionName: string, mode: ActionModeMap) {
    const graph = await garden.getConfigGraph({
      log: garden.log,
      emit: false,
      actionModes: mode,
    })
    const action = graph.getDeploy(actionName)
    const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({ action, log: garden.log, graph })
    const deployParams = {
      ctx,
      log: actionLog,
      action: resolvedAction,
      force: false,
    }
    return { action, resolvedAction, deployParams }
  }

  async function prepareActionDeployParamsWithManifests(actionName: string, mode: ActionModeMap) {
    const { action, resolvedAction, deployParams } = await prepareActionDeployParams(actionName, mode)
    const namespace = await getActionNamespace({
      ctx,
      log,
      action: resolvedAction,
      provider: ctx.provider,
      skipCreate: true,
    })
    const manifests = await getManifests({
      ctx,
      api,
      log,
      action: resolvedAction,
      defaultNamespace: namespace,
    })
    return { action, resolvedAction, deployParams, manifests }
  }

  async function deployInNamespace({ nsName, deployName }: { nsName: string; deployName: string }) {
    garden.setModuleConfigs([withNamespace(nsModuleConfig, nsName)])
    const graph = await garden.getConfigGraph({ log, emit: false })
    const action = graph.getDeploy(deployName)
    const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({ action, log: garden.log, graph })
    const defaultNamespace = await getActionNamespace({ ctx, log, action: resolvedAction, provider: ctx.provider })
    const manifests = await getManifests({ ctx, api, log, action: resolvedAction, defaultNamespace })
    const manifest = manifests.find((resource) => resource.kind === "Namespace")

    const deployTask = new DeployTask({
      garden,
      graph,
      log,
      action,
      force: true,
      forceBuild: false,
    })
    await garden.processTasks({ tasks: [deployTask], throwOnError: true })
    const resource = await getDeployedResource(ctx, ctx.provider, manifest!, log)
    return { manifest, resource, graph, action, resolvedAction }
  }

  before(async () => {
    garden = await getKubernetesTestGarden()
    moduleConfigBackup = await garden.getRawModuleConfigs()
    log = garden.log
    actionLog = createActionLog({ log, actionName: "", actionKind: "" })
    const provider = <KubernetesProvider>await garden.resolveProvider(log, "local-kubernetes")
    ctx = <KubernetesPluginContext>(
      await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
    )
    api = await KubeApi.factory(log, ctx, ctx.provider)
    tmpDir = await tmp.dir({ unsafeCleanup: true })
    await execa("git", ["init", "--initial-branch=main"], { cwd: tmpDir.path })
    nsModuleConfig = {
      apiVersion: GardenApiVersion.v0,
      kind: "Module",
      disabled: false,
      allowPublish: false,
      build: { dependencies: [], timeout: DEFAULT_BUILD_TIMEOUT_SEC },
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
              name: "kubernetes-type-ns-1",
              labels: { name: "kubernetes-type-ns-1" },
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
    await tmpDir.cleanup()
    if (garden) {
      garden.close()
    }
  })

  afterEach(() => {
    garden.setModuleConfigs(moduleConfigBackup)
  })

  describe("getKubernetesDeployStatus", () => {
    it("returns ready status and correct detail for a ready deployment", async () => {
      const { deployParams } = await prepareActionDeployParams("module-simple", {})

      await kubernetesDeploy(deployParams)

      const status = await getKubernetesDeployStatus(deployParams)
      expect(status.state).to.equal("ready")

      expect(status.detail?.mode).to.equal("default")
      expect(status.detail?.forwardablePorts).to.eql([
        {
          name: undefined,
          protocol: "TCP",
          targetName: "Deployment/busybox-deployment",
          targetPort: 80,
        },
      ])

      const remoteResources = status.detail?.detail?.remoteResources
      expect(remoteResources).to.exist
      expect(remoteResources.length).to.equal(1)
      expect(remoteResources[0].kind).to.equal("Deployment")
    })

    it("should return missing status when metadata ConfigMap is missing", async () => {
      const { resolvedAction, deployParams } = await prepareActionDeployParams("module-simple", {})

      await kubernetesDeploy(deployParams)

      const namespace = await getActionNamespace({
        ctx,
        log,
        action: resolvedAction,
        provider: ctx.provider,
        skipCreate: true,
      })

      const metadataManifest = getMetadataManifest(resolvedAction, namespace, [])

      await api.deleteBySpec({ log, namespace, manifest: metadataManifest })

      const status = await getKubernetesDeployStatus(deployParams)
      expect(status.state).to.equal("not-ready")
      expect(status.detail?.state).to.equal("missing")
    })

    it("should return outdated status when metadata ConfigMap has different version", async () => {
      const { resolvedAction, deployParams } = await prepareActionDeployParams("module-simple", {})

      await kubernetesDeploy(deployParams)

      const namespace = await getActionNamespace({
        ctx,
        log,
        action: resolvedAction,
        provider: ctx.provider,
        skipCreate: true,
      })

      const declaredManifests = await readManifests(ctx, resolvedAction, log)
      // It's critical to pass in the existing manifests here, otherwise the code will not check their statuses
      const metadataManifest = getMetadataManifest(resolvedAction, namespace, declaredManifests)
      metadataManifest.data!.resolvedVersion = "v-foo"

      await api.replace({ log, namespace, resource: metadataManifest })

      const status = await getKubernetesDeployStatus(deployParams)
      expect(status.state).to.equal("not-ready")
      expect(status.detail?.state).to.equal("outdated")
    })

    it("should return outdated status when k8s remote resource version is not a valid sha256 hash", async () => {
      // We use a standalone module here, because we need to modify the state of the remote resource to perform the test.
      // Using of the `module-simple` will require remote resource redeployment in many other test cases here,
      // and that will slow down the test execution.
      const { resolvedAction, deployParams } = await prepareActionDeployParams("module-simple-isolated", {})

      await kubernetesDeploy(deployParams)

      const namespace = await getActionNamespace({
        ctx,
        log,
        action: resolvedAction,
        provider: ctx.provider,
        skipCreate: true,
      })

      const declaredManifests = await readManifests(ctx, resolvedAction, log)
      expect(declaredManifests.length).to.equal(1)

      const deploymentManifest = declaredManifests[0].manifest
      const remoteDeploymentResource = await api.readBySpec({ log, namespace, manifest: deploymentManifest })
      expect(remoteDeploymentResource.metadata.annotations).to.exist

      // Modify the `k8sManifestHashAnnotationKey` annotation to be non-valid sha256 hash
      remoteDeploymentResource.metadata.annotations![k8sManifestHashAnnotationKey] = "non-sha256-hash"
      await api.replace({ log, namespace, resource: remoteDeploymentResource })

      const status = await getKubernetesDeployStatus(deployParams)
      expect(status.state).to.equal("not-ready")
      expect(status.detail?.state).to.equal("outdated")
    })

    it("should return outdated status when metadata ConfigMap has different mode", async () => {
      const { resolvedAction, deployParams } = await prepareActionDeployParams("module-simple", {})

      await kubernetesDeploy(deployParams)

      const namespace = await getActionNamespace({
        ctx,
        log,
        action: resolvedAction,
        provider: ctx.provider,
        skipCreate: true,
      })

      const metadataManifest = getMetadataManifest(resolvedAction, namespace, [])
      metadataManifest.data!.mode = "sync"

      await api.replace({ log, namespace, resource: metadataManifest })

      const status = await getKubernetesDeployStatus(deployParams)
      expect(status.state).to.equal("not-ready")
      expect(status.detail?.mode).to.equal("sync")
      expect(status.detail?.state).to.equal("outdated")
    })

    it("should return not-ready status for a manifest with a missing resource type", async () => {
      const { resolvedAction, deployParams } = await prepareActionDeployParams("module-simple", {})
      resolvedAction["_config"].spec.manifests = [
        {
          apiVersion: "foo.bar/baz",
          kind: "Whatever",
          metadata: { name: "foo" },
          spec: {},
        },
      ]

      const status = await getKubernetesDeployStatus(deployParams)
      expect(status.state).to.equal("not-ready")
    })
  })

  describe("kubernetesDeploy", () => {
    it("gets the correct manifests when `build` is set", async () => {
      const { resolvedAction, deployParams } = await prepareActionDeployParams("with-build-action", {})

      const status = await kubernetesDeploy(deployParams)
      expect(status.state).to.eql("ready")

      const remoteResources = status.detail?.detail?.remoteResources
      expect(remoteResources).to.exist
      expect(remoteResources.length).to.equal(1)
      expect(remoteResources[0].kind).to.equal("Deployment")
      expect(remoteResources[0].metadata?.name).to.equal("busybox-deployment")
    })

    it("should successfully deploy when serviceResource doesn't have a containerModule", async () => {
      const { deployParams } = await prepareActionDeployParams("module-simple", {})

      // Here, we're not going through a router, so we listen for the `namespaceStatus` event directly.
      let namespaceStatus: NamespaceStatus | null = null
      ctx.events.once("namespaceStatus", (status) => (namespaceStatus = status))
      const status = await kubernetesDeploy(deployParams)
      expect(status.state).to.eql("ready")
      expect(namespaceStatus).to.exist
      expect(namespaceStatus!.namespaceName).to.eql("kubernetes-type-test-default")
    })

    it("creates a metadata ConfigMap describing what was last deployed", async () => {
      const { resolvedAction, deployParams } = await prepareActionDeployParams("module-simple", {})

      const status = await kubernetesDeploy(deployParams)
      expect(status.state).to.eql("ready")

      const namespace = await getActionNamespace({
        ctx,
        log,
        action: resolvedAction,
        provider: ctx.provider,
        skipCreate: true,
      })

      const emptyManifest = getMetadataManifest(resolvedAction, namespace, [])

      const metadataResource = await api.readBySpec({ log, namespace, manifest: emptyManifest })

      expect(metadataResource).to.exist

      const parsedMetadata = parseMetadataResource(log, metadataResource)

      expect(parsedMetadata.resolvedVersion).to.equal(resolvedAction.versionString())
      expect(parsedMetadata.mode).to.equal("default")
      expect(parsedMetadata.manifestMetadata).to.eql({
        "Deployment/busybox-deployment": {
          apiVersion: "apps/v1",
          key: "Deployment/busybox-deployment",
          kind: "Deployment",
          name: "busybox-deployment",
          namespace: "kubernetes-type-test-default",
        },
      })
    })

    it("should toggle sync mode", async () => {
      const syncData = await prepareActionDeployParamsWithManifests("with-source-module", {
        sync: ["deploy.with-source-module"],
      })
      const defaultData = await prepareActionDeployParamsWithManifests("with-source-module", {
        default: ["deploy.with-source-module"],
      })

      // Deploy without sync mode
      await kubernetesDeploy(defaultData.deployParams)
      const res1 = await findDeployedResources(defaultData.manifests, log)

      // Deploy with sync mode
      await kubernetesDeploy(syncData.deployParams)
      const res2 = await findDeployedResources(syncData.manifests, log)

      // Deploy without sync mode again
      await kubernetesDeploy(defaultData.deployParams)
      const res3 = await findDeployedResources(defaultData.manifests, log)

      expect(res1[0].metadata.annotations![gardenAnnotationKey("mode")]).to.equal("default")
      expect(res2[0].metadata.annotations![gardenAnnotationKey("mode")]).to.equal("sync")
      expect(res3[0].metadata.annotations![gardenAnnotationKey("mode")]).to.equal("default")
    })

    it("should handle local mode", async () => {
      const localData = await prepareActionDeployParamsWithManifests("with-source-module", {
        local: ["deploy.with-source-module"],
      })
      const defaultData = await prepareActionDeployParamsWithManifests("with-source-module", {
        default: ["deploy.with-source-module"],
      })

      // Deploy without local mode
      await kubernetesDeploy(defaultData.deployParams)
      const res1 = await findDeployedResources(defaultData.manifests, log)

      // Deploy with local mode
      await kubernetesDeploy(localData.deployParams)
      const res2 = await findDeployedResources(localData.manifests, log)
      // shut down local app and tunnels to avoid retrying after redeploy
      LocalModeProcessRegistry.getInstance().shutdown()
      ProxySshKeystore.getInstance(log).shutdown(log)

      // Deploy without local mode again
      await kubernetesDeploy(defaultData.deployParams)
      const res3 = await findDeployedResources(defaultData.manifests, log)

      expect(res1[0].metadata.annotations![gardenAnnotationKey("mode")]).to.equal("default")
      expect(res2[0].metadata.annotations![gardenAnnotationKey("mode")]).to.equal("local")
      expect(res3[0].metadata.annotations![gardenAnnotationKey("mode")]).to.equal("default")
    })

    it("should not delete previously deployed namespace resources", async () => {
      const { manifest: ns1Manifest, resource: ns1Resource } = await deployInNamespace({
        nsName: "kubernetes-type-ns-1",
        deployName: "namespace-resource",
      })

      expect(ns1Manifest, "ns1Manifest").to.exist
      expect(ns1Manifest!.metadata.name).to.match(/ns-1/)
      expect(ns1Resource, "ns1Resource").to.exist
      // Here, we expect one status for the app namespace, and one status for the namespace resource defined by
      // this module.

      // This should result in a new namespace with a new name being deployed.
      const { manifest: ns2Manifest, resource: ns2Resource } = await deployInNamespace({
        nsName: "kubernetes-type-ns-2",
        deployName: "namespace-resource",
      })

      expect(ns2Manifest, "ns2Manifest").to.exist
      expect(ns2Manifest!.metadata.name).to.match(/ns-2/)
      expect(ns2Resource, "ns2Resource").to.exist

      // Finally, we verify that the original namespace resource is still in the cluster.
      const ns1ResourceRefreshed = await getDeployedResource(ctx, ctx.provider, ns1Manifest!, log)

      expect(ns1ResourceRefreshed, "originalNamespaceRefreshed").to.exist
    })

    it("should successfully deploy List manifest kinds", async () => {
      const configMapList = await prepareActionDeployParamsWithManifests("config-map-list", {})

      // this should be 4, and not 2 (including the metadata manifest),
      // as we transform *List objects to separate manifests
      expect(configMapList.manifests.length).to.be.equal(4)

      // test successful deploy
      await kubernetesDeploy(configMapList.deployParams)
    })
  })

  describe("deleteKubernetesDeploy", () => {
    it("should only delete namespace resources having the current name in the manifests", async () => {
      const { manifest: ns1Manifest, resource: ns1Resource } = await deployInNamespace({
        nsName: "kubernetes-type-ns-1",
        deployName: "namespace-resource",
      })
      // Verify the presence of the namespace
      expect(await getDeployedResource(ctx, ctx.provider, ns1Manifest!, log), "ns1resource").to.exist

      const {
        graph: ns2Graph,
        manifest: ns2Manifest,
        resource: ns2Resource,
      } = await deployInNamespace({
        nsName: "kubernetes-type-ns-2",
        deployName: "namespace-resource",
      })
      // Verify the presence of the namespace
      expect(await getDeployedResource(ctx, ctx.provider, ns2Manifest!, log), "ns2resource").to.exist

      const deleteDeployTask = new DeleteDeployTask({
        garden,
        graph: ns2Graph,
        log,
        action: ns2Graph.getDeploy("namespace-resource"),
        force: false,
      })

      // This should only delete kubernetes-type-ns-2.
      await garden.processTasks({ tasks: [deleteDeployTask], throwOnError: true })

      expect(await getDeployedResource(ctx, ctx.provider, ns1Manifest!, log), "ns1resource").to.exist
      expect(await getDeployedResource(ctx, ctx.provider, ns2Manifest!, log), "ns2resource").to.not.exist
      expect(await getDeployedResource(ctx, ctx.provider, ns2Resource!, log), "ns2resource").to.not.exist
    })

    it("deletes all resources including a metadata ConfigMap describing what was last deployed", async () => {
      const { resolvedAction, deployParams, manifests } = await prepareActionDeployParamsWithManifests(
        "module-simple",
        {}
      )

      const status = await kubernetesDeploy(deployParams)
      expect(status.state).to.eql("ready")

      const namespace = await getActionNamespace({
        ctx,
        log,
        action: resolvedAction,
        provider: ctx.provider,
        skipCreate: true,
      })

      const deleteDeployParams = { ctx, action: resolvedAction, log: actionLog }
      await deleteKubernetesDeploy(deleteDeployParams)

      for (const manifest of manifests) {
        const metadataResource = await api.readBySpecOrNull({ log, namespace, manifest })
        expect(metadataResource).to.be.null
      }
    })
  })
})
