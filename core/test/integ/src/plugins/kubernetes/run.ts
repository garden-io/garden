/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import tmp from "tmp-promise"
import { expectError } from "../../../../helpers"
import { pathExists } from "fs-extra"
import { expect } from "chai"
import { join } from "path"
import { Garden } from "../../../../../src/garden"
import { ConfigGraph } from "../../../../../src/config-graph"
import { deline, randomString, dedent } from "../../../../../src/util/string"
import { runAndCopy, PodRunner, prepareRunPodSpec } from "../../../../../src/plugins/kubernetes/run"
import { containerHelpers } from "../../../../../src/plugins/container/helpers"
import { KubeApi } from "../../../../../src/plugins/kubernetes/api"
import {
  KubernetesPluginContext,
  KubernetesProvider,
  ServiceResourceSpec,
} from "../../../../../src/plugins/kubernetes/config"
import {
  findServiceResource,
  getResourceContainer,
  getServiceResourceSpec,
  getResourcePodSpec,
  makePodName,
} from "../../../../../src/plugins/kubernetes/util"
import { getContainerTestGarden } from "./container/container"
import { KubernetesPod, KubernetesResource } from "../../../../../src/plugins/kubernetes/types"
import { PluginContext } from "../../../../../src/plugin-context"
import { LogEntry } from "../../../../../src/logger/log-entry"
import { sleep, StringCollector } from "../../../../../src/util/util"
import { buildHelmModules, getHelmTestGarden } from "./helm/common"
import { getBaseModule, getChartResources } from "../../../../../src/plugins/kubernetes/helm/common"
import { getModuleNamespace } from "../../../../../src/plugins/kubernetes/namespace"
import { GardenModule } from "../../../../../src/types/module"
import { V1Container, V1DaemonSet, V1Deployment, V1StatefulSet } from "@kubernetes/client-node"

describe("kubernetes Pod runner functions", () => {
  let garden: Garden
  let ctx: PluginContext
  let graph: ConfigGraph
  let provider: KubernetesProvider
  let namespace: string
  let api: KubeApi
  let log: LogEntry

  before(async () => {
    garden = await getContainerTestGarden()
    provider = <KubernetesProvider>await garden.resolveProvider(garden.log, "local-kubernetes")
    ctx = await garden.getPluginContext(provider)
    namespace = provider.config.namespace!
    api = await KubeApi.factory(garden.log, ctx, provider)
    log = garden.log
  })

  beforeEach(async () => {
    graph = await garden.getConfigGraph(garden.log)
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
          () => runner.exec({ log, command: ["sh", "-c", "sleep 100"], timeoutSec: 1 }),
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
          () => runner.exec({ log, command: ["sh", "-c", "echo foo && exit 2"] }),
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

        const res = await runner.runAndWait({ log, remove: true, tty: false })

        expect(res.log.trim()).to.equal("foo")
        expect(res.success).to.be.true
      })

      it("returns success=false if Pod returns with non-zero exit code", async () => {
        const pod = makePod(["sh", "-c", "echo foo && exit 1"])

        runner = new PodRunner({
          ctx,
          pod,
          namespace,
          api,
          provider,
        })

        const res = await runner.runAndWait({ log, remove: true, tty: false })

        expect(res.log.trim()).to.equal("foo")
        expect(res.success).to.be.false
      })

      it("can attach to the Pod and stream outputs", async () => {
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

        const stdout = new StringCollector()

        const res = await runner.runAndWait({ log, remove: true, stdout, tty: false })

        const output = stdout.getString()

        expect(output).to.include("Log line")
        expect(res.log.trim()).to.equal(dedent`
          Log line 1
          Log line 2
          Log line 3
          Log line 4
          Log line 5
        `)
        expect(res.success).to.be.true
      })

      it("throws if Pod is invalid", async () => {
        const pod = {
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
        }

        runner = new PodRunner({
          ctx,
          pod,
          namespace,
          api,

          provider,
        })

        await expectError(
          () => runner.runAndWait({ log, remove: true, tty: false }),
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
          () => runner.runAndWait({ log, remove: true, tty: false }),
          (err) => expect(err.message).to.include("Failed to start Pod")
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

          const res = await runner.runAndWait({ log, remove: true, tty: true })

          expect(res.log.trim().replace(/\r\n/g, "\n")).to.equal(dedent`
            Log line 1
            Log line 2
            Log line 3
            Log line 4
            Log line 5
          `)
          expect(res.success).to.be.true
        })

        it("throws if also specifying stdout or stderr", async () => {
          const pod = makePod(["sh", "-c", "echo foo"])

          runner = new PodRunner({
            ctx,
            pod,
            namespace,
            api,
            provider,
          })

          await expectError(
            () => runner.runAndWait({ log, remove: true, tty: true, stdout: new StringCollector() }),
            (err) => expect(err.message).to.equal("Cannot set both tty and stdout/stderr/stdin streams")
          )
        })
      })
    })
  })

  describe("prepareRunPodSpec", () => {
    let helmGarden: Garden
    let helmProvider: KubernetesProvider
    let helmCtx: KubernetesPluginContext
    let helmApi: KubeApi
    let helmLog: LogEntry
    let helmGraph: ConfigGraph
    let helmModule: GardenModule
    let helmManifests: any[]
    let helmBaseModule: GardenModule | undefined
    let helmResourceSpec: ServiceResourceSpec
    let helmTarget: KubernetesResource<V1Deployment | V1DaemonSet | V1StatefulSet>
    let helmContainer: V1Container
    let helmNamespace: string

    before(async () => {
      helmGarden = await getHelmTestGarden()
      helmProvider = <KubernetesProvider>await helmGarden.resolveProvider(helmGarden.log, "local-kubernetes")
      helmCtx = <KubernetesPluginContext>await helmGarden.getPluginContext(helmProvider)
      helmApi = await KubeApi.factory(helmGarden.log, helmCtx, helmProvider)
      helmLog = helmGarden.log
      helmGraph = await helmGarden.getConfigGraph(helmLog)
      await buildHelmModules(helmGarden, helmGraph)
      helmModule = helmGraph.getModule("artifacts")

      helmManifests = await getChartResources(helmCtx, helmModule, false, helmLog)
      helmBaseModule = getBaseModule(helmModule)
      helmResourceSpec = getServiceResourceSpec(helmModule, helmBaseModule)
      helmTarget = await findServiceResource({
        ctx: helmCtx,
        log: helmLog,
        manifests: helmManifests,
        module: helmModule,
        baseModule: helmBaseModule,
        resourceSpec: helmResourceSpec,
      })
      helmContainer = getResourceContainer(helmTarget, helmResourceSpec.containerName)
      helmNamespace = await getModuleNamespace({
        ctx: helmCtx,
        log: helmLog,
        module: helmModule,
        provider: helmCtx.provider,
      })
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
        module: helmModule,
        args: ["sh", "-c"],
        command: ["echo", "foo"],
        runtimeContext: { envVars: {}, dependencies: [] },
        envVars: {},
        description: "Helm module",
        errorMetadata: {},
        mainContainerName: "main",
        image: "foo",
        container: helmContainer,
        namespace: helmNamespace,
        volumes: [],
      })

      expect(generatedPodSpec).to.eql({
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
            env: [],
            volumeMounts: [],
            command: ["echo", "foo"],
          },
        ],
        imagePullSecrets: [],
        volumes: [],
      })
    })

    it("should include only whitelisted pod spec fields in the generated pod spec", async () => {
      const podSpec = getResourcePodSpec(helmTarget)
      expect(podSpec).to.eql({
        // This field is *not* whitelisted in `runPodSpecWhitelist`, so it shouldn't appear in the
        // generated pod spec below.
        terminationGracePeriodSeconds: 60,
        containers: [
          {
            name: "api",
            image: "busybox:latest",
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
        // This field is whitelisted in `runPodSpecWhitelist`, so it *should* appear in the generated
        // pod spec below.
        shareProcessNamespace: true,
      })
      const generatedPodSpec = await prepareRunPodSpec({
        podSpec, // <------
        getArtifacts: false,
        api: helmApi,
        provider: helmProvider,
        log: helmLog,
        module: helmModule,
        args: ["sh", "-c"],
        command: ["echo", "foo"],
        runtimeContext: { envVars: {}, dependencies: [] },
        envVars: {},
        description: "Helm module",
        errorMetadata: {},
        mainContainerName: "main",
        image: "foo",
        container: helmContainer,
        namespace: helmNamespace,
        volumes: [],
      })

      expect(generatedPodSpec).to.eql({
        // `shareProcessNamespace` is not blacklisted, so it should be propagated to here.
        shareProcessNamespace: true,
        // `terminationGracePeriodSeconds` *is* blacklisted, so it should not appear here.
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
            env: [],
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
    let tmpDir: tmp.DirectoryResult

    beforeEach(async () => {
      tmpDir = await tmp.dir({ unsafeCleanup: true })
    })

    afterEach(async () => {
      await tmpDir.cleanup()
    })

    it("should run a basic module", async () => {
      const module = graph.getModule("simple")
      const image = containerHelpers.getDeploymentImageId(module, module.version, provider.config.deploymentRegistry)

      const result = await runAndCopy({
        ctx: await garden.getPluginContext(provider),
        log: garden.log,
        command: ["sh", "-c", "echo ok"],
        args: [],
        interactive: false,
        module,
        namespace,
        runtimeContext: { envVars: {}, dependencies: [] },
        image,
      })

      expect(result.log.trim()).to.equal("ok")
    })

    it("should clean up the created container", async () => {
      const module = graph.getModule("simple")
      const image = containerHelpers.getDeploymentImageId(module, module.version, provider.config.deploymentRegistry)
      const podName = makePodName("test", module.name)

      await runAndCopy({
        ctx: await garden.getPluginContext(provider),
        log: garden.log,
        command: ["sh", "-c", "echo ok"],
        args: [],
        interactive: false,
        module,
        namespace: provider.config.namespace!,
        podName,
        runtimeContext: { envVars: {}, dependencies: [] },
        image,
      })

      await expectError(
        () => api.core.readNamespacedPod(podName, namespace),
        (err) => expect(err.statusCode).to.equal(404)
      )
    })

    it("should return with success=false when command exceeds timeout", async () => {
      const task = graph.getTask("artifacts-task")
      const module = task.module
      const image = containerHelpers.getDeploymentImageId(module, module.version, provider.config.deploymentRegistry)

      const result = await runAndCopy({
        ctx: await garden.getPluginContext(provider),
        log: garden.log,
        command: ["sh", "-c", "echo banana && sleep 10"],
        args: [],
        interactive: false,
        module,
        namespace,
        runtimeContext: { envVars: {}, dependencies: [] },
        image,
        timeout: 4,
      })

      // Note: Kubernetes doesn't always return the logs when commands time out.
      expect(result.log.trim()).to.include("Command timed out.")
      expect(result.success).to.be.false
    })

    context("artifacts are specified", () => {
      it("should copy artifacts out of the container", async () => {
        const task = graph.getTask("artifacts-task")
        const module = task.module
        const image = containerHelpers.getDeploymentImageId(module, module.version, provider.config.deploymentRegistry)

        const result = await runAndCopy({
          ctx: await garden.getPluginContext(provider),
          log: garden.log,
          command: task.spec.command,
          args: [],
          interactive: false,
          module,
          namespace,
          runtimeContext: { envVars: {}, dependencies: [] },
          artifacts: task.spec.artifacts,
          artifactsPath: tmpDir.path,
          image,
        })

        expect(result.log.trim()).to.equal("ok")
        expect(await pathExists(join(tmpDir.path, "task.txt"))).to.be.true
        expect(await pathExists(join(tmpDir.path, "subdir", "task.txt"))).to.be.true
      })

      it("should clean up the created Pod", async () => {
        const task = graph.getTask("artifacts-task")
        const module = task.module
        const image = containerHelpers.getDeploymentImageId(module, module.version, provider.config.deploymentRegistry)
        const podName = makePodName("test", module.name)

        await runAndCopy({
          ctx: await garden.getPluginContext(provider),
          log: garden.log,
          command: task.spec.command,
          args: [],
          interactive: false,
          module,
          namespace,
          podName,
          runtimeContext: { envVars: {}, dependencies: [] },
          artifacts: task.spec.artifacts,
          artifactsPath: tmpDir.path,
          image,
        })

        await expectError(
          () => api.core.readNamespacedPod(podName, namespace),
          (err) => expect(err.statusCode).to.equal(404)
        )
      })

      it("should handle globs when copying artifacts out of the container", async () => {
        const task = graph.getTask("globs-task")
        const module = task.module
        const image = containerHelpers.getDeploymentImageId(module, module.version, provider.config.deploymentRegistry)

        await runAndCopy({
          ctx: await garden.getPluginContext(provider),
          log: garden.log,
          command: task.spec.command,
          args: [],
          interactive: false,
          module,
          namespace,
          runtimeContext: { envVars: {}, dependencies: [] },
          artifacts: task.spec.artifacts,
          artifactsPath: tmpDir.path,
          image,
        })

        expect(await pathExists(join(tmpDir.path, "subdir", "task.txt"))).to.be.true
        expect(await pathExists(join(tmpDir.path, "output.txt"))).to.be.true
      })

      it("should not throw when an artifact is missing", async () => {
        const task = graph.getTask("artifacts-task")
        const module = task.module
        const image = containerHelpers.getDeploymentImageId(module, module.version, provider.config.deploymentRegistry)

        await runAndCopy({
          ctx: await garden.getPluginContext(provider),
          log: garden.log,
          command: ["sh", "-c", "echo ok"],
          args: [],
          interactive: false,
          module,
          namespace,
          runtimeContext: { envVars: {}, dependencies: [] },
          artifacts: task.spec.artifacts,
          artifactsPath: tmpDir.path,
          image,
        })
      })

      it("should correctly copy a whole directory", async () => {
        const task = graph.getTask("dir-task")
        const module = task.module
        const image = containerHelpers.getDeploymentImageId(module, module.version, provider.config.deploymentRegistry)

        await runAndCopy({
          ctx: await garden.getPluginContext(provider),
          log: garden.log,
          command: task.spec.command,
          args: [],
          interactive: false,
          module,
          namespace,
          runtimeContext: { envVars: {}, dependencies: [] },
          artifacts: task.spec.artifacts,
          artifactsPath: tmpDir.path,
          image,
        })

        expect(await pathExists(join(tmpDir.path, "my-task-report"))).to.be.true
        expect(await pathExists(join(tmpDir.path, "my-task-report", "output.txt"))).to.be.true
      })

      it("should return with logs and success=false when command exceeds timeout", async () => {
        const task = graph.getTask("artifacts-task")
        const module = task.module
        const image = containerHelpers.getDeploymentImageId(module, module.version, provider.config.deploymentRegistry)

        const result = await runAndCopy({
          ctx: await garden.getPluginContext(provider),
          log: garden.log,
          command: ["sh", "-c", "echo banana && sleep 10"],
          args: [],
          interactive: false,
          module,
          namespace,
          runtimeContext: { envVars: {}, dependencies: [] },
          artifacts: task.spec.artifacts,
          artifactsPath: tmpDir.path,
          image,
          timeout: 3,
        })

        expect(result.log.trim()).to.equal("Command timed out. Here are the logs until the timeout occurred:\n\nbanana")
        expect(result.success).to.be.false
      })

      it("should copy artifacts out of the container even when task times out", async () => {
        const task = graph.getTask("artifacts-task")
        const module = task.module
        const image = containerHelpers.getDeploymentImageId(module, module.version, provider.config.deploymentRegistry)

        const result = await runAndCopy({
          ctx: await garden.getPluginContext(provider),
          log: garden.log,
          command: ["sh", "-c", "touch /task.txt && sleep 10"],
          args: [],
          interactive: false,
          module,
          namespace,
          runtimeContext: { envVars: {}, dependencies: [] },
          artifacts: task.spec.artifacts,
          artifactsPath: tmpDir.path,
          image,
          timeout: 3,
        })

        expect(result.log.trim()).to.equal("Command timed out.")
        expect(await pathExists(join(tmpDir.path, "task.txt"))).to.be.true
        expect(result.success).to.be.false
      })

      it("should throw when container doesn't contain sh", async () => {
        const task = graph.getTask("missing-sh-task")
        const module = task.module
        const image = containerHelpers.getDeploymentImageId(module, module.version, provider.config.deploymentRegistry)

        const actions = await garden.getActionRouter()
        await garden.buildStaging.syncFromSrc(module, garden.log)
        await actions.build({
          module,
          log: garden.log,
        })

        await expectError(
          async () =>
            runAndCopy({
              ctx: await garden.getPluginContext(provider),
              log: garden.log,
              command: ["sh", "-c", "echo ok"],
              args: [],
              interactive: false,
              module,
              namespace,
              runtimeContext: { envVars: {}, dependencies: [] },
              artifacts: task.spec.artifacts,
              artifactsPath: tmpDir.path,
              description: "Foo",
              image,
              timeout: 20000,
              stdout: process.stdout,
              stderr: process.stderr,
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
        const task = graph.getTask("missing-tar-task")
        const module = task.module
        const image = containerHelpers.getDeploymentImageId(module, module.version, provider.config.deploymentRegistry)

        const actions = await garden.getActionRouter()
        await garden.buildStaging.syncFromSrc(module, garden.log)
        await actions.build({
          module,
          log: garden.log,
        })

        await expectError(
          async () =>
            runAndCopy({
              ctx: await garden.getPluginContext(provider),
              log: garden.log,
              command: ["sh", "-c", "echo ok"],
              args: [],
              interactive: false,
              module,
              namespace,
              runtimeContext: { envVars: {}, dependencies: [] },
              artifacts: task.spec.artifacts,
              artifactsPath: tmpDir.path,
              description: "Foo",
              image,
              timeout: 20000,
              stdout: process.stdout,
              stderr: process.stderr,
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
        const task = graph.getTask("missing-tar-task")
        const module = task.module
        const image = containerHelpers.getDeploymentImageId(module, module.version, provider.config.deploymentRegistry)

        await expectError(
          async () =>
            runAndCopy({
              ctx: await garden.getPluginContext(provider),
              log: garden.log,
              args: [],
              interactive: false,
              module,
              namespace,
              runtimeContext: { envVars: {}, dependencies: [] },
              artifacts: task.spec.artifacts,
              artifactsPath: tmpDir.path,
              description: "Foo",
              image,
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
