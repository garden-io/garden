/*
 * Copyright (C) 2018-2020 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import tmp from "tmp-promise"
import { getDataDir, makeTestGarden, expectError } from "../../../../../helpers"
import { TestTask } from "../../../../../../src/tasks/test"
import { emptyDir, pathExists } from "fs-extra"
import { expect } from "chai"
import { join, resolve } from "path"
import { Garden } from "../../../../../../src/garden"
import { ConfigGraph } from "../../../../../../src/config-graph"
import { findByName } from "../../../../../../src/util/util"
import { deline } from "../../../../../../src/util/string"
import { runAndCopy } from "../../../../../../src/plugins/kubernetes/run"
import { containerHelpers } from "../../../../../../src/plugins/container/helpers"
import { runContainerService } from "../../../../../../src/plugins/kubernetes/container/run"
import { prepareRuntimeContext } from "../../../../../../src/runtime-context"
import { KubeApi } from "../../../../../../src/plugins/kubernetes/api"
import { KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config"
import { makePodName } from "../../../../../../src/plugins/kubernetes/util"
import { decryptSecretFile } from "../../../../helpers"
import { GARDEN_SERVICE_ROOT } from "../../../../../../src/constants"
import { KubernetesResource } from "../../../../../../src/plugins/kubernetes/types"
import { V1Secret } from "@kubernetes/client-node"
import { clusterInit } from "../../../../../../src/plugins/kubernetes/commands/cluster-init"

const root = getDataDir("test-projects", "container")
const defaultEnvironment = process.env.GARDEN_INTEG_TEST_MODE === "remote" ? "cluster-docker" : "local"
let initializedEnv: string
let localInstance: Garden

export async function getContainerTestGarden(environmentName: string = defaultEnvironment) {
  const garden = await makeTestGarden(root, { environmentName })

  if (!localInstance) {
    localInstance = await makeTestGarden(root, { environmentName: "local" })
  }

  const needsInit = !environmentName.startsWith("local") && initializedEnv !== environmentName

  if (needsInit) {
    // Load the test authentication for private registries
    const localProvider = <KubernetesProvider>await localInstance.resolveProvider("local-kubernetes")
    const api = await KubeApi.factory(garden.log, localProvider)

    try {
      const authSecret = JSON.parse(
        (await decryptSecretFile(resolve(GARDEN_SERVICE_ROOT, "..", "secrets", "test-docker-auth.json"))).toString()
      )
      await api.upsert({ kind: "Secret", namespace: "default", obj: authSecret, log: garden.log })
    } catch (err) {
      // This is expected when running without access to gcloud (e.g. in minikube tests)
      // tslint:disable-next-line: no-console
      console.log("Warning: Unable to decrypt docker auth secret")
      const authSecret: KubernetesResource<V1Secret> = {
        apiVersion: "v1",
        kind: "Secret",
        type: "kubernetes.io/dockerconfigjson",
        metadata: {
          name: "test-docker-auth",
          namespace: "default",
        },
        stringData: {
          ".dockerconfigjson": JSON.stringify({ auths: {}, experimental: "enabled" }),
        },
      }
      await api.upsert({ kind: "Secret", namespace: "default", obj: authSecret, log: garden.log })
    }

    const credentialHelperAuth: KubernetesResource<V1Secret> = {
      apiVersion: "v1",
      kind: "Secret",
      type: "kubernetes.io/dockerconfigjson",
      metadata: {
        name: "test-cred-helper-auth",
        namespace: "default",
      },
      stringData: {
        ".dockerconfigjson": JSON.stringify({ credHelpers: {}, experimental: "enabled" }),
      },
    }
    await api.upsert({ kind: "Secret", namespace: "default", obj: credentialHelperAuth, log: garden.log })
  }

  const provider = <KubernetesProvider>await garden.resolveProvider("local-kubernetes")
  const ctx = garden.getPluginContext(provider)

  if (needsInit) {
    // Run cluster-init
    await clusterInit.handler({ ctx, log: garden.log, args: [], modules: [] })
    initializedEnv = environmentName
  }

  return garden
}

describe("kubernetes container module handlers", () => {
  let garden: Garden
  let graph: ConfigGraph
  let provider: KubernetesProvider
  let namespace: string

  before(async () => {
    garden = await makeTestGarden(root)
    provider = <KubernetesProvider>await garden.resolveProvider("local-kubernetes")
    namespace = garden.projectName
  })

  beforeEach(async () => {
    graph = await garden.getConfigGraph(garden.log)
  })

  after(async () => {
    await garden.close()
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
      const image = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)

      const result = await runAndCopy({
        ctx: garden.getPluginContext(provider),
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
      const image = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)
      const podName = makePodName("test", module.name)

      await runAndCopy({
        ctx: garden.getPluginContext(provider),
        log: garden.log,
        command: ["sh", "-c", "echo ok"],
        args: [],
        interactive: false,
        module,
        namespace: garden.projectName,
        podName,
        runtimeContext: { envVars: {}, dependencies: [] },
        image,
      })

      const api = await KubeApi.factory(garden.log, provider)

      await expectError(
        () => api.core.readNamespacedPod(podName, namespace),
        (err) => expect(err.statusCode).to.equal(404)
      )
    })

    it("should return with success=false when command exceeds timeout", async () => {
      const task = graph.getTask("artifacts-task")
      const module = task.module
      const image = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)

      const result = await runAndCopy({
        ctx: garden.getPluginContext(provider),
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
        const image = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)

        const result = await runAndCopy({
          ctx: garden.getPluginContext(provider),
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
        const image = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)
        const podName = makePodName("test", module.name)

        await runAndCopy({
          ctx: garden.getPluginContext(provider),
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

        const api = await KubeApi.factory(garden.log, provider)

        await expectError(
          () => api.core.readNamespacedPod(podName, namespace),
          (err) => expect(err.statusCode).to.equal(404)
        )
      })

      it("should handle globs when copying artifacts out of the container", async () => {
        const task = graph.getTask("globs-task")
        const module = task.module
        const image = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)

        await runAndCopy({
          ctx: garden.getPluginContext(provider),
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
        const image = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)

        await runAndCopy({
          ctx: garden.getPluginContext(provider),
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
        const image = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)

        await runAndCopy({
          ctx: garden.getPluginContext(provider),
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
        const image = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)

        const result = await runAndCopy({
          ctx: garden.getPluginContext(provider),
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
        const image = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)

        const result = await runAndCopy({
          ctx: garden.getPluginContext(provider),
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
        const image = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)

        const actions = await garden.getActionRouter()
        await garden.buildDir.syncFromSrc(module, garden.log)
        await actions.build({
          module,
          log: garden.log,
        })

        await expectError(
          () =>
            runAndCopy({
              ctx: garden.getPluginContext(provider),
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
        const image = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)

        const actions = await garden.getActionRouter()
        await garden.buildDir.syncFromSrc(module, garden.log)
        await actions.build({
          module,
          log: garden.log,
        })

        await expectError(
          () =>
            runAndCopy({
              ctx: garden.getPluginContext(provider),
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
        const image = await containerHelpers.getDeploymentImageId(module, provider.config.deploymentRegistry)

        await expectError(
          () =>
            runAndCopy({
              ctx: garden.getPluginContext(provider),
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

  describe("runContainerService", () => {
    it("should run a service", async () => {
      const service = graph.getService("echo-service")

      const runtimeContext = await prepareRuntimeContext({
        garden,
        graph,
        dependencies: {
          build: [],
          deploy: [],
          run: [],
          test: [],
        },
        version: service.module.version,
        serviceStatuses: {},
        taskResults: {},
      })

      const result = await runContainerService({
        ctx: garden.getPluginContext(provider),
        log: garden.log,
        service,
        module: service.module,
        interactive: false,
        runtimeContext,
      })

      expect(result.success).to.be.true
      expect(result.log.trim()).to.eql("ok")
    })

    it("should add configured env vars to the runtime context", async () => {
      const service = graph.getService("env-service")

      const runtimeContext = await prepareRuntimeContext({
        garden,
        graph,
        dependencies: {
          build: [],
          deploy: [],
          run: [],
          test: [],
        },
        version: service.module.version,
        serviceStatuses: {},
        taskResults: {},
      })

      const result = await runContainerService({
        ctx: garden.getPluginContext(provider),
        log: garden.log,
        service,
        module: service.module,
        interactive: false,
        runtimeContext,
      })

      expect(result.log.trim()).to.eql("foo")
    })
  })

  describe("testContainerModule", () => {
    it("should run a basic test", async () => {
      const module = graph.getModule("simple")

      const testTask = new TestTask({
        garden,
        graph,
        module,
        testConfig: findByName(module.testConfigs, "echo-test")!,
        log: garden.log,
        force: true,
        forceBuild: false,
        version: module.version,
        _guard: true,
      })

      const result = await garden.processTasks([testTask], { throwOnError: true })

      const key = "test.simple.echo-test"
      expect(result).to.have.property(key)
      expect(result[key]!.output.log.trim()).to.equal("ok")
    })

    it("should fail if an error occurs, but store the result", async () => {
      const module = graph.getModule("simple")

      const testConfig = findByName(module.testConfigs, "echo-test")!
      testConfig.spec.command = ["bork"] // this will fail

      const testTask = new TestTask({
        garden,
        graph,
        module,
        testConfig,
        log: garden.log,
        force: true,
        forceBuild: false,
        version: module.version,
        _guard: true,
      })

      await expectError(
        async () => await garden.processTasks([testTask], { throwOnError: true }),
        (err) => expect(err.message).to.match(/bork/)
      )

      const actions = await garden.getActionRouter()

      // We also verify that, despite the test failing, its result was still saved.
      const result = await actions.getTestResult({
        log: garden.log,
        module,
        testName: testConfig.name,
        testVersion: testTask.version,
      })

      expect(result).to.exist
    })

    context("artifacts are specified", () => {
      it("should copy artifacts out of the container", async () => {
        const module = graph.getModule("simple")

        const testTask = new TestTask({
          garden,
          graph,
          module,
          testConfig: findByName(module.testConfigs, "artifacts-test")!,
          log: garden.log,
          force: true,
          forceBuild: false,
          version: module.version,
          _guard: true,
        })

        await emptyDir(garden.artifactsPath)

        await garden.processTasks([testTask], { throwOnError: true })

        expect(await pathExists(join(garden.artifactsPath, "test.txt"))).to.be.true
        expect(await pathExists(join(garden.artifactsPath, "subdir", "test.txt"))).to.be.true
      })

      it("should fail if an error occurs, but copy the artifacts out of the container", async () => {
        const module = await graph.getModule("simple")

        const testTask = new TestTask({
          garden,
          graph,
          module,
          testConfig: findByName(module.testConfigs, "artifacts-test-fail")!,
          log: garden.log,
          force: true,
          forceBuild: false,
          version: module.version,
          _guard: true,
        })

        await emptyDir(garden.artifactsPath)

        const results = await garden.processTasks([testTask], { throwOnError: false })

        expect(results[testTask.getKey()]!.error).to.exist

        expect(await pathExists(join(garden.artifactsPath, "test.txt"))).to.be.true
        expect(await pathExists(join(garden.artifactsPath, "subdir", "test.txt"))).to.be.true
      })

      it("should handle globs when copying artifacts out of the container", async () => {
        const module = graph.getModule("simple")

        const testTask = new TestTask({
          garden,
          graph,
          module,
          testConfig: findByName(module.testConfigs, "globs-test")!,
          log: garden.log,
          force: true,
          forceBuild: false,
          version: module.version,
          _guard: true,
        })

        await emptyDir(garden.artifactsPath)

        await garden.processTasks([testTask], { throwOnError: true })

        expect(await pathExists(join(garden.artifactsPath, "subdir", "test.txt"))).to.be.true
        expect(await pathExists(join(garden.artifactsPath, "output.txt"))).to.be.true
      })

      it("should throw when container doesn't contain sh", async () => {
        const module = graph.getModule("missing-sh")

        const testTask = new TestTask({
          garden,
          graph,
          module,
          testConfig: module.testConfigs[0],
          log: garden.log,
          force: true,
          forceBuild: false,
          version: module.version,
          _guard: true,
        })

        const result = await garden.processTasks([testTask])

        const key = "test.missing-sh.missing-sh-test"
        expect(result).to.have.property(key)
        expect(result[key]!.error).to.exist
        expect(result[key]!.error!.message).to.equal(deline`
          Test 'missing-sh-test' in container module 'missing-sh' specifies artifacts to export, but the image doesn't
          contain the sh binary. In order to copy artifacts out of Kubernetes containers, both sh and tar need
          to be installed in the image.
        `)
      })

      it("should throw when container doesn't contain tar", async () => {
        const module = graph.getModule("missing-tar")

        const testTask = new TestTask({
          garden,
          graph,
          module,
          testConfig: module.testConfigs[0],
          log: garden.log,
          force: true,
          forceBuild: false,
          version: module.version,
          _guard: true,
        })

        const result = await garden.processTasks([testTask])

        const key = "test.missing-tar.missing-tar-test"
        expect(result).to.have.property(key)
        expect(result[key]!.error).to.exist
        expect(result[key]!.error!.message).to.equal(deline`
          Test 'missing-tar-test' in container module 'missing-tar' specifies artifacts to export, but the
          image doesn't contain the tar binary. In order to copy artifacts out of Kubernetes containers, both
          sh and tar need to be installed in the image.
        `)
      })
    })
  })
})
