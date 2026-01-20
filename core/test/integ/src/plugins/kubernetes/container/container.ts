/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { TestGarden } from "../../../../../helpers.js"
import { getDataDir, makeTestGarden, expectError } from "../../../../../helpers.js"
import { TestTask } from "../../../../../../src/tasks/test.js"
import fsExtra from "fs-extra"
import { expect } from "chai"
import { dirname, join } from "path"
import type { ConfigGraph } from "../../../../../../src/graph/config-graph.js"
import { deline } from "../../../../../../src/util/string.js"
import { KubeApi } from "../../../../../../src/plugins/kubernetes/api.js"
import type { KubernetesConfig } from "../../../../../../src/plugins/kubernetes/config.js"
import type { V1Secret } from "@kubernetes/client-node"
import { clusterInit } from "../../../../../../src/plugins/kubernetes/commands/cluster-init.js"
import type { ContainerTestAction } from "../../../../../../src/plugins/container/config.js"
import { createActionLog } from "../../../../../../src/logger/log-entry.js"
import type { TestGardenOpts } from "../../../../../../src/util/testing.js"
import { waitForOutputFlush } from "../../../../../../src/process.js"
import { getGoogleADCImagePullSecret } from "../../../../helpers.js"
import type { KubernetesResource } from "../../../../../../src/plugins/kubernetes/types.js"
import { mkdir, writeFile } from "fs/promises"
import { isErrnoException } from "../../../../../../src/exceptions.js"

const { emptyDir, pathExists } = fsExtra

const root = getDataDir("test-projects", "container")
const defaultEnvironment = process.env.GARDEN_INTEG_TEST_MODE === "remote" ? "cluster-buildkit" : "local"

export interface ContainerTestGardenResult {
  garden: TestGarden
  cleanup: () => void
}

export async function getContainerTestGarden(
  environmentName: string = defaultEnvironment,
  opts?: TestGardenOpts
): Promise<ContainerTestGardenResult> {
  const cleanups: (() => void)[] = []

  const garden = await makeTestGarden(root, { environmentString: environmentName, noTempDir: opts?.noTempDir })
  cleanups.push(() => garden.close())

  let dockerConfig: string | undefined

  if (opts?.remoteContainerAuth) {
    dockerConfig = JSON.stringify(await getGoogleADCImagePullSecret())

    const dockerConfigPath = join(garden.projectRoot, ".docker-remote-test-config", "config.json")
    try {
      await mkdir(dirname(dockerConfigPath))
    } catch (e) {
      if (!isErrnoException(e) || e.code !== "EEXIST") {
        throw e
      }
    }
    await writeFile(dockerConfigPath, dockerConfig)
    process.env["DOCKER_CONFIG"] = dirname(dockerConfigPath)

    cleanups.push(() => {
      delete process.env["DOCKER_CONFIG"]
    })
  }

  const needsInit = !environmentName.startsWith("local")

  if (needsInit) {
    const localProvider = await garden.resolveProvider<KubernetesConfig>({
      log: garden.log,
      name: "local-kubernetes",
    })
    const ctx = await garden.getPluginContext({
      provider: localProvider,
      templateContext: undefined,
      events: undefined,
    })
    const api = await KubeApi.factory(
      garden.log,
      await garden.getPluginContext({ provider: localProvider, templateContext: undefined, events: undefined }),
      localProvider
    )

    // Only set when remote container auth is true
    if (dockerConfig) {
      const authSecret: KubernetesResource<V1Secret> = {
        apiVersion: "v1",
        kind: "Secret",
        type: "kubernetes.io/dockerconfigjson",
        metadata: {
          name: "test-docker-auth",
          namespace: "default",
        },
        stringData: {
          ".dockerconfigjson": dockerConfig,
        },
      }
      await api.upsert({ kind: "Secret", namespace: "default", obj: authSecret, log: garden.log })
    } else {
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

    // Run cluster-init
    await clusterInit.handler({
      garden,
      ctx,
      log: garden.log,
      args: [],
      graph: await garden.getConfigGraph({ log: garden.log, emit: false }),
    })
  }

  return { garden, cleanup: () => cleanups.forEach((c) => c()) }
}

describe("kubernetes container module handlers", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  // let provider: KubernetesProvider

  before(async () => {
    garden = await makeTestGarden(root)
    // provider = <KubernetesProvider>await garden.resolveProvider({ log: garden.log, name: "local-kubernetes" })
  })

  beforeEach(async () => {
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
  })

  after(async () => {
    garden.close()
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
      })

      garden.events.eventLog = []

      const result = await garden.processTasks({ tasks: [testTask], throwOnError: true })
      const logEvent = garden.events.eventLog.find((l) => l.name === "log")

      await waitForOutputFlush()

      expect(result.error).to.be.null
      const task = result.results.getResult(testTask)!
      expect(task).to.exist
      expect(task.outputs.log).to.equal("ok\nbear")
      expect(logEvent).to.exist
    })

    it("should fail if an error occurs, but store the result", async () => {
      const testAction = graph.getTest("simple-echo-test")!

      testAction["_config"].spec.command = ["bork"] // this will fail

      const testTask = new TestTask({
        garden,
        graph,
        action: testAction,
        log: garden.log,
        force: true,
        forceBuild: false,
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
      const actionLog = createActionLog({
        log: garden.log,
        actionName: resolvedRuntimeAction.name,
        actionKind: resolvedRuntimeAction.kind,
      })

      // We also verify that, despite the test failing, its result was still saved.
      const result = await actions.test.getResult({
        log: actionLog,
        graph,
        action: resolvedRuntimeAction,
      })

      expect(result).to.exist
    })

    context("artifacts are specified", () => {
      it("should copy artifacts out of the container", async () => {
        const action = graph.getTest("simple-artifacts-test")

        const testTask = new TestTask({
          garden,
          graph,
          action,
          log: garden.log,
          force: true,
          forceBuild: false,
        })

        await emptyDir(garden.artifactsPath)

        await garden.processTasks({ tasks: [testTask], throwOnError: true })

        expect(await pathExists(join(garden.artifactsPath, "test.txt"))).to.be.true
        expect(await pathExists(join(garden.artifactsPath, "subdir", "test.txt"))).to.be.true
      })

      it("should fail if an error occurs, but copy the artifacts out of the container", async () => {
        const action = graph.getTest("simple-artifacts-test-fail")

        const testTask = new TestTask({
          garden,
          graph,
          action,
          log: garden.log,
          force: true,
          forceBuild: false,
        })

        await emptyDir(garden.artifactsPath)

        const results = await garden.processTasks({ tasks: [testTask], throwOnError: false })

        expect(results.error).to.exist

        expect(await pathExists(join(garden.artifactsPath, "test.txt"))).to.be.true
        expect(await pathExists(join(garden.artifactsPath, "subdir", "test.txt"))).to.be.true
      })

      it("should handle globs when copying artifacts out of the container", async () => {
        const action = graph.getTest("simple-globs-test")

        const testTask = new TestTask({
          garden,
          graph,
          action,
          log: garden.log,
          force: true,
          forceBuild: false,
        })

        await emptyDir(garden.artifactsPath)

        await garden.processTasks({ tasks: [testTask], throwOnError: true })

        expect(await pathExists(join(garden.artifactsPath, "subdir", "test.txt"))).to.be.true
        expect(await pathExists(join(garden.artifactsPath, "output.txt"))).to.be.true
      })

      it("should throw when container doesn't contain sh", async () => {
        const action = graph.getTest("missing-sh-missing-sh-test")

        const testTask = new TestTask({
          garden,
          graph,
          action,
          log: garden.log,
          force: true,
          forceBuild: false,
        })

        const result = await garden.processTasks({ tasks: [testTask], throwOnError: false })

        expect(result.error).to.exist
        expect(result.error!.message).to.include(deline`sh and tar need to be installed in the image.`)
      })

      it("should throw when container doesn't contain tar", async () => {
        const action = graph.getTest("missing-tar-missing-tar-test")

        const testTask = new TestTask({
          garden,
          graph,
          action,
          log: garden.log,
          force: true,
          forceBuild: false,
        })

        const result = await garden.processTasks({ tasks: [testTask], throwOnError: false })

        expect(result.error).to.exist
        expect(result.error!.message).to.include(deline`sh and tar need to be installed in the image.`)
      })
    })
  })
})
