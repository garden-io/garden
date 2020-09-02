/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
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
import { getManifests } from "../../../../../../src/plugins/kubernetes/kubernetes-module/common"
import { KubeApi } from "../../../../../../src/plugins/kubernetes/api"
import { LogEntry } from "../../../../../../src/logger/log-entry"
import { KubernetesPluginContext, KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config"
import { getModuleNamespace } from "../../../../../../src/plugins/kubernetes/namespace"
import { getDeployedResource } from "../../../../../../src/plugins/kubernetes/status/status"
import { ModuleConfig } from "../../../../../../src/config/module"
import { KubernetesResource, BaseResource } from "../../../../../../src/plugins/kubernetes/types"
import { DeleteServiceTask } from "../../../../../../src/tasks/delete-service"

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

  before(async () => {
    garden = await getKubernetesTestGarden()
    moduleConfigBackup = await garden.getRawModuleConfigs()
    log = garden.log
    const provider = <KubernetesProvider>await garden.resolveProvider(log, "local-kubernetes")
    ctx = <KubernetesPluginContext>await garden.getPluginContext(provider)
    api = await KubeApi.factory(log, ctx, ctx.provider)
    tmpDir = await tmp.dir({ unsafeCleanup: true })
    await execa("git", ["init"], { cwd: tmpDir.path })
    nsModuleConfig = {
      apiVersion: "garden.io/v0",
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
  })

  after(async () => {
    garden.setModuleConfigs(moduleConfigBackup)
    await tmpDir.cleanup()
  })

  describe("deployKubernetesService", () => {
    it("should not delete previously deployed namespace resources", async () => {
      garden.setModuleConfigs([withNamespace(nsModuleConfig, "kubernetes-module-ns-1")])
      let graph = await garden.getConfigGraph(log)
      let k8smodule = graph.getModule("namespace-resource")
      const defaultNamespace = await getModuleNamespace({ ctx, log, module: k8smodule, provider: ctx.provider })
      let manifests = await getManifests({ api, log, module: k8smodule, defaultNamespace })
      ns1Manifest = manifests.find((resource) => resource.kind === "Namespace")

      const deployTask = new DeployTask({
        garden,
        graph,
        log,
        service: graph.getService("namespace-resource"),
        force: false,
        forceBuild: false,
      })
      await garden.processTasks([deployTask], { throwOnError: true })
      ns1Resource = await getDeployedResource(ctx, ctx.provider, ns1Manifest!, log)

      expect(ns1Manifest, "ns1Manifest").to.exist
      expect(ns1Manifest!.metadata.name).to.match(/ns-1/)
      expect(ns1Resource, "ns1Resource").to.exist

      // This should result in a new namespace with a new name being deployed.
      garden.setModuleConfigs([withNamespace(nsModuleConfig, "kubernetes-module-ns-2")])
      graph = await garden.getConfigGraph(log)
      k8smodule = graph.getModule("namespace-resource")
      manifests = await getManifests({ api, log, module: k8smodule, defaultNamespace })
      ns2Manifest = manifests.find((resource) => resource.kind === "Namespace")
      const deployTask2 = new DeployTask({
        garden,
        graph,
        log,
        service: graph.getService("namespace-resource"),
        force: true,
        forceBuild: true,
      })
      await garden.processTasks([deployTask2], { throwOnError: true })
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

      const graph = await garden.getConfigGraph(log)
      const deleteServiceTask = new DeleteServiceTask({
        garden,
        graph,
        log,
        service: graph.getService("namespace-resource"),
      })

      // This should only delete kubernetes-module-ns-2.
      await garden.processTasks([deleteServiceTask], { throwOnError: true })

      expect(await getDeployedResource(ctx, ctx.provider, ns1Manifest!, log), "ns1resource").to.exist
      expect(await getDeployedResource(ctx, ctx.provider, ns2Manifest!, log), "ns2resource").to.not.exist
    })
  })
})
