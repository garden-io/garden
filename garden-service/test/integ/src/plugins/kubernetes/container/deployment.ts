/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { Garden } from "../../../../../../src/garden"
import { ConfigGraph } from "../../../../../../src/config-graph"
import { emptyRuntimeContext } from "../../../../../../src/runtime-context"
import { KubeApi } from "../../../../../../src/plugins/kubernetes/api"
import { createWorkloadManifest } from "../../../../../../src/plugins/kubernetes/container/deployment"
import { KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config"
import { V1Secret } from "@kubernetes/client-node"
import { KubernetesResource } from "../../../../../../src/plugins/kubernetes/types"
import { cloneDeep, keyBy } from "lodash"
import { getContainerTestGarden } from "./container"
import { DeployTask } from "../../../../../../src/tasks/deploy"
import { getServiceStatuses } from "../../../../../../src/tasks/base"

describe("kubernetes container deployment handlers", () => {
  let garden: Garden
  let graph: ConfigGraph
  let provider: KubernetesProvider
  let api: KubeApi

  after(async () => {
    if (garden) {
      await garden.close()
    }
  })

  const init = async (environmentName: string) => {
    garden = await getContainerTestGarden(environmentName)

    graph = await garden.getConfigGraph(garden.log)
    provider = <KubernetesProvider>await garden.resolveProvider("local-kubernetes")
    api = await KubeApi.factory(garden.log, provider)
  }

  describe("createWorkloadManifest", () => {
    before(async () => {
      await init("local")
    })

    it("should create a basic Deployment resource", async () => {
      const service = await graph.getService("simple-service")

      const resource = await createWorkloadManifest({
        api,
        provider,
        service,
        runtimeContext: emptyRuntimeContext,
        namespace: garden.projectName,
        enableHotReload: false,
        log: garden.log,
        production: false,
      })

      const version = service.module.version.versionString

      expect(resource).to.eql({
        kind: "Deployment",
        apiVersion: "apps/v1",
        metadata: {
          name: "simple-service-" + version,
          annotations: { "garden.io/configured.replicas": "1" },
          namespace: "container",
          labels: { "module": "simple-service", "service": "simple-service", "garden.io/version": version },
        },
        spec: {
          selector: { matchLabels: { "service": "simple-service", "garden.io/version": version } },
          template: {
            metadata: {
              labels: { "module": "simple-service", "service": "simple-service", "garden.io/version": version },
            },
            spec: {
              containers: [
                {
                  name: "simple-service",
                  image: "simple-service:" + version,
                  env: [
                    { name: "POD_NAME", valueFrom: { fieldRef: { fieldPath: "metadata.name" } } },
                    { name: "POD_NAMESPACE", valueFrom: { fieldRef: { fieldPath: "metadata.namespace" } } },
                    { name: "POD_IP", valueFrom: { fieldRef: { fieldPath: "status.podIP" } } },
                    { name: "POD_SERVICE_ACCOUNT", valueFrom: { fieldRef: { fieldPath: "spec.serviceAccountName" } } },
                  ],
                  ports: [{ name: "http", protocol: "TCP", containerPort: 8080 }],
                  resources: { requests: { cpu: "10m", memory: "64Mi" }, limits: { cpu: "1", memory: "1Gi" } },
                  imagePullPolicy: "IfNotPresent",
                  securityContext: { allowPrivilegeEscalation: false },
                },
              ],
              restartPolicy: "Always",
              terminationGracePeriodSeconds: 5,
              dnsPolicy: "ClusterFirst",
            },
          },
          replicas: 1,
          strategy: { type: "RollingUpdate", rollingUpdate: { maxUnavailable: 1, maxSurge: 1 } },
          revisionHistoryLimit: 3,
        },
      })
    })

    it("should copy and reference imagePullSecrets", async () => {
      const service = await graph.getService("simple-service")
      const secretName = "test-docker-auth"

      const authSecret: KubernetesResource<V1Secret> = {
        apiVersion: "v1",
        kind: "Secret",
        type: "kubernetes.io/dockerconfigjson",
        metadata: {
          name: secretName,
          namespace: "default",
        },
        stringData: {
          ".dockerconfigjson": JSON.stringify({ auths: {} }),
        },
      }
      await api.upsert({ kind: "Secret", namespace: "default", obj: authSecret, log: garden.log })

      const namespace = garden.projectName
      const _provider = cloneDeep(provider)
      _provider.config.imagePullSecrets = [{ name: secretName, namespace: "default" }]

      const resource = await createWorkloadManifest({
        api,
        provider: _provider,
        service,
        runtimeContext: emptyRuntimeContext,
        namespace,
        enableHotReload: false,
        log: garden.log,
        production: false,
      })

      const copiedSecret = await api.core.readNamespacedSecret(secretName, namespace)
      expect(copiedSecret).to.exist
      expect(resource.spec.template.spec.imagePullSecrets).to.eql([{ name: secretName }])
    })
  })

  describe("deployContainerService", () => {
    context("local mode", () => {
      before(async () => {
        await init("local")
      })

      it("should deploy a simple service", async () => {
        const service = await graph.getService("simple-service")

        const deployTask = new DeployTask({
          garden,
          graph,
          log: garden.log,
          service,
          force: true,
          forceBuild: false,
        })

        const results = await garden.processTasks([deployTask], { throwOnError: true })
        const statuses = getServiceStatuses(results)
        const status = statuses[service.name]
        const resources = keyBy(status.detail["remoteResources"], "kind")
        expect(resources.Deployment.spec.template.spec.containers[0].image).to.equal(
          `${service.name}:${service.module.version.versionString}`
        )
      })
    })

    context("cluster-docker mode", () => {
      before(async () => {
        await init("cluster-docker")
      })

      it("should deploy a simple service", async () => {
        const service = await graph.getService("simple-service")

        const deployTask = new DeployTask({
          garden,
          graph,
          log: garden.log,
          service,
          force: true,
          forceBuild: false,
        })

        const results = await garden.processTasks([deployTask], { throwOnError: true })
        const statuses = getServiceStatuses(results)
        const status = statuses[service.name]
        const resources = keyBy(status.detail["remoteResources"], "kind")
        expect(resources.Deployment.spec.template.spec.containers[0].image).to.equal(
          `127.0.0.1:5000/container/${service.name}:${service.module.version.versionString}`
        )
      })
    })

    context("kaniko mode", () => {
      before(async () => {
        await init("kaniko")
      })

      it("should deploy a simple service", async () => {
        const service = await graph.getService("simple-service")

        const deployTask = new DeployTask({
          garden,
          graph,
          log: garden.log,
          service,
          force: true,
          forceBuild: false,
        })

        const results = await garden.processTasks([deployTask], { throwOnError: true })
        const statuses = getServiceStatuses(results)
        const status = statuses[service.name]
        const resources = keyBy(status.detail["remoteResources"], "kind")
        expect(resources.Deployment.spec.template.spec.containers[0].image).to.equal(
          `127.0.0.1:5000/container/${service.name}:${service.module.version.versionString}`
        )
      })
    })

    context("cluster-docker-remote-registry mode", () => {
      before(async () => {
        await init("cluster-docker-remote-registry")
      })

      it("should deploy a simple service (remote only)", async () => {
        const service = await graph.getService("remote-registry-test")

        const deployTask = new DeployTask({
          garden,
          graph,
          log: garden.log,
          service,
          force: true,
          forceBuild: false,
        })

        const results = await garden.processTasks([deployTask], { throwOnError: true })
        const statuses = getServiceStatuses(results)
        const status = statuses[service.name]
        const resources = keyBy(status.detail["remoteResources"], "kind")
        expect(resources.Deployment.spec.template.spec.containers[0].image).to.equal(
          `index.docker.io/gardendev/${service.name}:${service.module.version.versionString}`
        )
      })
    })

    context("kaniko-remote-registry mode", () => {
      before(async () => {
        await init("kaniko-remote-registry")
      })

      it("should deploy a simple service (remote only)", async () => {
        const service = await graph.getService("remote-registry-test")

        const deployTask = new DeployTask({
          garden,
          graph,
          log: garden.log,
          service,
          force: true,
          forceBuild: false,
        })

        const results = await garden.processTasks([deployTask], { throwOnError: true })
        const statuses = getServiceStatuses(results)
        const status = statuses[service.name]
        const resources = keyBy(status.detail["remoteResources"], "kind")
        expect(resources.Deployment.spec.template.spec.containers[0].image).to.equal(
          `index.docker.io/gardendev/${service.name}:${service.module.version.versionString}`
        )
      })
    })
  })
})
