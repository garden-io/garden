/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
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
import { KubernetesPluginContext, KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config"
import { V1ConfigMap, V1Secret } from "@kubernetes/client-node"
import { KubernetesResource } from "../../../../../../src/plugins/kubernetes/types"
import { cloneDeep, keyBy } from "lodash"
import { getContainerTestGarden } from "./container"
import { DeployTask } from "../../../../../../src/tasks/deploy"
import { getServiceStatuses } from "../../../../../../src/tasks/base"
import { expectError, grouped } from "../../../../../helpers"
import { kilobytesToString, millicpuToString } from "../../../../../../src/plugins/kubernetes/util"
import { getResourceRequirements } from "../../../../../../src/plugins/kubernetes/container/util"
import { isConfiguredForDevMode } from "../../../../../../src/plugins/kubernetes/status/status"
import { ContainerService } from "../../../../../../src/plugins/container/config"
import { apply } from "../../../../../../src/plugins/kubernetes/kubectl"
import { getAppNamespace } from "../../../../../../src/plugins/kubernetes/namespace"
import { gardenAnnotationKey } from "../../../../../../src/util/string"
import {
  k8sSyncUtilImageName,
  PROXY_CONTAINER_SSH_TUNNEL_PORT,
  PROXY_CONTAINER_SSH_TUNNEL_PORT_NAME,
  PROXY_CONTAINER_USER_NAME,
} from "../../../../../../src/plugins/kubernetes/constants"
import stripAnsi = require("strip-ansi")

describe("kubernetes container deployment handlers", () => {
  let garden: Garden
  let graph: ConfigGraph
  let ctx: KubernetesPluginContext
  let provider: KubernetesProvider
  let api: KubeApi

  beforeEach(async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
  })

  after(async () => {
    if (garden) {
      await garden.close()
    }
  })

  const init = async (environmentName: string) => {
    garden = await getContainerTestGarden(environmentName)
    provider = <KubernetesProvider>await garden.resolveProvider(garden.log, "local-kubernetes")
    ctx = <KubernetesPluginContext>await garden.getPluginContext(provider)
    api = await KubeApi.factory(garden.log, ctx, provider)
  }

  describe("createWorkloadManifest", () => {
    before(async () => {
      await init("local")
    })

    it("should create a basic Deployment resource", async () => {
      const service = graph.getService("simple-service")
      const namespace = provider.config.namespace!.name!

      const resource = await createWorkloadManifest({
        api,
        provider,
        service,
        runtimeContext: emptyRuntimeContext,
        namespace,
        enableDevMode: false,
        enableHotReload: false,
        enableLocalMode: false,
        log: garden.log,
        production: false,
        blueGreen: false,
      })

      const buildVersion = service.module.version.versionString

      const spec = service.spec

      expect(resource).to.eql({
        kind: "Deployment",
        apiVersion: "apps/v1",
        metadata: {
          name: "simple-service",
          annotations: { "garden.io/configured.replicas": "1" },
          namespace,
          labels: { module: "simple-service", service: "simple-service" },
        },
        spec: {
          selector: { matchLabels: { service: "simple-service" } },
          template: {
            metadata: {
              annotations: {},
              labels: { module: "simple-service", service: "simple-service" },
            },
            spec: {
              containers: [
                {
                  name: "simple-service",
                  image: "simple-service:" + buildVersion,
                  command: ["sh", "-c", "echo Server running... && nc -l -p 8080"],
                  env: [
                    { name: "POD_HOST_IP", valueFrom: { fieldRef: { fieldPath: "status.hostIP" } } },
                    { name: "POD_IP", valueFrom: { fieldRef: { fieldPath: "status.podIP" } } },
                    { name: "POD_NAME", valueFrom: { fieldRef: { fieldPath: "metadata.name" } } },
                    { name: "POD_NAMESPACE", valueFrom: { fieldRef: { fieldPath: "metadata.namespace" } } },
                    { name: "POD_NODE_NAME", valueFrom: { fieldRef: { fieldPath: "spec.nodeName" } } },
                    { name: "POD_SERVICE_ACCOUNT", valueFrom: { fieldRef: { fieldPath: "spec.serviceAccountName" } } },
                    { name: "POD_UID", valueFrom: { fieldRef: { fieldPath: "metadata.uid" } } },
                  ],
                  ports: [{ name: "http", protocol: "TCP", containerPort: 8080 }],
                  resources: getResourceRequirements({ cpu: spec.cpu, memory: spec.memory }),
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

    it("should attach service annotations to Pod template", async () => {
      const service = graph.getService("simple-service")
      const namespace = provider.config.namespace!.name!

      service.spec.annotations = { "annotation.key": "someValue" }

      const resource = await createWorkloadManifest({
        api,
        provider,
        service,
        runtimeContext: emptyRuntimeContext,
        namespace,
        enableDevMode: false,
        enableHotReload: false,
        enableLocalMode: false,
        log: garden.log,
        production: false,
        blueGreen: false,
      })

      expect(resource.spec.template?.metadata?.annotations).to.eql(service.spec.annotations)
    })

    it("should override max resources with limits if limits are specified", async () => {
      const service = graph.getService("simple-service")
      const namespace = provider.config.namespace!.name!

      const limits = {
        cpu: 123,
        memory: 321,
      }

      service.spec.limits = limits

      const resource = await createWorkloadManifest({
        api,
        provider,
        service,
        runtimeContext: emptyRuntimeContext,
        namespace,
        enableDevMode: false,
        enableHotReload: false,
        enableLocalMode: false,
        log: garden.log,
        production: false,
        blueGreen: false,
      })

      expect(resource.spec.template?.spec?.containers[0].resources?.limits).to.eql({
        cpu: millicpuToString(limits.cpu),
        memory: kilobytesToString(limits.memory * 1024),
      })
    })

    it("should apply security context fields if specified", async () => {
      const service = graph.getService("simple-service")
      const namespace = provider.config.namespace!.name!
      service.spec.privileged = true
      service.spec.addCapabilities = ["SYS_TIME"]
      service.spec.dropCapabilities = ["NET_ADMIN"]

      const resource = await createWorkloadManifest({
        api,
        provider,
        service,
        runtimeContext: emptyRuntimeContext,
        namespace,
        enableDevMode: false,
        enableHotReload: false,
        enableLocalMode: false,
        log: garden.log,
        production: false,
        blueGreen: false,
      })

      expect(resource.spec.template?.spec?.containers[0].securityContext).to.eql({
        allowPrivilegeEscalation: true,
        privileged: true,
        capabilities: {
          add: ["SYS_TIME"],
          drop: ["NET_ADMIN"],
        },
      })
    })

    it("should increase liveness probes when in hot-reload mode", async () => {
      const service = graph.getService("hot-reload")
      const namespace = provider.config.namespace!.name!

      const resource = await createWorkloadManifest({
        api,
        provider,
        service,
        runtimeContext: emptyRuntimeContext,
        namespace,
        enableDevMode: false,
        enableHotReload: true,
        enableLocalMode: false,
        log: garden.log,
        production: false,
        blueGreen: false,
      })

      // Find the spec for the actual app container (as opposed to the rsync container)
      const containerSpec = resource.spec.template?.spec?.containers.find((c) => c.name === "hot-reload")

      expect(containerSpec!.livenessProbe).to.eql({
        initialDelaySeconds: 90,
        periodSeconds: 10,
        timeoutSeconds: 3,
        successThreshold: 1,
        failureThreshold: 30,
        exec: {
          command: ["echo", "ok"],
        },
      })
    })

    it("should configure the service for sync with dev mode enabled", async () => {
      const service = graph.getService("dev-mode")
      const namespace = provider.config.namespace!.name!

      const resource = await createWorkloadManifest({
        api,
        provider,
        service,
        runtimeContext: emptyRuntimeContext,
        namespace,
        enableDevMode: true, // <----
        enableHotReload: false,
        enableLocalMode: false,
        log: garden.log,
        production: false,
        blueGreen: false,
      })

      expect(isConfiguredForDevMode(resource)).to.eq(true)

      const initContainer = resource.spec.template?.spec?.initContainers![0]
      expect(initContainer).to.exist
      expect(initContainer!.name).to.eq("garden-dev-init")
      expect(initContainer!.volumeMounts).to.exist
      expect(initContainer!.volumeMounts![0]).to.eql({ name: "garden", mountPath: "/.garden" })

      expect(resource.spec.template?.spec?.initContainers).to.eql([
        {
          name: "garden-dev-init",
          image: k8sSyncUtilImageName,
          command: ["/bin/sh", "-c", "cp /usr/local/bin/mutagen-agent /.garden/mutagen-agent"],
          imagePullPolicy: "IfNotPresent",
          volumeMounts: [
            {
              name: "garden",
              mountPath: "/.garden",
            },
          ],
        },
      ])

      const appContainerSpec = resource.spec.template?.spec?.containers.find((c) => c.name === "dev-mode")
      expect(appContainerSpec!.volumeMounts).to.exist
      expect(appContainerSpec!.volumeMounts![0]!.name).to.eq("garden")
    })

    it("should increase liveness probes when in dev mode", async () => {
      const service = graph.getService("dev-mode")
      const namespace = provider.config.namespace!.name!

      const resource = await createWorkloadManifest({
        api,
        provider,
        service,
        runtimeContext: emptyRuntimeContext,
        namespace,
        enableDevMode: true, // <----
        enableHotReload: false,
        enableLocalMode: false,
        log: garden.log,
        production: false,
        blueGreen: false,
      })

      const appContainerSpec = resource.spec.template?.spec?.containers.find((c) => c.name === "dev-mode")
      expect(appContainerSpec!.livenessProbe).to.eql({
        initialDelaySeconds: 90,
        periodSeconds: 10,
        timeoutSeconds: 3,
        successThreshold: 1,
        failureThreshold: 30,
        exec: {
          command: ["echo", "ok"],
        },
      })
    })

    it("should remove liveness probes when in local mode", async () => {
      const service = graph.getService("local-mode")
      const namespace = provider.config.namespace!.name!

      const resource = await createWorkloadManifest({
        api,
        provider,
        service,
        runtimeContext: emptyRuntimeContext,
        namespace,
        enableDevMode: false,
        enableHotReload: false,
        enableLocalMode: true, // <----
        log: garden.log,
        production: false,
        blueGreen: false,
      })

      const appContainerSpec = resource.spec.template?.spec?.containers.find((c) => c.name === "local-mode")
      expect(appContainerSpec!.livenessProbe).to.be.undefined
    })

    it("should remove readiness probes when in local mode", async () => {
      const service = graph.getService("local-mode")
      const namespace = provider.config.namespace!.name!

      const resource = await createWorkloadManifest({
        api,
        provider,
        service,
        runtimeContext: emptyRuntimeContext,
        namespace,
        enableDevMode: false,
        enableHotReload: false,
        enableLocalMode: true, // <----
        log: garden.log,
        production: false,
        blueGreen: false,
      })

      const appContainerSpec = resource.spec.template?.spec?.containers.find((c) => c.name === "local-mode")
      expect(appContainerSpec!.readinessProbe).to.be.undefined
    })

    it("should have ssh container port when in local mode", async () => {
      const service = graph.getService("local-mode")
      const namespace = provider.config.namespace!.name!

      const resource = await createWorkloadManifest({
        api,
        provider,
        service,
        runtimeContext: emptyRuntimeContext,
        namespace,
        enableDevMode: false,
        enableHotReload: false,
        enableLocalMode: true, // <----
        log: garden.log,
        production: false,
        blueGreen: false,
      })

      const appContainerSpec = resource.spec.template?.spec?.containers.find((c) => c.name === "local-mode")
      const sshPort = appContainerSpec!.ports!.find((p) => p.name === PROXY_CONTAINER_SSH_TUNNEL_PORT_NAME)
      expect(sshPort!.containerPort).to.eql(PROXY_CONTAINER_SSH_TUNNEL_PORT)
    })

    it("should have extra env vars for proxy container when in local mode", async () => {
      const service = graph.getService("local-mode")
      const namespace = provider.config.namespace!.name!

      const resource = await createWorkloadManifest({
        api,
        provider,
        service,
        runtimeContext: emptyRuntimeContext,
        namespace,
        enableDevMode: false,
        enableHotReload: false,
        enableLocalMode: true, // <----
        log: garden.log,
        production: false,
        blueGreen: false,
      })

      const appContainerSpec = resource.spec.template?.spec?.containers.find((c) => c.name === "local-mode")
      const env = appContainerSpec!.env!

      const httpPort = appContainerSpec!.ports!.find((p) => p.name === "http")!.containerPort.toString()
      const appPortEnvVar = env.find((v) => v.name === "APP_PORT")!.value
      expect(appPortEnvVar).to.eql(httpPort)

      const proxyUserEnvVar = env.find((v) => v.name === "USER_NAME")!.value
      expect(proxyUserEnvVar).to.eql(PROXY_CONTAINER_USER_NAME)

      const publicKeyEnvVar = env.find((v) => v.name === "PUBLIC_KEY")!.value
      expect(!!publicKeyEnvVar).to.be.true
    })

    it("should name the Deployment with a version suffix and set a version label if blueGreen=true", async () => {
      const service = graph.getService("simple-service")
      const namespace = provider.config.namespace!.name!

      const resource = await createWorkloadManifest({
        api,
        provider,
        service,
        runtimeContext: emptyRuntimeContext,
        namespace,
        enableDevMode: false,
        enableHotReload: false,
        enableLocalMode: false,
        log: garden.log,
        production: false,
        blueGreen: true,
      })

      const version = service.version

      expect(resource.metadata.name).to.equal("simple-service-" + version)
      expect(resource.metadata.labels).to.eql({
        "module": "simple-service",
        "service": "simple-service",
        "garden.io/version": version,
      })
      expect(resource.spec.selector.matchLabels).to.eql({ "service": "simple-service", "garden.io/version": version })
    })

    it("should copy and reference imagePullSecrets with docker basic auth", async () => {
      const service = graph.getService("simple-service")
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

      const namespace = provider.config.namespace!.name!
      const _provider = cloneDeep(provider)
      _provider.config.imagePullSecrets = [{ name: secretName, namespace: "default" }]

      const resource = await createWorkloadManifest({
        api,
        provider: _provider,
        service,
        runtimeContext: emptyRuntimeContext,
        namespace,
        enableDevMode: false,
        enableHotReload: false,
        enableLocalMode: false,
        log: garden.log,
        production: false,
        blueGreen: false,
      })

      const copiedSecret = await api.core.readNamespacedSecret(secretName, namespace)
      expect(copiedSecret).to.exist
      expect(resource.spec.template?.spec?.imagePullSecrets).to.eql([{ name: secretName }])
    })

    it("should copy and reference imagePullSecrets with docker credential helper", async () => {
      const service = graph.getService("simple-service")
      const secretName = "test-cred-helper-auth"

      const authSecret: KubernetesResource<V1Secret> = {
        apiVersion: "v1",
        kind: "Secret",
        type: "kubernetes.io/dockerconfigjson",
        metadata: {
          name: secretName,
          namespace: "default",
        },
        stringData: {
          ".dockerconfigjson": JSON.stringify({ credHelpers: {} }),
        },
      }
      await api.upsert({ kind: "Secret", namespace: "default", obj: authSecret, log: garden.log })

      const namespace = provider.config.namespace!.name!
      const _provider = cloneDeep(provider)
      _provider.config.imagePullSecrets = [{ name: secretName, namespace: "default" }]

      const resource = await createWorkloadManifest({
        api,
        provider: _provider,
        service,
        runtimeContext: emptyRuntimeContext,
        namespace,
        enableDevMode: false,
        enableHotReload: false,
        enableLocalMode: false,
        log: garden.log,
        production: false,
        blueGreen: false,
      })

      const copiedSecret = await api.core.readNamespacedSecret(secretName, namespace)
      expect(copiedSecret).to.exist
      expect(resource.spec.template?.spec?.imagePullSecrets).to.eql([{ name: secretName }])
    })

    it("should correctly mount a referenced PVC module", async () => {
      const service = graph.getService("volume-reference")
      const namespace = provider.config.namespace!.name!

      const resource = await createWorkloadManifest({
        api,
        provider,
        service,
        runtimeContext: emptyRuntimeContext,
        namespace,
        enableDevMode: false,
        enableHotReload: false,
        enableLocalMode: false,
        log: garden.log,
        production: false,
        blueGreen: false,
      })

      expect(resource.spec.template?.spec?.volumes).to.eql([
        { name: "test", persistentVolumeClaim: { claimName: "volume-module" } },
      ])
      expect(resource.spec.template?.spec?.containers[0].volumeMounts).to.eql([{ name: "test", mountPath: "/volume" }])
    })

    it("should correctly mount a referenced ConfigMap module", async () => {
      const service = graph.getService("configmap-reference")
      const namespace = provider.config.namespace!.name!

      const resource = await createWorkloadManifest({
        api,
        provider,
        service,
        runtimeContext: emptyRuntimeContext,
        namespace,
        enableDevMode: false,
        enableHotReload: false,
        enableLocalMode: false,
        log: garden.log,
        production: false,
        blueGreen: false,
      })

      expect(resource.spec.template?.spec?.volumes).to.eql([
        {
          name: "test",
          configMap: {
            name: "configmap-module",
          },
        },
      ])
      expect(resource.spec.template?.spec?.containers[0].volumeMounts).to.eql([{ name: "test", mountPath: "/config" }])
    })

    it("should throw if incompatible module is specified as a volume module", async () => {
      const service = graph.getService("volume-reference")
      const namespace = provider.config.namespace!.name!

      service.spec.volumes = [{ name: "test", module: "simple-service" }]

      await expectError(
        () =>
          createWorkloadManifest({
            api,
            provider,
            service,
            runtimeContext: emptyRuntimeContext,
            namespace,
            enableDevMode: false,
            enableHotReload: false,
            enableLocalMode: false,
            log: garden.log,
            production: false,
            blueGreen: false,
          }),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(
            "Container module volume-reference specifies a unsupported module simple-service for volume mount test. Only `persistentvolumeclaim` and `configmap` modules are supported at this time."
          )
      )
    })
  })

  describe("deployContainerService", () => {
    context("local mode", () => {
      before(async () => {
        await init("local")
      })

      it("should deploy a simple service", async () => {
        const service = graph.getService("simple-service")

        const deployTask = new DeployTask({
          garden,
          graph,
          log: garden.log,
          service,
          force: true,
          forceBuild: false,
          devModeServiceNames: [],
          hotReloadServiceNames: [],
          localModeServiceNames: [],
        })

        const results = await garden.processTasks([deployTask], { throwOnError: true })
        const statuses = getServiceStatuses(results)
        const status = statuses[service.name]
        const resources = keyBy(status.detail["remoteResources"], "kind")
        expect(resources.Deployment.spec.template.spec.containers[0].image).to.equal(
          `${service.name}:${service.module.version.versionString}`
        )
        expect(status.namespaceStatuses).to.eql([
          {
            pluginName: "local-kubernetes",
            namespaceName: "container-default",
            state: "ready",
          },
        ])
      })

      it("should prune previously applied resources when deploying", async () => {
        const log = garden.log
        const service = graph.getService("simple-service")
        const namespace = await getAppNamespace(ctx, log, provider)

        const mapToNotPruneKey = "should-not-be-pruned"
        const mapToPruneKey = "should-be-pruned"

        const labels = { [gardenAnnotationKey("service")]: service.name }

        // This `ConfigMap` is created through `kubectl apply` below, which will add the
        // "kubectl.kubernetes.io/last-applied-configuration" annotation. We don't prune resources that lack this
        // annotation.
        const configMapToPrune: KubernetesResource<V1ConfigMap> = {
          apiVersion: "v1",
          kind: "ConfigMap",
          metadata: {
            name: mapToPruneKey,
            annotations: { ...labels },
            labels: { ...labels },
          },
          data: {},
        }

        await apply({ log, ctx, api, provider, manifests: [configMapToPrune], namespace })

        // Here, we create via the k8s API (not `kubetl apply`), so that unlike `configMapToPrune`, it won't acquire
        // the "last applied" annotation. This means that it should *not* be pruned when we deploy the service, even
        // though it has the service's label.
        await api.core.createNamespacedConfigMap(namespace, {
          apiVersion: "v1",
          kind: "ConfigMap",
          metadata: {
            name: mapToNotPruneKey,
            annotations: { ...labels },
            labels: { ...labels },
          },
          data: {},
        })

        const deployTask = new DeployTask({
          garden,
          graph,
          log,
          service,
          force: true,
          forceBuild: false,
          devModeServiceNames: [],
          hotReloadServiceNames: [],
          localModeServiceNames: [],
        })

        await garden.processTasks([deployTask], { throwOnError: true })

        // We expect this `ConfigMap` to still exist.
        await api.core.readNamespacedConfigMap(mapToNotPruneKey, namespace)

        // ...and we expect this `ConfigMap` to have been deleted.
        await expectError(
          () => api.core.readNamespacedConfigMap(mapToPruneKey, namespace),
          (err) => {
            expect(stripAnsi(err.message)).to.match(
              /Got error from Kubernetes API \(readNamespacedConfigMap\) - configmaps "should-be-pruned" not found/
            )
          }
        )

        await api.core.deleteNamespacedConfigMap(mapToNotPruneKey, namespace)
      })

      it("should ignore empty env vars in status check comparison", async () => {
        const service: ContainerService = graph.getService("simple-service")
        service.spec.env = {
          FOO: "banana",
          BAR: "",
          BAZ: null,
        }

        const deployTask = new DeployTask({
          garden,
          graph,
          log: garden.log,
          service,
          force: true,
          forceBuild: false,
          devModeServiceNames: [],
          hotReloadServiceNames: [],
          localModeServiceNames: [],
        })

        const results = await garden.processTasks([deployTask], { throwOnError: true })
        const statuses = getServiceStatuses(results)
        const status = statuses[service.name]
        expect(status.state).to.eql("ready")
      })

      it("should deploy a service referencing a volume module", async () => {
        const service = graph.getService("volume-reference")

        const deployTask = new DeployTask({
          garden,
          graph,
          log: garden.log,
          service,
          force: true,
          forceBuild: false,
          devModeServiceNames: [],
          hotReloadServiceNames: [],
          localModeServiceNames: [],
        })

        const results = await garden.processTasks([deployTask], { throwOnError: true })
        const statuses = getServiceStatuses(results)
        const status = statuses[service.name]
        const resources = keyBy(status.detail["remoteResources"], "kind")

        expect(status.state === "ready")
        expect(resources.Deployment.spec.template.spec.volumes).to.eql([
          { name: "test", persistentVolumeClaim: { claimName: "volume-module" } },
        ])
        expect(resources.Deployment.spec.template.spec.containers[0].volumeMounts).to.eql([
          { name: "test", mountPath: "/volume" },
        ])
      })
    })

    grouped("cluster-docker").context("cluster-docker mode", () => {
      before(async () => {
        await init("cluster-docker")
      })

      it("should deploy a simple service", async () => {
        const service = graph.getService("simple-service")

        const deployTask = new DeployTask({
          garden,
          graph,
          log: garden.log,
          service,
          force: true,
          forceBuild: false,
          devModeServiceNames: [],
          hotReloadServiceNames: [],
          localModeServiceNames: [],
        })

        const results = await garden.processTasks([deployTask], { throwOnError: true })
        const statuses = getServiceStatuses(results)
        const status = statuses[service.name]
        const resources = keyBy(status.detail["remoteResources"], "kind")
        expect(resources.Deployment.spec.template.spec.containers[0].image).to.equal(
          `127.0.0.1:5000/container/${service.name}:${service.module.version.versionString}`
        )
      })

      it("should deploy a service referencing a volume module", async () => {
        const service = graph.getService("volume-reference")

        const deployTask = new DeployTask({
          garden,
          graph,
          log: garden.log,
          service,
          force: true,
          forceBuild: false,
          devModeServiceNames: [],
          hotReloadServiceNames: [],
          localModeServiceNames: [],
        })

        const results = await garden.processTasks([deployTask], { throwOnError: true })
        const statuses = getServiceStatuses(results)
        const status = statuses[service.name]
        const resources = keyBy(status.detail["remoteResources"], "kind")

        expect(status.state === "ready")
        expect(resources.Deployment.spec.template.spec.volumes).to.eql([
          { name: "test", persistentVolumeClaim: { claimName: "volume-module" } },
        ])
        expect(resources.Deployment.spec.template.spec.containers[0].volumeMounts).to.eql([
          { name: "test", mountPath: "/volume" },
        ])
      })
    })

    grouped("kaniko").context("kaniko mode", () => {
      before(async () => {
        await init("kaniko")
      })

      it("should deploy a simple service", async () => {
        const service = graph.getService("simple-service")

        const deployTask = new DeployTask({
          garden,
          graph,
          log: garden.log,
          service,
          force: true,
          forceBuild: false,
          devModeServiceNames: [],
          hotReloadServiceNames: [],
          localModeServiceNames: [],
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

    grouped("cluster-docker", "remote-only").context("cluster-docker-remote-registry mode", () => {
      before(async () => {
        await init("cluster-docker-remote-registry")
      })

      it("should deploy a simple service", async () => {
        const service = graph.getService("remote-registry-test")

        const deployTask = new DeployTask({
          garden,
          graph,
          log: garden.log,
          service,
          force: true,
          forceBuild: false,
          devModeServiceNames: [],
          hotReloadServiceNames: [],
          localModeServiceNames: [],
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

    grouped("kaniko", "remote-only").context("kaniko-remote-registry mode", () => {
      before(async () => {
        await init("kaniko-remote-registry")
      })

      it("should deploy a simple service", async () => {
        const service = graph.getService("remote-registry-test")

        const deployTask = new DeployTask({
          garden,
          graph,
          log: garden.log,
          service,
          force: true,
          forceBuild: false,
          devModeServiceNames: [],
          hotReloadServiceNames: [],
          localModeServiceNames: [],
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
