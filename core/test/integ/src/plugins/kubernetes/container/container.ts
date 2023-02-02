/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { getDataDir, makeTestGarden, expectError, TestGarden } from "../../../../../helpers"
import { TestTask } from "../../../../../../src/tasks/test"
import { emptyDir, pathExists } from "fs-extra"
import { expect } from "chai"
import { join, resolve } from "path"
import { Garden } from "../../../../../../src/garden"
import { ConfigGraph } from "../../../../../../src/graph/config-graph"
import { deline } from "../../../../../../src/util/string"
import { KubeApi } from "../../../../../../src/plugins/kubernetes/api"
import { KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config"
import { decryptSecretFile } from "../../../../helpers"
import { GARDEN_CORE_ROOT } from "../../../../../../src/constants"
import { KubernetesResource } from "../../../../../../src/plugins/kubernetes/types"
import { V1Secret } from "@kubernetes/client-node"
import { clusterInit } from "../../../../../../src/plugins/kubernetes/commands/cluster-init"
import { ContainerTestAction } from "../../../../../../src/plugins/container/config"

const root = getDataDir("test-projects", "container")
const defaultEnvironment = process.env.GARDEN_INTEG_TEST_MODE === "remote" ? "kaniko" : "local"
const initializedEnvs: string[] = []
let localInstance: Garden

export async function getContainerTestGarden(environmentName: string = defaultEnvironment) {
  const garden = await makeTestGarden(root, { environmentName })

  if (!localInstance) {
    localInstance = await makeTestGarden(root, { environmentName: "local" })
  }

  const needsInit = !environmentName.startsWith("local") && !initializedEnvs.includes(environmentName)

  if (needsInit) {
    // Load the test authentication for private registries
    const localProvider = <KubernetesProvider>await localInstance.resolveProvider(localInstance.log, "local-kubernetes")
    const api = await KubeApi.factory(
      garden.log,
      await garden.getPluginContext({ provider: localProvider, templateContext: undefined, events: undefined }),
      localProvider
    )

    try {
      const authSecret = JSON.parse(
        (await decryptSecretFile(resolve(GARDEN_CORE_ROOT, "..", "secrets", "test-docker-auth.json"))).toString()
      )
      await api.upsert({ kind: "Secret", namespace: "default", obj: authSecret, log: garden.log })
    } catch (err) {
      // This is expected when running without access to gcloud (e.g. in minikube tests)
      // eslint-disable-next-line no-console
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

  const provider = <KubernetesProvider>await garden.resolveProvider(garden.log, "local-kubernetes")
  const ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })

  if (needsInit) {
    // Run cluster-init
    await clusterInit.handler({
      garden,
      ctx,
      log: garden.log,
      args: [],
      graph: await garden.getConfigGraph({ log: garden.log, emit: false }),
    })
    initializedEnvs.push(environmentName)
  }

  return garden
}

describe("kubernetes container module handlers", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  // let provider: KubernetesProvider

  before(async () => {
    garden = await makeTestGarden(root)
    // provider = <KubernetesProvider>await garden.resolveProvider(garden.log, "local-kubernetes")
  })

  beforeEach(async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
  })

  after(async () => {
    await garden.close()
  })

  describe("testContainerModule", () => {
    it("should run a basic test and emit log events", async () => {
      const action = graph.getTest("simple-echo-test-with-sleep")

      const testTask = new TestTask({
        garden,
        graph,
        silent: false,
        action,
        log: garden.log,
        force: true,
        forceBuild: false,
        fromWatch: false,
        devModeDeployNames: [],
        localModeDeployNames: [],
      })

      garden.events.eventLog = []

      const result = await garden.processTasks({ tasks: [testTask], throwOnError: true })
      const logEvent = garden.events.eventLog.find((l) => l.name === "log" && l.payload["entity"]["type"] === "test")

      const key = "test.simple.echo-test-with-sleep"
      expect(result).to.have.property(key)
      expect(result[key]!.result.log.trim()).to.equal("ok\nbear")
      expect(result[key]!.result.namespaceStatus).to.exist
      expect(logEvent).to.exist
    })

    it("should fail if an error occurs, but store the result", async () => {
      const testAction = graph.getTest("echo-test")!
      testAction.getConfig().spec.command = ["bork"] // this will fail

      const testTask = new TestTask({
        garden,
        graph,
        action: testAction,
        log: garden.log,
        force: true,
        forceBuild: false,
        fromWatch: false,
        devModeDeployNames: [],
        localModeDeployNames: [],
      })

      await expectError(
        async () => await garden.processTasks({ tasks: [testTask], throwOnError: true }),
        (err) => {
          expect(err.message).to.match(/bork/)
        }
      )

      const resolvedRuntimeAction = await garden.resolveAction<ContainerTestAction>({
        action: testAction,
        log: garden.log,
        graph,
      })
      const actions = await garden.getActionRouter()

      // We also verify that, despite the test failing, its result was still saved.
      const result = await actions.test.getResult({
        log: garden.log,
        graph,
        action: resolvedRuntimeAction,
      })

      expect(result).to.exist
    })

    context("artifacts are specified", () => {
      it("should copy artifacts out of the container", async () => {
        const action = graph.getTest("artifacts-test")

        const testTask = new TestTask({
          garden,
          graph,
          action,
          log: garden.log,
          force: true,
          forceBuild: false,
          fromWatch: false,
          devModeDeployNames: [],
          localModeDeployNames: [],
        })

        await emptyDir(garden.artifactsPath)

        await garden.processTasks({ tasks: [testTask], throwOnError: true })

        expect(await pathExists(join(garden.artifactsPath, "test.txt"))).to.be.true
        expect(await pathExists(join(garden.artifactsPath, "subdir", "test.txt"))).to.be.true
      })

      it("should fail if an error occurs, but copy the artifacts out of the container", async () => {
        const action = graph.getTest("artifacts-test-fail")

        const testTask = new TestTask({
          garden,
          graph,
          action,
          log: garden.log,
          force: true,
          forceBuild: false,
          fromWatch: false,
          devModeDeployNames: [],
          localModeDeployNames: [],
        })

        await emptyDir(garden.artifactsPath)

        const results = await garden.processTasks({ tasks: [testTask], throwOnError: false })

        expect(results[testTask.getBaseKey()]!.error).to.exist

        expect(await pathExists(join(garden.artifactsPath, "test.txt"))).to.be.true
        expect(await pathExists(join(garden.artifactsPath, "subdir", "test.txt"))).to.be.true
      })

      it("should handle globs when copying artifacts out of the container", async () => {
        const action = graph.getTest("globs-test")

        const testTask = new TestTask({
          garden,
          graph,
          action,
          log: garden.log,
          force: true,
          forceBuild: false,
          fromWatch: false,
          devModeDeployNames: [],
          localModeDeployNames: [],
        })

        await emptyDir(garden.artifactsPath)

        await garden.processTasks({ tasks: [testTask], throwOnError: true })

        expect(await pathExists(join(garden.artifactsPath, "subdir", "test.txt"))).to.be.true
        expect(await pathExists(join(garden.artifactsPath, "output.txt"))).to.be.true
      })

      it("should throw when container doesn't contain sh", async () => {
        const action = graph.getTest("missing-sh-test")

        const testTask = new TestTask({
          garden,
          graph,
          action,
          log: garden.log,
          force: true,
          forceBuild: false,
          fromWatch: false,
          devModeDeployNames: [],
          localModeDeployNames: [],
        })

        const result = await garden.processTasks({ tasks: [testTask], throwOnError: false })

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
        const action = graph.getTest("missing-tar-test")

        const testTask = new TestTask({
          garden,
          graph,
          action,
          log: garden.log,
          force: true,
          forceBuild: false,
          fromWatch: false,
          devModeDeployNames: [],
          localModeDeployNames: [],
        })

        const result = await garden.processTasks({ tasks: [testTask], throwOnError: false })

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
