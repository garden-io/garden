/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { ConfigGraph } from "../../../../../../src/graph/config-graph"
import { KubeApi, KubernetesError } from "../../../../../../src/plugins/kubernetes/api"
import {
  createContainerManifests,
  createWorkloadManifest,
  getDeploymentLabels,
  handleChangedSelector,
} from "../../../../../../src/plugins/kubernetes/container/deployment"
import { KubernetesPluginContext, KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config"
import { V1ConfigMap, V1Secret } from "@kubernetes/client-node"
import { KubernetesResource, KubernetesWorkload } from "../../../../../../src/plugins/kubernetes/types"
import cloneDeep from "fast-copy"
import { keyBy } from "lodash"
import { getContainerTestGarden } from "./container"
import { DeployTask } from "../../../../../../src/tasks/deploy"
import { TestGarden, expectError, findNamespaceStatusEvent, grouped } from "../../../../../helpers"
import { kilobytesToString, millicpuToString } from "../../../../../../src/plugins/kubernetes/util"
import { getDeployedImageId, getResourceRequirements } from "../../../../../../src/plugins/kubernetes/container/util"
import { isConfiguredForSyncMode } from "../../../../../../src/plugins/kubernetes/status/status"
import {
  ContainerDeployAction,
  ContainerDeployActionConfig,
  ContainerDeployOutputs,
} from "../../../../../../src/plugins/container/moduleConfig"
import { apply } from "../../../../../../src/plugins/kubernetes/kubectl"
import { getAppNamespace } from "../../../../../../src/plugins/kubernetes/namespace"
import { gardenAnnotationKey } from "../../../../../../src/util/string"
import {
  k8sReverseProxyImageName,
  k8sSyncUtilImageName,
  PROXY_CONTAINER_SSH_TUNNEL_PORT,
  PROXY_CONTAINER_SSH_TUNNEL_PORT_NAME,
  PROXY_CONTAINER_USER_NAME,
} from "../../../../../../src/plugins/kubernetes/constants"
import {
  LocalModeEnv,
  LocalModeProcessRegistry,
  ProxySshKeystore,
} from "../../../../../../src/plugins/kubernetes/local-mode"
import stripAnsi from "strip-ansi"
import { getDeployStatuses } from "../../../../../../src/tasks/helpers"
import { ResolvedDeployAction } from "../../../../../../src/actions/deploy"
import { ActionRouter } from "../../../../../../src/router/router"
import { ActionMode } from "../../../../../../src/actions/types"
import { createActionLog } from "../../../../../../src/logger/log-entry"
import { K8_POD_DEFAULT_CONTAINER_ANNOTATION_KEY } from "../../../../../../src/plugins/kubernetes/run"

describe("kubernetes container deployment handlers", () => {
  let garden: TestGarden
  let cleanup: (() => void) | undefined
  let router: ActionRouter
  let graph: ConfigGraph
  let ctx: KubernetesPluginContext
  let provider: KubernetesProvider
  let api: KubeApi
  let deploymentRegistry: string | undefined

  async function resolveDeployAction(name: string, mode: ActionMode = "default") {
    if (mode !== "default") {
      graph = await garden.getConfigGraph({ log: garden.log, emit: false, actionModes: { [mode]: ["deploy." + name] } })
    }
    return garden.resolveAction<ContainerDeployAction>({ action: graph.getDeploy(name), log: garden.log, graph })
  }

  beforeEach(async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
  })

  after(async () => {
    if (garden) {
      garden.close()
    }
  })

  const init = async (environmentName: string, remoteContainerAuth = false) => {
    ;({ garden, cleanup } = await getContainerTestGarden(environmentName, { remoteContainerAuth }))
    router = await garden.getActionRouter()
    provider = <KubernetesProvider>await garden.resolveProvider(garden.log, "local-kubernetes")
    ctx = <KubernetesPluginContext>(
      await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
    )
    api = await KubeApi.factory(garden.log, ctx, provider)
    deploymentRegistry = provider.config.deploymentRegistry
      ? `${provider.config.deploymentRegistry.hostname}/${provider.config.deploymentRegistry.namespace}`
      : undefined
  }

  describe("createContainerManifests", () => {
    before(async () => {
      await init("local")
    })

    after(async () => {
      if (cleanup) {
        cleanup()
      }
    })

    afterEach(async () => {
      LocalModeProcessRegistry.getInstance().shutdown()
      ProxySshKeystore.getInstance(garden.log).shutdown(garden.log)
    })

    function expectSshContainerPort(workload: KubernetesWorkload) {
      const appContainerSpec = workload.spec.template?.spec?.containers.find((c) => c.name === "local-mode")
      const workloadSshPort = appContainerSpec!.ports!.find((p) => p.name === PROXY_CONTAINER_SSH_TUNNEL_PORT_NAME)
      expect(workloadSshPort!.containerPort).to.eql(PROXY_CONTAINER_SSH_TUNNEL_PORT)
    }

    function expectEmptyContainerArgs(workload: KubernetesWorkload) {
      const appContainerSpec = workload.spec.template?.spec?.containers.find((c) => c.name === "local-mode")
      expect(appContainerSpec!.args).to.eql([])
    }

    function expectProxyContainerImage(workload: KubernetesWorkload) {
      const appContainerSpec = workload.spec.template?.spec?.containers.find((c) => c.name === "local-mode")
      expect(appContainerSpec!.image).to.eql(k8sReverseProxyImageName)
    }

    function expectContainerEnvVars(workload: KubernetesWorkload) {
      const appContainerSpec = workload.spec.template?.spec?.containers.find((c) => c.name === "local-mode")
      const env = appContainerSpec!.env!

      const httpPort = appContainerSpec!.ports!.find((p) => p.name === "http")!.containerPort.toString()
      const appPortEnvVar = env.find((v) => v.name === LocalModeEnv.GARDEN_REMOTE_CONTAINER_PORTS)!.value
      expect(appPortEnvVar).to.eql(httpPort)

      const proxyUserEnvVar = env.find((v) => v.name === LocalModeEnv.GARDEN_PROXY_CONTAINER_USER_NAME)!.value
      expect(proxyUserEnvVar).to.eql(PROXY_CONTAINER_USER_NAME)

      const publicKeyEnvVar = env.find((v) => v.name === LocalModeEnv.GARDEN_PROXY_CONTAINER_PUBLIC_KEY)!.value
      expect(!!publicKeyEnvVar).to.be.true
    }

    function expectNoProbes(workload: KubernetesWorkload) {
      const appContainerSpec = workload.spec.template?.spec?.containers.find((c) => c.name === "local-mode")
      expect(appContainerSpec!.livenessProbe).to.be.undefined
      expect(appContainerSpec!.readinessProbe).to.be.undefined
    }

    context("with localMode only", () => {
      it("Workflow should have ssh container port when in local mode", async () => {
        const action = await resolveDeployAction("local-mode", "local") // <----

        const { workload } = await createContainerManifests({
          ctx,
          api,
          action,
          log: createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind }),
          imageId: getDeployedImageId(action, provider),
        })

        expectSshContainerPort(workload)
      })

      it("Workflow should have empty container args when in local mode", async () => {
        const action = await resolveDeployAction("local-mode", "local") // <----

        const { workload } = await createContainerManifests({
          ctx,
          api,
          action,
          log: createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind }),
          imageId: getDeployedImageId(action, provider),
        })

        expectEmptyContainerArgs(workload)
      })

      it("Workflow should have extra env vars for proxy container when in local mode", async () => {
        const action = await resolveDeployAction("local-mode", "local") // <----

        const { workload } = await createContainerManifests({
          ctx,
          api,
          action,
          log: createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind }),
          imageId: getDeployedImageId(action, provider),
        })

        expectContainerEnvVars(workload)
      })

      it("Workflow should not have liveness and readiness probes when in local mode", async () => {
        const action = await resolveDeployAction("local-mode", "local") // <----

        const { workload } = await createContainerManifests({
          ctx,
          api,
          action,
          log: createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind }),
          imageId: getDeployedImageId(action, provider),
        })

        expectNoProbes(workload)
      })
    })

    context("localMode always takes precedence over syncMode", () => {
      it("Workflow should have ssh container port when in local mode", async () => {
        const action = await resolveDeployAction("local-mode", "local") // <----

        const { workload } = await createContainerManifests({
          ctx,
          api,
          action,
          log: createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind }),
          imageId: getDeployedImageId(action, provider),
        })

        expectSshContainerPort(workload)
      })

      it("Workflow should have proxy container image and empty container args when in local mode", async () => {
        const action = await resolveDeployAction("local-mode", "local") // <----

        const { workload } = await createContainerManifests({
          ctx,
          api,
          action,
          log: createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind }),
          imageId: getDeployedImageId(action, provider),
        })

        expectProxyContainerImage(workload)
        expectEmptyContainerArgs(workload)
      })

      it("Workflow should have extra env vars for proxy container when in local mode", async () => {
        const action = await resolveDeployAction("local-mode", "local") // <----

        const { workload } = await createContainerManifests({
          ctx,
          api,
          action,
          log: createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind }),
          imageId: getDeployedImageId(action, provider),
        })

        expectContainerEnvVars(workload)
      })

      it("Workflow should not have liveness and readiness probes when in local mode", async () => {
        const action = await resolveDeployAction("local-mode", "local") // <----

        const { workload } = await createContainerManifests({
          ctx,
          api,
          action,
          log: createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind }),
          imageId: getDeployedImageId(action, provider),
        })

        expectNoProbes(workload)
      })
    })
  })

  describe("createWorkloadManifest", () => {
    before(async () => {
      await init("local")
    })

    after(async () => {
      if (cleanup) {
        cleanup()
      }
    })

    it("should create a basic Deployment resource", async () => {
      const action = await resolveDeployAction("simple-service")
      const namespace = provider.config.namespace!.name!

      const imageId = getDeployedImageId(action, provider)

      const resource = await createWorkloadManifest({
        ctx,
        api,
        provider,
        action,
        imageId,
        namespace,
        log: createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind }),
        production: false,
      })

      const spec = action.getSpec()

      expect(resource).to.eql({
        kind: "Deployment",
        apiVersion: "apps/v1",
        metadata: {
          name: "simple-service",
          annotations: { "garden.io/configured.replicas": "1" },
          namespace,
          labels: getDeploymentLabels(action),
        },
        spec: {
          selector: { matchLabels: { [gardenAnnotationKey("action")]: action.key() } },
          template: {
            metadata: {
              annotations: {
                [K8_POD_DEFAULT_CONTAINER_ANNOTATION_KEY]: "simple-service",
              },
              labels: getDeploymentLabels(action),
            },
            spec: {
              containers: [
                {
                  name: "simple-service",
                  image: imageId,
                  command: ["sh", "-c", "echo Server running... && nc -l -p 8080"],
                  env: [
                    { name: "GARDEN_ACTION_VERSION", value: action.getFullVersion().versionString },
                    { name: "GARDEN_MODULE_VERSION", value: action.getFullVersion().versionString },
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

    it("should attach Deploy annotations to Pod template", async () => {
      const action = await resolveDeployAction("simple-service")
      const namespace = provider.config.namespace!.name!

      action["_config"].spec.annotations = {
        "annotation.key": "someValue",
        [K8_POD_DEFAULT_CONTAINER_ANNOTATION_KEY]: "simple-service",
      }

      const resource = await createWorkloadManifest({
        ctx,
        api,
        provider,
        action,
        imageId: getDeployedImageId(action, provider),
        namespace,
        log: createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind }),
        production: false,
      })

      expect(resource.spec.template?.metadata?.annotations).to.eql(action.getSpec().annotations)
    })

    it("should override max resources with limits if limits are specified", async () => {
      const action = await resolveDeployAction("simple-service")
      const namespace = provider.config.namespace!.name!

      const limits = {
        cpu: 123,
        memory: 321,
      }

      action["_config"].spec.limits = limits

      const resource = await createWorkloadManifest({
        ctx,
        api,
        provider,
        action,
        imageId: getDeployedImageId(action, provider),
        namespace,
        log: createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind }),
        production: false,
      })

      expect(resource.spec.template?.spec?.containers[0].resources?.limits).to.eql({
        cpu: millicpuToString(limits.cpu),
        memory: kilobytesToString(limits.memory * 1024),
      })
    })

    it("should apply security context fields if specified", async () => {
      const action = await resolveDeployAction("simple-service")
      const namespace = provider.config.namespace!.name!
      action["_config"].spec.privileged = true
      action["_config"].spec.addCapabilities = ["SYS_TIME"]
      action["_config"].spec.dropCapabilities = ["NET_ADMIN"]

      const resource = await createWorkloadManifest({
        ctx,
        api,
        provider,
        action,
        imageId: getDeployedImageId(action, provider),
        namespace,
        log: createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind }),
        production: false,
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

    it("should configure the service for sync with sync mode enabled", async () => {
      const action = await resolveDeployAction("sync-mode", "sync") // <----
      const namespace = provider.config.namespace!.name!

      const resource = await createWorkloadManifest({
        ctx,
        api,
        provider,
        action,
        imageId: getDeployedImageId(action, provider),
        namespace,
        log: createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind }),
        production: false,
      })

      expect(isConfiguredForSyncMode(resource)).to.eq(true)

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

      const appContainerSpec = resource.spec.template?.spec?.containers.find((c) => c.name === "sync-mode")
      expect(appContainerSpec!.volumeMounts).to.exist
      expect(appContainerSpec!.volumeMounts![0]!.name).to.eq("garden")
    })

    it("should configure the service for sync with sync mode enabled", async () => {
      const action = await resolveDeployAction("sync-mode", "sync") // <----
      const namespace = provider.config.namespace!.name!

      const resource = await createWorkloadManifest({
        ctx,
        api,
        provider,
        action,
        imageId: getDeployedImageId(action, provider),
        namespace,
        log: createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind }),
        production: false,
      })

      const appContainerSpec = resource.spec.template?.spec?.containers.find((c) => c.name === "sync-mode")
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

    it("should copy and reference imagePullSecrets with docker basic auth", async () => {
      const action = await resolveDeployAction("simple-service")
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
        ctx,
        api,
        provider: _provider,
        action,
        imageId: getDeployedImageId(action, provider),
        namespace,
        log: createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind }),
        production: false,
      })

      const copiedSecret = await api.core.readNamespacedSecret(secretName, namespace)
      expect(copiedSecret).to.exist
      expect(resource.spec.template?.spec?.imagePullSecrets).to.eql([{ name: secretName }])
    })

    it("should copy and reference imagePullSecrets with docker credential helper", async () => {
      const action = await resolveDeployAction("simple-service")
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
        ctx,
        api,
        provider: _provider,
        action,
        imageId: getDeployedImageId(action, provider),
        namespace,
        log: createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind }),
        production: false,
      })

      const copiedSecret = await api.core.readNamespacedSecret(secretName, namespace)
      expect(copiedSecret).to.exist
      expect(resource.spec.template?.spec?.imagePullSecrets).to.eql([{ name: secretName }])
    })

    it("should correctly mount a referenced PVC module", async () => {
      const action = await resolveDeployAction("volume-reference")
      const namespace = provider.config.namespace!.name!

      const resource = await createWorkloadManifest({
        ctx,
        api,
        provider,
        action,
        imageId: getDeployedImageId(action, provider),
        namespace,
        log: createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind }),
        production: false,
      })

      expect(resource.spec.template?.spec?.volumes).to.eql([
        { name: "test", persistentVolumeClaim: { claimName: "volume-module" } },
      ])
      expect(resource.spec.template?.spec?.containers[0].volumeMounts).to.eql([{ name: "test", mountPath: "/volume" }])
    })

    it("should correctly mount a referenced ConfigMap module", async () => {
      const action = await resolveDeployAction("configmap-reference")
      const namespace = provider.config.namespace!.name!

      const resource = await createWorkloadManifest({
        ctx,
        api,
        provider,
        action,
        imageId: getDeployedImageId(action, provider),
        namespace,
        log: createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind }),
        production: false,
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
      const action = await resolveDeployAction("volume-reference")
      const namespace = provider.config.namespace!.name!

      action["_config"].spec.volumes = [
        { name: "test", containerPath: "TODO-G2", action: { name: "simple-service", kind: "Deploy" } },
      ]

      await expectError(
        () =>
          createWorkloadManifest({
            ctx,
            api,
            provider,
            action,
            imageId: getDeployedImageId(action, provider),
            namespace,
            log: createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind }),
            production: false,
          }),
        (err) =>
          expect(stripAnsi(err.message)).to.include(
            "Deploy type=container name=volume-reference (from module volume-reference) specifies a unsupported config simple-service for volume mount test. Only `persistentvolumeclaim` and `configmap` action are supported at this time."
          )
      )
    })
  })

  describe("k8sContainerDeploy", () => {
    let action: ResolvedDeployAction
    context("local mode", () => {
      before(async () => {
        await init("local")
      })

      after(async () => {
        if (cleanup) {
          cleanup()
        }
      })

      beforeEach(async () => {
        action = await resolveDeployAction("simple-service")
      })

      afterEach(async () => {
        try {
          await api.apps.deleteNamespacedDeployment(action.name, provider.config.namespace!.name)
        } catch (err) {}
      })

      it("should deploy a simple Deploy", async () => {
        const deployTask = new DeployTask({
          garden,
          graph,
          log: garden.log,
          action,
          force: true,
          forceBuild: false,
        })

        garden.events.eventLog = []
        const results = await garden.processTasks({ tasks: [deployTask], log: garden.log, throwOnError: true })
        const statuses = getDeployStatuses(results.results)
        const status = statuses[action.name]
        const resources = keyBy(status.detail?.detail["remoteResources"], "kind")

        expect(findNamespaceStatusEvent(garden.events.eventLog, "container-default")).to.exist
        expect(resources.Deployment.metadata.annotations["garden.io/version"]).to.equal(`${action.versionString()}`)
        expect(resources.Deployment.spec.template.spec.containers[0].image).to.equal(
          `${action.name}:${action.getBuildAction()?.versionString()}`
        )
      })

      it("should prune previously applied resources when deploying", async () => {
        const log = garden.log
        const namespace = await getAppNamespace(ctx, log, provider)

        const mapToNotPruneKey = "should-not-be-pruned"
        const mapToPruneKey = "should-be-pruned"

        const labels = { [gardenAnnotationKey("service")]: action.name }

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

        try {
          await api.core.deleteNamespacedConfigMap(mapToNotPruneKey, namespace)
        } catch (_e) {}

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
          action,
          force: true,
          forceBuild: false,
        })

        await garden.processTasks({ tasks: [deployTask], log: garden.log, throwOnError: true })

        // We expect this `ConfigMap` to still exist.
        await api.core.readNamespacedConfigMap(mapToNotPruneKey, namespace)

        // ...and we expect this `ConfigMap` to have been deleted.
        await expectError(
          () => api.core.readNamespacedConfigMap(mapToPruneKey, namespace),
          (err) => {
            expect(stripAnsi(err.message)).to.match(
              /Error while performing Kubernetes API operation readNamespacedConfigMap/
            )
            expect(stripAnsi(err.message)).to.match(/Response status code: 404/)
            expect(stripAnsi(err.message)).to.match(/Kubernetes Message: configmaps "should-be-pruned" not found/)
          }
        )

        await api.core.deleteNamespacedConfigMap(mapToNotPruneKey, namespace)
      })

      it("should ignore empty env vars in status check comparison", async () => {
        action["_config"].spec.env = {
          FOO: "banana",
          BAR: "",
          BAZ: null,
        }

        const deployTask = new DeployTask({
          garden,
          graph,
          log: garden.log,
          action,
          force: true,
          forceBuild: false,
        })

        const results = await garden.processTasks({ tasks: [deployTask], log: garden.log, throwOnError: true })
        const statuses = getDeployStatuses(results.results)
        const status = statuses[action.name]
        expect(status.state).to.eql("ready")
      })

      it("should deploy a service referencing a volume module", async () => {
        const action = await resolveDeployAction("volume-reference")

        const deployTask = new DeployTask({
          garden,
          graph,
          log: garden.log,
          action,
          force: true,
          forceBuild: false,
        })

        const results = await garden.processTasks({ tasks: [deployTask], log: garden.log, throwOnError: true })
        const statuses = getDeployStatuses(results.results)
        const status = statuses[action.name]
        const resources = keyBy(status.detail?.detail["remoteResources"], "kind")

        expect(status.state === "ready")
        expect(resources.Deployment.spec.template.spec.volumes).to.eql([
          { name: "test", persistentVolumeClaim: { claimName: "volume-module" } },
        ])
        expect(resources.Deployment.spec.template.spec.containers[0].volumeMounts).to.eql([
          { name: "test", mountPath: "/volume" },
        ])
      })
    })

    grouped("kaniko", "remote-only").context("kaniko", () => {
      before(async () => {
        await init("kaniko", true)
      })

      after(async () => {
        if (cleanup) {
          cleanup()
        }
      })

      const processDeployAction = async (
        resolvedAction: ResolvedDeployAction<ContainerDeployActionConfig, ContainerDeployOutputs, any>
      ) => {
        const deployTask = new DeployTask({
          garden,
          graph,
          log: garden.log,
          action: resolvedAction,
          force: true,
          forceBuild: false,
        })

        const results = await garden.processTasks({ tasks: [deployTask], log: garden.log, throwOnError: true })
        const statuses = getDeployStatuses(results.results)

        return statuses[resolvedAction.name]
      }

      it.skip("should deploy a simple service without dockerfile", async () => {
        const action = await resolveDeployAction("simple-server-busybox")
        const status = await processDeployAction(action)

        const resources = keyBy(status.detail?.detail["remoteResources"], "kind")
        const buildVersionString = action.getBuildAction()?.versionString()

        // Note: the image version should match the image in the module not the
        // deploy action version
        expect(resources.Deployment.spec.template.spec.containers[0].image).to.equal(`busybox:1.31.1`)
      })

      it.skip("should deploy a simple service without image", async () => {
        const action = await resolveDeployAction("remote-registry-test")
        const status = await processDeployAction(action)

        const resources = keyBy(status.detail?.detail["remoteResources"], "kind")
        const buildVersionString = action.getBuildAction()?.versionString()

        // Note: the image version should match the build action version and not the
        // deploy action version
        expect(resources.Deployment.spec.template.spec.containers[0].image).to.eql(
          `${deploymentRegistry}/${action.name}:${buildVersionString}`
        )
      })

      it.skip("should deploy a simple service with absolute image path", async () => {
        const action = await resolveDeployAction("remote-registry-test-absolute-image")
        const status = await processDeployAction(action)

        const resources = keyBy(status.detail?.detail["remoteResources"], "kind")
        const buildVersionString = action.getBuildAction()?.versionString()

        // Note: the image version should match the build action version and not the
        // deploy action version
        expect(resources.Deployment.spec.template.spec.containers[0].image).to.equal(
          `${deploymentRegistry}/${action.name}:${buildVersionString}`
        )
      })

      it.skip("should deploy a simple service with relative image path", async () => {
        const action = await resolveDeployAction("remote-registry-test-relative-image")
        const status = await processDeployAction(action)

        const resources = keyBy(status.detail?.detail["remoteResources"], "kind")
        const buildVersionString = action.getBuildAction()?.versionString()

        // Note: the image version should match the build action version and not the
        // deploy action version
        expect(resources.Deployment.spec.template.spec.containers[0].image).to.equal(
          `${deploymentRegistry}/${action.name}:${buildVersionString}`
        )
      })
    })
  })

  describe("handleChangedSelector", () => {
    before(async () => {
      await init("local")
    })

    let action: ResolvedDeployAction
    beforeEach(async () => {
      action = await resolveDeployAction("simple-service")
      await cleanupSpecChangedSimpleService(action)
    })
    afterEach(async () => {
      await cleanupSpecChangedSimpleService(action) // Clean up in case we're re-running the test case
    })

    after(async () => {
      if (cleanup) {
        cleanup()
      }
    })

    const deploySpecChangedSimpleService = async (
      action: ResolvedDeployAction<ContainerDeployActionConfig, ContainerDeployOutputs>
    ) => {
      const namespace = provider.config.namespace!.name
      const deploymentManifest = await createWorkloadManifest({
        ctx,
        api,
        provider,
        action,
        imageId: getDeployedImageId(action, provider),
        namespace,
        log: createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind }),
        production: false,
      })

      // Override to test spec change detection logic.
      deploymentManifest.spec.selector.matchLabels = {
        service: action.name,
      }
      deploymentManifest.metadata.labels = {
        service: action.name,
        module: action.name,
      }
      deploymentManifest.spec.template!.metadata!.labels = {
        service: action.name,
        module: action.name,
      }

      const pruneLabels = {
        service: action.name, // The pre-0.13 selector
        [gardenAnnotationKey("action")]: action.key(), // The 0.13+ selector
      }

      await apply({ log: garden.log, ctx, api, provider, manifests: [deploymentManifest], namespace, pruneLabels })
    }

    const cleanupSpecChangedSimpleService = async (
      action: ResolvedDeployAction<ContainerDeployActionConfig, ContainerDeployOutputs>
    ) => {
      try {
        await api.apps.deleteNamespacedDeployment(action.name, provider.config.namespace!.name)
      } catch (err) {}
    }

    const simpleServiceIsRunning = async (
      action: ResolvedDeployAction<ContainerDeployActionConfig, ContainerDeployOutputs>
    ) => {
      try {
        await api.apps.readNamespacedDeployment(action.name, provider.config.namespace!.name)
        return true
      } catch (err) {
        if (!(err instanceof KubernetesError)) {
          throw err
        }
        if (err.responseStatusCode === 404) {
          return false
        } else {
          throw err
        }
      }
    }

    it("should delete resources if production = false", async () => {
      const actionLog = createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind })

      await deploySpecChangedSimpleService(action)
      expect(await simpleServiceIsRunning(action)).to.eql(true)

      const { result: status } = await router.deploy.getStatus({
        graph,
        action,
        log: actionLog,
      })

      const specChangedResourceKeys: string[] = status.detail?.detail.selectorChangedResourceKeys || []
      expect(specChangedResourceKeys).to.eql(["Deployment/simple-service"])

      await handleChangedSelector({
        action,
        ctx,
        namespace: provider.config.namespace!.name,
        log: garden.log,
        specChangedResourceKeys,
        production: false, // <----
        force: false,
      })

      expect(await simpleServiceIsRunning(action)).to.eql(false)
    })

    it("should delete resources if production = true anad force = true", async () => {
      const actionLog = createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind })

      await deploySpecChangedSimpleService(action)
      expect(await simpleServiceIsRunning(action)).to.eql(true)

      const { result: status } = await router.deploy.getStatus({
        graph,
        action,
        log: actionLog,
      })

      const specChangedResourceKeys: string[] = status.detail?.detail.selectorChangedResourceKeys || []
      expect(specChangedResourceKeys).to.eql(["Deployment/simple-service"])

      await handleChangedSelector({
        action,
        ctx,
        namespace: provider.config.namespace!.name,
        log: actionLog,
        specChangedResourceKeys,
        production: true, // <----
        force: true, // <---
      })

      expect(await simpleServiceIsRunning(action)).to.eql(false)
    })

    it("should not delete resources and throw an error if production = true anad force = false", async () => {
      await deploySpecChangedSimpleService(action)
      expect(await simpleServiceIsRunning(action)).to.eql(true)
      const actionLog = createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind })

      const { result: status } = await router.deploy.getStatus({
        graph,
        action,
        log: actionLog,
      })

      const specChangedResourceKeys: string[] = status.detail?.detail.selectorChangedResourceKeys || []
      expect(specChangedResourceKeys).to.eql(["Deployment/simple-service"])

      await expectError(
        () =>
          handleChangedSelector({
            action,
            ctx,
            namespace: provider.config.namespace!.name,
            log: garden.log,
            specChangedResourceKeys,
            production: true, // <----
            force: false, // <---
          }),
        (err) =>
          expect(stripAnsi(err.message)).to.equal(
            "Deploy simple-service was deployed with a different spec.selector and needs to be deleted before redeploying. Since this environment has production = true, Garden won't automatically delete this resource. To do so, use the --force flag when deploying e.g. with the garden deploy command. You can also delete the resource from your cluster manually and try again."
          )
      )

      expect(await simpleServiceIsRunning(action)).to.eql(true)
    })
  })
})
