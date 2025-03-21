/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import type { ConfigGraph } from "../../../../../../src/graph/config-graph.js"
import { KubeApi, KubernetesError } from "../../../../../../src/plugins/kubernetes/api.js"
import {
  createWorkloadManifest,
  getDeploymentLabels,
  handleChangedSelector,
} from "../../../../../../src/plugins/kubernetes/container/deployment.js"
import type { KubernetesPluginContext, KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config.js"
import type { V1ConfigMap, V1Secret } from "@kubernetes/client-node"
import type { KubernetesResource } from "../../../../../../src/plugins/kubernetes/types.js"
import cloneDeep from "fast-copy"
import { keyBy } from "lodash-es"
import { getContainerTestGarden } from "./container.js"
import { DeployTask } from "../../../../../../src/tasks/deploy.js"
import type { TestGarden } from "../../../../../helpers.js"
import { expectError, findNamespaceStatusEvent, grouped } from "../../../../../helpers.js"
import { kilobytesToString, millicpuToString } from "../../../../../../src/plugins/kubernetes/util.js"
import { getDeployedImageId, getResourceRequirements } from "../../../../../../src/plugins/kubernetes/container/util.js"
import { isConfiguredForSyncMode } from "../../../../../../src/plugins/kubernetes/status/status.js"
import type {
  ContainerDeployAction,
  ContainerDeployActionConfig,
  ContainerDeployOutputs,
} from "../../../../../../src/plugins/container/moduleConfig.js"
import { apply } from "../../../../../../src/plugins/kubernetes/kubectl.js"
import { getAppNamespace } from "../../../../../../src/plugins/kubernetes/namespace.js"
import { gardenAnnotationKey } from "../../../../../../src/util/string.js"
import {
  getK8sSyncUtilImagePath,
  k8sSyncUtilContainerName,
} from "../../../../../../src/plugins/kubernetes/constants.js"

import stripAnsi from "strip-ansi"
import { getDeployStatuses } from "../../../../../../src/tasks/helpers.js"
import type { ResolvedDeployAction } from "../../../../../../src/actions/deploy.js"
import type { ActionRouter } from "../../../../../../src/router/router.js"
import type { ActionMode } from "../../../../../../src/actions/types.js"
import { createActionLog } from "../../../../../../src/logger/log-entry.js"
import { K8_POD_DEFAULT_CONTAINER_ANNOTATION_KEY } from "../../../../../../src/plugins/kubernetes/run.js"
import { k8sGetContainerDeployStatus } from "../../../../../../src/plugins/kubernetes/container/status.js"

describe("kubernetes container deployment handlers", () => {
  let garden: TestGarden
  let cleanup: (() => void) | undefined
  let router: ActionRouter
  let graph: ConfigGraph
  let ctx: KubernetesPluginContext
  let provider: KubernetesProvider
  let api: KubeApi

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
    provider = <KubernetesProvider>await garden.resolveProvider({ log: garden.log, name: "local-kubernetes" })
    ctx = <KubernetesPluginContext>(
      await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
    )
    api = await KubeApi.factory(garden.log, ctx, provider)
  }

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

      const imageId = getDeployedImageId(action)

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
        imageId: getDeployedImageId(action),
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
        imageId: getDeployedImageId(action),
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
        imageId: getDeployedImageId(action),
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
        imageId: getDeployedImageId(action),
        namespace,
        log: createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind }),
        production: false,
      })

      expect(isConfiguredForSyncMode(resource)).to.eq(true)

      const initContainer = resource.spec.template?.spec?.initContainers![0]
      expect(initContainer).to.exist
      expect(initContainer!.name).to.eq(k8sSyncUtilContainerName)
      expect(initContainer!.volumeMounts).to.exist
      expect(initContainer!.volumeMounts![0]).to.eql({ name: "garden", mountPath: "/.garden" })

      expect(resource.spec.template?.spec?.initContainers).to.eql([
        {
          name: k8sSyncUtilContainerName,
          image: getK8sSyncUtilImagePath(provider.config.utilImageRegistryDomain),
          command: ["/bin/sh", "-c", "'cp' '/usr/local/bin/mutagen-agent' '/.garden/mutagen-agent'"],
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
        imageId: getDeployedImageId(action),
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
        imageId: getDeployedImageId(action),
        namespace,
        log: createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind }),
        production: false,
      })

      const copiedSecret = await api.core.readNamespacedSecret({ name: secretName, namespace })
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
        imageId: getDeployedImageId(action),
        namespace,
        log: createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind }),
        production: false,
      })

      const copiedSecret = await api.core.readNamespacedSecret({ name: secretName, namespace })
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
        imageId: getDeployedImageId(action),
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
        imageId: getDeployedImageId(action),
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
            imageId: getDeployedImageId(action),
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
    context("local mode", () => {
      before(async () => {
        await init("local")
      })

      after(async () => {
        if (cleanup) {
          cleanup()
        }
      })

      it("should deploy a simple Deploy", async () => {
        const action = await resolveDeployAction("simple-service")

        const deployTask = new DeployTask({
          garden,
          graph,
          log: garden.log,
          action,
          force: true,
          forceBuild: false,
        })

        garden.events.eventLog = []
        const results = await garden.processTasks({ tasks: [deployTask], throwOnError: true })
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
        const action = await resolveDeployAction("simple-service")
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
          await api.core.deleteNamespacedConfigMap({ name: mapToNotPruneKey, namespace })
        } catch (_e) {}

        // Here, we create via the k8s API (not `kubetl apply`), so that unlike `configMapToPrune`, it won't acquire
        // the "last applied" annotation. This means that it should *not* be pruned when we deploy the service, even
        // though it has the service's label.
        await api.core.createNamespacedConfigMap({
          namespace,
          body: {
            apiVersion: "v1",
            kind: "ConfigMap",
            metadata: {
              name: mapToNotPruneKey,
              annotations: { ...labels },
              labels: { ...labels },
            },
            data: {},
          },
        })

        const deployTask = new DeployTask({
          garden,
          graph,
          log,
          action,
          force: true,
          forceBuild: false,
        })

        await garden.processTasks({ tasks: [deployTask], throwOnError: true })

        // We expect this `ConfigMap` to still exist.
        await api.core.readNamespacedConfigMap({ name: mapToNotPruneKey, namespace })

        // ...and we expect this `ConfigMap` to have been deleted.
        await expectError(
          () => api.core.readNamespacedConfigMap({ name: mapToPruneKey, namespace }),
          (err) => {
            expect(stripAnsi(err.message)).to.match(
              /Error while performing Kubernetes API operation readNamespacedConfigMap/
            )
            expect(stripAnsi(err.message)).to.match(/Response status code: 404/)
            expect(stripAnsi(err.message)).to.match(/Kubernetes Message: configmaps "should-be-pruned" not found/)
          }
        )

        await api.core.deleteNamespacedConfigMap({ name: mapToNotPruneKey, namespace })
      })

      it("should ignore empty env vars in status check comparison", async () => {
        const action = await resolveDeployAction("simple-service")
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

        const results = await garden.processTasks({ tasks: [deployTask], throwOnError: true })
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

        const results = await garden.processTasks({ tasks: [deployTask], throwOnError: true })
        const statuses = getDeployStatuses(results.results)
        const status = statuses[action.name]
        const resources = keyBy(status.detail?.detail["remoteResources"], "kind")

        expect(status.state).eql("ready")
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
        resolvedAction: ResolvedDeployAction<ContainerDeployActionConfig, ContainerDeployOutputs>
      ) => {
        const deployTask = new DeployTask({
          garden,
          graph,
          log: garden.log,
          action: resolvedAction,
          force: true,
          forceBuild: false,
        })

        const results = await garden.processTasks({ tasks: [deployTask], throwOnError: true })
        const statuses = getDeployStatuses(results.results)

        return statuses[resolvedAction.name]
      }

      it.skip("should deploy a simple service without dockerfile", async () => {
        const action = await resolveDeployAction("simple-server-busybox")
        const status = await processDeployAction(action)

        const resources = keyBy(status.detail?.detail["remoteResources"], "kind")

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
        expect(resources.Deployment.spec.template.spec.containers[0].image).to.equal(
          `europe-west3-docker.pkg.dev/garden-ci/garden-integ-tests/${action.name}:${buildVersionString}`
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
          `europe-west3-docker.pkg.dev/garden-ci/garden-integ-tests/${action.name}:${buildVersionString}`
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
          `europe-west3-docker.pkg.dev/garden-ci/garden-integ-tests/${action.name}:${buildVersionString}`
        )
      })
    })
  })

  describe("k8sGetContainerDeployStatus", () => {
    before(async () => {
      await init("local")
    })

    after(async () => {
      if (cleanup) {
        cleanup()
      }
    })
    context("sync mode", () => {
      it("should return the action mode registered on the remote resource, if any", async () => {
        const deployName = "sync-mode"
        const log = garden.log
        const deployGraph = await garden.getConfigGraph({
          log,
          emit: false,
          actionModes: { sync: [`deploy.${deployName}`] }, // <----
        })
        const deployAction = await garden.resolveAction<ContainerDeployAction>({
          action: deployGraph.getDeploy(deployName),
          log,
          graph: deployGraph,
        })
        const deployTask = new DeployTask({
          garden,
          graph: deployGraph,
          log,
          action: deployAction,
          force: true,
          forceBuild: false,
        })

        await garden.processTasks({ tasks: [deployTask], throwOnError: true })

        // Important: This is a fresh config graoh with no action modes set, as would be the case e.g. when
        // calling the `get status` command. This is to test that we're indeed using the action mode written in the
        // deployed resources.
        const statusGraph = await garden.getConfigGraph({
          log,
          emit: false,
        })

        const statusAction = await garden.resolveAction<ContainerDeployAction>({
          action: statusGraph.getDeploy(deployName),
          log,
          graph: statusGraph,
        })
        const actionLog = createActionLog({ log, actionName: deployName, actionKind: "deploy" })
        const status = await k8sGetContainerDeployStatus({
          ctx,
          log: actionLog,
          action: statusAction,
        })
        expect(status.detail?.mode).to.eql("sync")
      })
    })
  })

  describe("handleChangedSelector", () => {
    before(async () => {
      await init("local")
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
        imageId: getDeployedImageId(action),
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
        await api.apps.deleteNamespacedDeployment({ name: action.name, namespace: provider.config.namespace!.name })
      } catch (err) {}
    }

    const simpleServiceIsRunning = async (
      action: ResolvedDeployAction<ContainerDeployActionConfig, ContainerDeployOutputs>
    ) => {
      try {
        await api.apps.readNamespacedDeployment({ name: action.name, namespace: provider.config.namespace!.name })
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
      const action = await resolveDeployAction("simple-service")
      const actionLog = createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind })

      await cleanupSpecChangedSimpleService(action) // Clean up in case we're re-running the test case
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
      const action = await resolveDeployAction("simple-service")
      const actionLog = createActionLog({ log: garden.log, actionName: action.name, actionKind: action.kind })

      await cleanupSpecChangedSimpleService(action) // Clean up in case we're re-running the test case
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
      const action = await resolveDeployAction("simple-service")
      await cleanupSpecChangedSimpleService(action) // Clean up in case we're re-running the test case
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
      await cleanupSpecChangedSimpleService(action)
    })
  })
})
