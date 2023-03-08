/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import td from "testdouble"
import tmp from "tmp-promise"
import { expectError, pruneEmpty } from "../../../../helpers"
import { pathExists } from "fs-extra"
import { expect } from "chai"
import { join } from "path"
import { Garden } from "../../../../../src/garden"
import { ConfigGraph } from "../../../../../src/graph/config-graph"
import { deline, randomString, dedent } from "../../../../../src/util/string"
import { runAndCopy, PodRunner, prepareRunPodSpec } from "../../../../../src/plugins/kubernetes/run"
import { KubeApi } from "../../../../../src/plugins/kubernetes/api"
import {
  KubernetesPluginContext,
  KubernetesProvider,
  ServiceResourceSpec,
} from "../../../../../src/plugins/kubernetes/config"
import {
  getTargetResource,
  getResourceContainer,
  getServiceResourceSpec,
  getResourcePodSpec,
  makePodName,
} from "../../../../../src/plugins/kubernetes/util"
import { getContainerTestGarden } from "./container/container"
import {
  KubernetesPod,
  KubernetesServerResource,
  KubernetesWorkload,
} from "../../../../../src/plugins/kubernetes/types"
import { PluginContext } from "../../../../../src/plugin-context"
import { Log } from "../../../../../src/logger/log-entry"
import { sleep } from "../../../../../src/util/util"
import { buildHelmModules, getHelmTestGarden } from "./helm/common"
import { getBaseModule, getChartResources } from "../../../../../src/plugins/kubernetes/helm/common"
import { getActionNamespace } from "../../../../../src/plugins/kubernetes/namespace"
import { GardenModule } from "../../../../../src/types/module"
import { V1Container, V1Pod, V1PodSpec } from "@kubernetes/client-node"
import { getResourceRequirements } from "../../../../../src/plugins/kubernetes/container/util"
import { ContainerResourcesSpec } from "../../../../../src/plugins/container/moduleConfig"
import { KubernetesRunActionSpec } from "../../../../../src/plugins/kubernetes/kubernetes-type/run"
import { Resolved } from "../../../../../src/actions/types"
import { HelmDeployAction } from "../../../../../src/plugins/kubernetes/helm/config"
import { executeAction } from "../../../../../src/graph/actions"

describe("kubernetes Pod runner functions", () => {
  let garden: Garden
  let ctx: PluginContext
  let graph: ConfigGraph
  let provider: KubernetesProvider
  let namespace: string
  let api: KubeApi
  let log: Log

  before(async () => {
    garden = await getContainerTestGarden()
    provider = <KubernetesProvider>await garden.resolveProvider(garden.log, "local-kubernetes")
    ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
    namespace = provider.config.namespace!.name!
    api = await KubeApi.factory(garden.log, ctx, provider)
    log = garden.log
  })

  beforeEach(async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
  })

  after(async () => {
    await garden.close()
  })

  function makePod(command: string[], image = "busybox"): KubernetesPod {
    return {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name: "runner-test-" + randomString(8),
        namespace,
      },
      spec: {
        containers: [
          {
            name: "main",
            image,
            command,
          },
        ],
      },
    }
  }

  describe("PodRunner", () => {
    let runner: PodRunner

    afterEach(async () => {
      if (runner) {
        await runner.stop()
      }
    })

    describe("start", () => {
      it("creates a Pod and waits for it to start", async () => {
        const pod = makePod(["sh", "-c", "sleep 600"])

        runner = new PodRunner({
          ctx,
          pod,
          namespace,
          api,
          provider,
        })

        const res = await runner.start({ log })
        expect(res.status.state).to.equal("ready")
      })

      it("throws if the Pod fails to start before timeout", async () => {
        const badImage = randomString(16)
        const pod = makePod(["foo"], badImage)

        runner = new PodRunner({
          ctx,
          pod,
          namespace,
          api,
          provider,
        })

        await expectError(() => runner.start({ log, timeoutSec: 2 }))
      })
    })

    describe("exec", () => {
      it("runs the specified command in the Pod", async () => {
        const pod = makePod(["sh", "-c", "sleep 600"])

        runner = new PodRunner({
          ctx,
          pod,
          namespace,
          api,
          provider,
        })

        await runner.start({ log })

        const res = await runner.exec({
          log,
          command: ["echo", "foo"],
          buffer: true,
        })

        expect(res.log.trim()).to.equal("foo")
      })

      it("throws if execution times out", async () => {
        const pod = makePod(["sh", "-c", "sleep 600"])

        runner = new PodRunner({
          ctx,
          pod,
          namespace,
          api,
          provider,
        })

        await runner.start({ log })
        await expectError(
          () => runner.exec({ log, command: ["sh", "-c", "sleep 100"], timeoutSec: 1, buffer: true }),
          (err) => expect(err.message).to.equal("Command timed out after 1 seconds.")
        )
      })

      it("throws if command returns non-zero exit code", async () => {
        const pod = makePod(["sh", "-c", "sleep 600"])

        runner = new PodRunner({
          ctx,
          pod,
          namespace,
          api,
          provider,
        })

        await runner.start({ log })
        await expectError(
          () => runner.exec({ log, command: ["sh", "-c", "echo foo && exit 2"], buffer: true }),
          (err) => expect(err.message.trim()).to.equal("Command exited with code 2:\nfoo")
        )
      })
    })

    describe("getLogs", () => {
      it("retrieves the logs from the Pod", async () => {
        const pod = makePod(["sh", "-c", "echo foo && sleep 600"])

        runner = new PodRunner({
          ctx,
          pod,
          namespace,
          api,
          provider,
        })

        await runner.start({ log })
        const logs = await runner.getLogs()
        expect(logs).to.eql([
          {
            containerName: "main",
            log: "foo\n",
          },
        ])
      })

      it("retrieves the logs from the Pod after it terminates", async () => {
        const pod = makePod(["sh", "-c", "echo foo"])

        runner = new PodRunner({
          ctx,
          pod,
          namespace,
          api,
          provider,
        })

        await runner.start({ log })
        await sleep(500)

        const logs = await runner.getLogs()
        expect(logs).to.eql([
          {
            containerName: "main",
            log: "foo\n",
          },
        ])
      })
    })

    describe("runAndWait", () => {
      it("creates a Pod and waits for it to complete before returning the run result", async () => {
        const pod = makePod(["sh", "-c", "echo foo"])

        runner = new PodRunner({
          ctx,
          pod,
          namespace,
          api,
          provider,
        })

        const res = await runner.runAndWait({ log, remove: true, tty: false, events: ctx.events })

        expect(res.log.trim()).to.equal("foo")
        expect(res.success).to.be.true
      })

      it("returns success=false if Pod returns with non-zero exit code when throwOnExitCode is not set", async () => {
        const pod = makePod(["sh", "-c", "echo foo && exit 1"])

        runner = new PodRunner({
          ctx,
          pod,
          namespace,
          api,
          provider,
        })

        const res = await runner.runAndWait({ log, remove: true, tty: false, events: ctx.events })

        expect(res.log.trim()).to.equal("foo")
        expect(res.success).to.be.false
      })

      it("throws if Pod returns with non-zero exit code when throwOnExitCode=true", async () => {
        const pod = makePod(["sh", "-c", "echo foo && exit 1"])

        runner = new PodRunner({
          ctx,
          pod,
          namespace,
          api,
          provider,
        })

        await expectError(
          () => runner.runAndWait({ log, remove: true, tty: false, events: ctx.events, throwOnExitCode: true }),
          (err) => expect(err.message.trim()).to.equal("Command exited with code 1:\nfoo")
        )
      })

      it("throws if Pod is invalid", async () => {
        runner = new PodRunner({
          ctx,
          pod: {
            apiVersion: "v1",
            kind: "Pod",
            metadata: {
              name: "!&/$/%#/",
              namespace,
            },
            spec: {
              containers: [
                {
                  name: "main",
                  image: "busybox",
                  command: ["sh", "-c", "echo foo"],
                },
              ],
            },
          },
          namespace,
          api,
          provider,
        })

        await expectError(
          () => runner.runAndWait({ log, remove: true, tty: false, events: ctx.events }),
          (err) => expect(err.message).to.include("Failed to create Pod")
        )
      })

      it("throws if Pod cannot start", async () => {
        const badImage = randomString(16)
        const pod = makePod(["sh", "-c", "echo foo"], badImage)

        runner = new PodRunner({
          ctx,
          pod,
          namespace,
          api,
          provider,
        })

        await expectError(
          () => runner.runAndWait({ log, remove: true, tty: false, events: ctx.events }),
          (err) => expect(err.message).to.include("Failed to start Pod")
        )
      })

      it("should throw if Pod OOMs with exit code 137", async () => {
        const mockApi = await KubeApi.factory(garden.log, ctx, provider)
        const core = td.replace(mockApi, "core")

        const pod = makePod(["sh", "-c", "echo foo"])
        pod.spec.containers[0].resources = {
          limits: {
            memory: "8Mi",
          },
        }

        runner = new PodRunner({
          ctx,
          pod,
          namespace,
          api: mockApi,
          provider,
        })

        // We mock the pod status result to fake an OOMKilled event.
        // (I tried manually generating an OOM event which worked locally but not on Minkube in CI)
        const readNamespacedPodStatusRes: Partial<KubernetesServerResource<V1Pod>> = {
          apiVersion: "v1",
          kind: "Pod",
          metadata: {
            name: runner.podName,
            namespace: "container-default",
          },
          spec: {
            containers: [
              {
                command: ["sh", "-c", "echo foo"],
                image: "busybox",
                imagePullPolicy: "Always",
                name: "main",
              },
            ],
          },
          status: {
            conditions: [
              {
                lastProbeTime: undefined,
                lastTransitionTime: new Date(),
                status: "True",
                type: "PodScheduled",
              },
            ],
            containerStatuses: [
              {
                image: "busybox:latest",
                imageID: "docker-pullable://busybox@sha256:some-hash",
                lastState: {},
                name: "main",
                ready: true,
                restartCount: 0,
                started: true,
                state: {
                  terminated: {
                    reason: "OOMKilled",
                    exitCode: 137,
                  },
                },
              },
            ],
            phase: "Running",
            startTime: new Date(),
          },
        }
        td.when(core.readNamespacedPodStatus(runner.podName, namespace)).thenResolve(readNamespacedPodStatusRes)

        await expectError(
          () => runner.runAndWait({ log, remove: true, tty: false, events: ctx.events }),
          (err) => {
            expect(err.type).to.eql("out-of-memory")
            expect(err.message).to.include("OOMKilled")
          }
        )
      })

      it("should throw if exit reason is OOMKilled, even if exit code is 0", async () => {
        const mockApi = await KubeApi.factory(garden.log, ctx, provider)
        const core = td.replace(mockApi, "core")

        const pod = makePod(["sh", "-c", "echo foo"])
        pod.spec.containers[0].resources = {
          limits: {
            memory: "8Mi",
          },
        }

        runner = new PodRunner({
          ctx,
          pod,
          namespace,
          api: mockApi,
          provider,
        })

        // Here we're specifically testing the case where the exit code is 0 but the exit reason
        // is "OOMKilled" which is something we've seen happen "in the wild".
        const readNamespacedPodStatusRes: Partial<KubernetesServerResource<V1Pod>> = {
          apiVersion: "v1",
          kind: "Pod",
          metadata: {
            name: runner.podName,
            namespace: "container-default",
          },
          spec: {
            containers: [
              {
                command: ["sh", "-c", "echo foo"],
                image: "busybox",
                imagePullPolicy: "Always",
                name: "main",
              },
            ],
          },
          status: {
            conditions: [
              {
                lastProbeTime: undefined,
                lastTransitionTime: new Date(),
                status: "True",
                type: "PodScheduled",
              },
            ],
            containerStatuses: [
              {
                image: "busybox:latest",
                imageID: "docker-pullable://busybox@sha256:some-hash",
                lastState: {},
                name: "main",
                ready: true,
                restartCount: 0,
                started: true,
                state: {
                  terminated: {
                    reason: "OOMKilled",
                    exitCode: 0, // <-----
                  },
                },
              },
            ],
            phase: "Running",
            startTime: new Date(),
          },
        }
        td.when(core.readNamespacedPodStatus(runner.podName, namespace)).thenResolve(readNamespacedPodStatusRes)

        await expectError(
          () => runner.runAndWait({ log, remove: true, tty: false, events: ctx.events }),
          (err) => {
            expect(err.type).to.eql("out-of-memory")
            expect(err.message).to.include("OOMKilled")
          }
        )
      })

      context("tty=true", () => {
        it("attaches to the process stdio during execution", async () => {
          const pod = makePod([
            "/bin/sh",
            "-c",
            dedent`
              for i in 1 2 3 4 5
              do
                echo "Log line $i"
                sleep 1
              done
            `,
          ])

          runner = new PodRunner({
            ctx,
            pod,
            namespace,
            api,
            provider,
          })

          const res = await runner.runAndWait({ log, remove: true, tty: true, events: ctx.events })

          expect(res.log.trim().replace(/\r\n/g, "\n")).to.equal(dedent`
            Log line 1
            Log line 2
            Log line 3
            Log line 4
            Log line 5
          `)
          expect(res.success).to.be.true
        })
      })
    })
  })

  describe("prepareRunPodSpec", () => {
    let helmGarden: Garden
    let helmProvider: KubernetesProvider
    let helmCtx: KubernetesPluginContext
    let helmApi: KubeApi
    let helmLog: Log
    let helmGraph: ConfigGraph
    let helmModule: GardenModule
    let helmManifests: any[]
    let helmBaseModule: GardenModule | undefined
    let helmResourceSpec: ServiceResourceSpec
    let helmTarget: KubernetesWorkload | KubernetesPod
    let helmContainer: V1Container
    let helmNamespace: string
    let helmAction: Resolved<HelmDeployAction>
    const resources: ContainerResourcesSpec = {
      cpu: {
        min: 123,
        max: 456,
      },
      memory: {
        min: 123,
        max: 456,
      },
    }

    before(async () => {
      helmGarden = await getHelmTestGarden()
      helmProvider = <KubernetesProvider>await helmGarden.resolveProvider(helmGarden.log, "local-kubernetes")
      helmCtx = <KubernetesPluginContext>(
        await helmGarden.getPluginContext({ provider: helmProvider, templateContext: undefined, events: undefined })
      )
      helmApi = await KubeApi.factory(helmGarden.log, helmCtx, helmProvider)
      helmLog = helmGarden.log
      helmGraph = await helmGarden.getConfigGraph({ log: helmLog, emit: false })
      await buildHelmModules(helmGarden, helmGraph)
      helmModule = helmGraph.moduleGraph.getModule("artifacts")
      helmAction = await helmGarden.resolveAction({
        action: helmGraph.getDeploy("api"),
        log: helmLog,
        graph: helmGraph,
      })
      await executeAction({ action: helmAction, graph: helmGraph, garden: helmGarden, log: helmGarden.log })

      helmManifests = await getChartResources({
        ctx: helmCtx,
        syncMode: false,
        action: helmAction,
        localMode: false,
        log: helmLog,
      })
      helmBaseModule = getBaseModule(helmModule)
      helmResourceSpec = getServiceResourceSpec(helmModule, helmBaseModule) as ServiceResourceSpec
      helmNamespace = await getActionNamespace({
        ctx: helmCtx,
        log: helmLog,
        action: helmAction,
        provider: helmCtx.provider,
      })
      helmTarget = await getTargetResource({
        ctx: helmCtx,
        log: helmLog,
        provider: helmCtx.provider,
        manifests: helmManifests,
        action: helmAction,
        query: { ...helmResourceSpec, name: helmAction.getSpec().releaseName },
      })
      helmContainer = getResourceContainer(helmTarget, helmResourceSpec.containerName)
    })

    // These test cases should cover the `kubernetes` module type as well, since these helpers operate on manifests
    // (it shouldn't matter whether they come from a rendered Helm chart or directly from manifests)
    it("should generate a default pod spec when none is provided", async () => {
      const generatedPodSpec = await prepareRunPodSpec({
        podSpec: undefined, // <------
        getArtifacts: false,
        api: helmApi,
        provider: helmProvider,
        log: helmLog,
        args: ["sh", "-c"],
        command: ["echo", "foo"],
        envVars: {},
        description: "Helm module",
        errorMetadata: {},
        mainContainerName: "main",
        image: "foo",
        container: helmContainer,
        namespace: helmNamespace,
        volumes: [],
        action: helmAction,
      })

      expect(pruneEmpty(generatedPodSpec)).to.eql({
        containers: [
          {
            name: "main",
            image: "foo",
            imagePullPolicy: "IfNotPresent",
            args: ["sh", "-c"],
            resources: {},
            ports: [
              {
                name: "http",
                containerPort: 80,
                protocol: "TCP",
              },
            ],
            env: [
              {
                name: "GARDEN_ACTION_VERSION",
                value: helmAction.versionString(),
              },
              {
                name: "GARDEN_MODULE_VERSION",
                value: helmAction.versionString(),
              },
            ],
            volumeMounts: [],
            command: ["echo", "foo"],
          },
        ],
        imagePullSecrets: [],
        volumes: [],
      })
    })

    it("should apply resources to the main container when no pod spec is provided", async () => {
      const generatedPodSpec = await prepareRunPodSpec({
        podSpec: undefined, // <------
        getArtifacts: false,
        api: helmApi,
        provider: helmProvider,
        log: helmLog,
        action: helmAction,
        args: ["sh", "-c"],
        command: ["echo", "foo"],

        envVars: {},
        resources, // <---
        description: "Helm module",
        errorMetadata: {},
        mainContainerName: "main",
        image: "foo",
        container: helmContainer,
        namespace: helmNamespace,
        volumes: [],
      })

      expect(pruneEmpty(generatedPodSpec)).to.eql({
        containers: [
          {
            name: "main",
            image: "foo",
            imagePullPolicy: "IfNotPresent",
            args: ["sh", "-c"],
            ports: [
              {
                name: "http",
                containerPort: 80,
                protocol: "TCP",
              },
            ],
            resources: getResourceRequirements(resources),
            env: [
              {
                name: "GARDEN_ACTION_VERSION",
                value: helmAction.versionString(),
              },
              {
                name: "GARDEN_MODULE_VERSION",
                value: helmAction.versionString(),
              },
            ],
            volumeMounts: [],
            command: ["echo", "foo"],
          },
        ],
        imagePullSecrets: [],
        volumes: [],
      })
    })

    it("should apply resources to the main container when a pod spec is provided", async () => {
      const podSpec = getResourcePodSpec(helmTarget)
      const generatedPodSpec = await prepareRunPodSpec({
        podSpec, // <------
        getArtifacts: false,
        api: helmApi,
        provider: helmProvider,
        log: helmLog,
        action: helmAction,
        args: ["sh", "-c"],
        command: ["echo", "foo"],

        envVars: {},
        resources, // <---
        description: "Helm module",
        errorMetadata: {},
        mainContainerName: "main",
        image: "foo",
        container: helmContainer,
        namespace: helmNamespace,
        volumes: [],
      })

      expect(pruneEmpty(generatedPodSpec)).to.eql({
        containers: [
          {
            name: "main",
            image: "foo",
            imagePullPolicy: "IfNotPresent",
            args: ["sh", "-c"],
            ports: [
              {
                name: "http",
                containerPort: 80,
                protocol: "TCP",
              },
            ],
            resources: getResourceRequirements(resources),
            env: [
              {
                name: "GARDEN_ACTION_VERSION",
                value: helmAction.versionString(),
              },
              {
                name: "GARDEN_MODULE_VERSION",
                value: helmAction.versionString(),
              },
            ],
            volumeMounts: [],
            command: ["echo", "foo"],
          },
        ],
        imagePullSecrets: [],
        volumes: [],
        shareProcessNamespace: true,
      })
    })

    it("should apply security context fields to the main container when provided", async () => {
      const generatedPodSpec = await prepareRunPodSpec({
        podSpec: undefined,
        getArtifacts: false,
        api: helmApi,
        provider: helmProvider,
        log: helmLog,
        action: helmAction,
        args: ["sh", "-c"],
        command: ["echo", "foo"],

        envVars: {},
        resources, // <---
        description: "Helm module",
        errorMetadata: {},
        mainContainerName: "main",
        image: "foo",
        container: helmContainer,
        namespace: helmNamespace,
        volumes: [],
        privileged: true, // <----
        addCapabilities: ["SYS_TIME"], // <----
        dropCapabilities: ["NET_ADMIN"], // <----
      })

      expect(pruneEmpty(generatedPodSpec)).to.eql({
        containers: [
          {
            name: "main",
            image: "foo",
            imagePullPolicy: "IfNotPresent",
            args: ["sh", "-c"],
            ports: [
              {
                name: "http",
                containerPort: 80,
                protocol: "TCP",
              },
            ],
            resources: getResourceRequirements(resources),
            env: [
              {
                name: "GARDEN_ACTION_VERSION",
                value: helmAction.versionString(),
              },
              {
                name: "GARDEN_MODULE_VERSION",
                value: helmAction.versionString(),
              },
            ],
            volumeMounts: [],
            command: ["echo", "foo"],
            securityContext: {
              privileged: true,
              capabilities: {
                add: ["SYS_TIME"],
                drop: ["NET_ADMIN"],
              },
            },
          },
        ],
        imagePullSecrets: [],
        volumes: [],
      })
    })

    it("should include only the right pod spec fields in the generated pod spec", async () => {
      const podSpec = getResourcePodSpec(helmTarget)
      expect(pruneEmpty(podSpec)).to.eql({
        // This field is *not* included in `runPodSpecIncludeFields`, so it shouldn't appear in the
        // generated pod spec below.
        containers: [
          {
            name: "api",
            image: "api-image:v-4d59656b5e",
            imagePullPolicy: "IfNotPresent",
            args: ["python", "app.py"],
            ports: [
              {
                name: "http",
                containerPort: 80,
                protocol: "TCP",
              },
            ],
            resources: {},
          },
        ],
        shareProcessNamespace: true,
      })
      const generatedPodSpec = await prepareRunPodSpec({
        podSpec, // <------
        getArtifacts: false,
        api: helmApi,
        provider: helmProvider,
        log: helmLog,
        action: helmAction,
        args: ["sh", "-c"],
        command: ["echo", "foo"],

        envVars: {},
        description: "Helm module",
        errorMetadata: {},
        mainContainerName: "main",
        image: "foo",
        container: helmContainer,
        namespace: helmNamespace,
        volumes: [],
      })

      expect(pruneEmpty(generatedPodSpec)).to.eql({
        // `shareProcessNamespace` is not excluded, so it should be propagated to here.
        shareProcessNamespace: true,
        // `terminationGracePeriodSeconds` *is* excluded, so it should not appear here.
        containers: [
          {
            name: "main",
            image: "foo",
            imagePullPolicy: "IfNotPresent",
            args: ["sh", "-c"],
            ports: [
              {
                name: "http",
                containerPort: 80,
                protocol: "TCP",
              },
            ],
            resources: {},
            env: [
              {
                name: "GARDEN_ACTION_VERSION",
                value: helmAction.versionString(),
              },
              {
                name: "GARDEN_MODULE_VERSION",
                value: helmAction.versionString(),
              },
            ],
            volumeMounts: [],
            command: ["echo", "foo"],
          },
        ],
        imagePullSecrets: [],
        volumes: [],
      })
    })

    it("should omit excluded container fields from the generated pod spec", async () => {
      const podSpec = getResourcePodSpec(helmTarget)
      const probe = {
        initialDelaySeconds: 90,
        periodSeconds: 10,
        timeoutSeconds: 3,
        successThreshold: 1,
        failureThreshold: 30,
        exec: {
          command: ["echo", "ok"],
        },
      }
      const podSpecWithProbes: V1PodSpec = {
        ...podSpec,
        containers: [
          {
            ...podSpec!.containers[0]!,
            // These two fields are excluded, so they should be omitted from the generated pod spec.
            livenessProbe: probe,
            readinessProbe: probe,
          },
        ],
      }
      const generatedPodSpec = await prepareRunPodSpec({
        podSpec: podSpecWithProbes, // <------
        getArtifacts: false,
        api: helmApi,
        provider: helmProvider,
        log: helmLog,
        action: helmAction,
        args: ["sh", "-c"],
        command: ["echo", "foo"],

        envVars: {},
        description: "Helm module",
        errorMetadata: {},
        mainContainerName: "main",
        image: "foo",
        container: helmContainer,
        namespace: helmNamespace,
        volumes: [],
      })

      expect(pruneEmpty(generatedPodSpec)).to.eql({
        // `shareProcessNamespace` is not excluded, so it should be propagated to here.
        shareProcessNamespace: true,
        // `terminationGracePeriodSeconds` *is* excluded, so it should not appear here.
        containers: [
          {
            name: "main",
            image: "foo",
            imagePullPolicy: "IfNotPresent",
            args: ["sh", "-c"],
            ports: [
              {
                name: "http",
                containerPort: 80,
                protocol: "TCP",
              },
            ],
            // We expect `livenessProbe` and `readinessProbe` to be omitted here.
            resources: {},
            env: [
              {
                name: "GARDEN_ACTION_VERSION",
                value: helmAction.versionString(),
              },
              {
                name: "GARDEN_MODULE_VERSION",
                value: helmAction.versionString(),
              },
            ],
            volumeMounts: [],
            command: ["echo", "foo"],
          },
        ],
        imagePullSecrets: [],
        volumes: [],
      })
    })
  })

  describe("runAndCopy", () => {
    const image = "busybox:1.31.1"

    let tmpDir: tmp.DirectoryResult

    beforeEach(async () => {
      tmpDir = await tmp.dir({ unsafeCleanup: true })
    })

    afterEach(async () => {
      await tmpDir.cleanup()
    })

    it("should run a basic action", async () => {
      const action = await garden.resolveAction({ action: graph.getRun("echo-task"), log, graph })

      const result = await runAndCopy({
        ctx: await garden.getPluginContext({ provider, templateContext: undefined, events: undefined }),
        log: garden.log,
        command: ["sh", "-c", "echo ok"],
        args: [],
        interactive: false,
        action,
        namespace,

        image,
        version: action.versionString(),
      })

      expect(result.log.trim()).to.equal("ok")
    })

    it("should clean up the created container", async () => {
      const action = await garden.resolveAction({ action: graph.getRun("echo-task"), log, graph })
      const podName = makePodName("test", action.name)

      await runAndCopy({
        ctx: await garden.getPluginContext({ provider, templateContext: undefined, events: undefined }),
        log: garden.log,
        command: ["sh", "-c", "echo ok"],
        args: [],
        interactive: false,
        action,
        namespace: provider.config.namespace!.name!,
        podName,

        image,
        version: action.versionString(),
      })

      await expectError(
        () => api.core.readNamespacedPod(podName, namespace),
        (err) => expect(err.statusCode).to.equal(404)
      )
    })

    it("should return with success=false when command exceeds timeout", async () => {
      const action = await garden.resolveAction({ action: graph.getRun("artifacts-task"), log, graph })

      const timeout = 4
      const result = await runAndCopy({
        ctx: await garden.getPluginContext({ provider, templateContext: undefined, events: undefined }),
        log: garden.log,
        command: ["sh", "-c", "echo banana && sleep 10"],
        args: [],
        interactive: false,
        action,
        namespace,

        image,
        version: action.versionString(),
        timeout,
      })

      // Note: Kubernetes doesn't always return the logs when commands time out.
      expect(result.log.trim()).to.include(`Command timed out after ${timeout} seconds.`)
      expect(result.success).to.be.false
    })

    context("artifacts are specified", () => {
      it("should copy artifacts out of the container", async () => {
        const action = await garden.resolveAction({ action: graph.getRun("artifacts-task"), log, graph })
        const spec = action.getSpec() as KubernetesRunActionSpec

        const result = await runAndCopy({
          ctx: await garden.getPluginContext({ provider, templateContext: undefined, events: undefined }),
          log: garden.log,
          command: spec.command,
          args: [],
          interactive: false,
          namespace,

          artifacts: spec.artifacts,
          artifactsPath: tmpDir.path,
          image,
          version: action.versionString(),
          action,
        })

        expect(result.log.trim()).to.equal("ok")
        expect(await pathExists(join(tmpDir.path, "task.txt"))).to.be.true
        expect(await pathExists(join(tmpDir.path, "subdir", "task.txt"))).to.be.true
      })

      it("should clean up the created Pod", async () => {
        const action = await garden.resolveAction({ action: graph.getRun("artifacts-task"), log, graph })
        const spec = action.getSpec() as KubernetesRunActionSpec
        const podName = makePodName("test", action.name)

        await runAndCopy({
          ctx: await garden.getPluginContext({ provider, templateContext: undefined, events: undefined }),
          log: garden.log,
          command: spec.command,
          args: [],
          interactive: false,
          namespace,
          podName,
          action,

          artifacts: spec.artifacts,
          artifactsPath: tmpDir.path,
          image,
          version: action.versionString(),
        })

        await expectError(
          () => api.core.readNamespacedPod(podName, namespace),
          (err) => expect(err.statusCode).to.equal(404)
        )
      })

      it("should handle globs when copying artifacts out of the container", async () => {
        const action = await garden.resolveAction({ action: graph.getRun("globs-task"), log, graph })
        const spec = action.getSpec() as KubernetesRunActionSpec

        await runAndCopy({
          ctx: await garden.getPluginContext({ provider, templateContext: undefined, events: undefined }),
          log: garden.log,
          command: spec.command,
          args: [],
          interactive: false,
          namespace,
          action,

          artifacts: spec.artifacts,
          artifactsPath: tmpDir.path,
          image,
          version: action.versionString(),
        })

        expect(await pathExists(join(tmpDir.path, "subdir", "task.txt"))).to.be.true
        expect(await pathExists(join(tmpDir.path, "output.txt"))).to.be.true
      })

      it("should not throw when an artifact is missing", async () => {
        const action = await garden.resolveAction({ action: graph.getRun("artifacts-task"), log, graph })
        const spec = action.getSpec() as KubernetesRunActionSpec

        await runAndCopy({
          ctx: await garden.getPluginContext({ provider, templateContext: undefined, events: undefined }),
          log: garden.log,
          command: ["sh", "-c", "echo ok"],
          args: [],
          interactive: false,
          action,
          namespace,

          artifacts: spec.artifacts,
          artifactsPath: tmpDir.path,
          image,
          version: action.versionString(),
        })
      })

      it("should correctly copy a whole directory", async () => {
        const action = await garden.resolveAction({ action: graph.getRun("artifacts-task"), log, graph })

        await runAndCopy({
          ctx: await garden.getPluginContext({ provider, templateContext: undefined, events: undefined }),
          log: garden.log,
          command: ["sh", "-c", "mkdir -p /report && touch /report/output.txt && echo ok"],
          args: [],
          interactive: false,
          action,
          namespace,

          artifacts: [
            {
              source: "/report/*",
              target: "my-task-report",
            },
          ],
          artifactsPath: tmpDir.path,
          image,
          version: action.versionString(),
        })

        expect(await pathExists(join(tmpDir.path, "my-task-report"))).to.be.true
        expect(await pathExists(join(tmpDir.path, "my-task-report", "output.txt"))).to.be.true
      })

      it("should correctly copy a whole directory without setting a wildcard or target", async () => {
        const action = await garden.resolveAction({ action: graph.getRun("artifacts-task"), log, graph })

        await runAndCopy({
          ctx: await garden.getPluginContext({ provider, templateContext: undefined, events: undefined }),
          log: garden.log,
          command: ["sh", "-c", "mkdir -p /report && touch /report/output.txt && echo ok"],
          args: [],
          interactive: false,
          action,
          namespace,

          artifacts: [
            {
              source: "/report",
            },
          ],
          artifactsPath: tmpDir.path,
          image,
          version: action.versionString(),
        })

        expect(await pathExists(join(tmpDir.path, "report"))).to.be.true
        expect(await pathExists(join(tmpDir.path, "report", "output.txt"))).to.be.true
      })

      it("should return with logs and success=false when command exceeds timeout", async () => {
        const action = await garden.resolveAction({ action: graph.getRun("artifacts-task"), log, graph })
        const spec = action.getSpec() as KubernetesRunActionSpec

        const timeout = 3
        const result = await runAndCopy({
          ctx: await garden.getPluginContext({ provider, templateContext: undefined, events: undefined }),
          log: garden.log,
          command: ["sh", "-c", "echo banana && sleep 10"],
          args: [],
          interactive: false,
          action,
          namespace,

          artifacts: spec.artifacts,
          artifactsPath: tmpDir.path,
          image,
          version: action.versionString(),
          timeout,
        })

        expect(result.log.trim()).to.equal(
          `Command timed out after ${timeout} seconds. Here are the logs until the timeout occurred:\n\nbanana`
        )
        expect(result.success).to.be.false
      })

      it("should copy artifacts out of the container even when task times out", async () => {
        const action = await garden.resolveAction({ action: graph.getRun("artifacts-task"), log, graph })
        const spec = action.getSpec() as KubernetesRunActionSpec

        const timeout = 3
        const result = await runAndCopy({
          ctx: await garden.getPluginContext({ provider, templateContext: undefined, events: undefined }),
          log: garden.log,
          command: ["sh", "-c", "touch /task.txt && sleep 10"],
          args: [],
          interactive: false,
          action,
          namespace,

          artifacts: spec.artifacts,
          artifactsPath: tmpDir.path,
          image,
          version: action.versionString(),
          timeout,
        })

        expect(result.log.trim()).to.equal(`Command timed out after ${timeout} seconds.`)
        expect(await pathExists(join(tmpDir.path, "task.txt"))).to.be.true
        expect(result.success).to.be.false
      })

      it("should throw when container doesn't contain sh", async () => {
        const action = await garden.resolveAction({ action: graph.getRun("missing-sh-task"), log, graph })
        const _image = action._outputs["deployment-image-id"]
        const spec = action.getSpec() as KubernetesRunActionSpec

        // TODO-SG2 I don't think this is needed
        // const router = await garden.getActionRouter()
        // await garden.buildStaging.syncFromSrc(module, garden.log)
        // await router.build.build({
        //   module,
        //   log: garden.log,
        //   graph,
        // })

        await expectError(
          async () =>
            runAndCopy({
              ctx: await garden.getPluginContext({ provider, templateContext: undefined, events: undefined }),
              log: garden.log,
              command: ["sh", "-c", "echo ok"],
              args: [],
              interactive: false,
              action,
              namespace,

              artifacts: spec.artifacts,
              artifactsPath: tmpDir.path,
              description: "Foo",
              image: _image,
              timeout: 20000,
              version: action.versionString(),
            }),
          (err) =>
            expect(err.message).to.equal(deline`
              Foo specifies artifacts to export, but the image doesn't
              contain the sh binary. In order to copy artifacts out of Kubernetes containers, both sh and tar need
              to be installed in the image.
            `)
        )
      })

      it("should throw when container doesn't contain tar", async () => {
        const action = await garden.resolveAction({ action: graph.getRun("missing-tar-task"), log, graph })
        const _image = action._outputs["deployment-image-id"]
        const spec = action.getSpec() as KubernetesRunActionSpec

        // TODO-SG2 I don't think this is needed
        // const actions = await garden.getActionRouter()
        // await garden.buildStaging.syncFromSrc(module, garden.log)
        // await actions.build.build({
        //   module,
        //   log: garden.log,
        //   graph,
        // })

        await expectError(
          async () =>
            runAndCopy({
              ctx: await garden.getPluginContext({ provider, templateContext: undefined, events: undefined }),
              log: garden.log,
              command: ["sh", "-c", "echo ok"],
              args: [],
              interactive: false,
              action,
              namespace,

              artifacts: spec.artifacts,
              artifactsPath: tmpDir.path,
              description: "Foo",
              image: _image,
              timeout: 20000,
              version: action.versionString(),
            }),
          (err) =>
            expect(err.message).to.equal(deline`
              Foo specifies artifacts to export, but the image doesn't
              contain the tar binary. In order to copy artifacts out of Kubernetes containers, both sh and tar need
              to be installed in the image.
            `)
        )
      })

      it("should throw when no command is specified", async () => {
        const action = await garden.resolveAction({ action: graph.getRun("missing-tar-task"), log, graph })
        const spec = action.getSpec() as KubernetesRunActionSpec

        await expectError(
          async () =>
            runAndCopy({
              ctx: await garden.getPluginContext({ provider, templateContext: undefined, events: undefined }),
              log: garden.log,
              args: [],
              interactive: false,
              action,
              namespace,

              artifacts: spec.artifacts,
              artifactsPath: tmpDir.path,
              description: "Foo",
              image,
              version: action.versionString(),
            }),
          (err) =>
            expect(err.message).to.equal(deline`
              Foo specifies artifacts to export, but doesn't explicitly set a \`command\`.
              The kubernetes provider currently requires an explicit command to be set for tests and tasks that
              export artifacts, because the image's entrypoint cannot be inferred in that execution mode.
              Please set the \`command\` field and try again.
            `)
        )
      })
    })
  })
})
