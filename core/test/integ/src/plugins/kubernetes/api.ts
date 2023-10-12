/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Garden } from "../../../../../src/garden"
import { Provider } from "../../../../../src/config/provider"
import { KubernetesConfig, KubernetesPluginContext } from "../../../../../src/plugins/kubernetes/config"
import { KubeApi, KubernetesError } from "../../../../../src/plugins/kubernetes/api"
import { expectError, getDataDir, makeTestGarden } from "../../../../helpers"
import { getAppNamespace } from "../../../../../src/plugins/kubernetes/namespace"
import { randomString, gardenAnnotationKey } from "../../../../../src/util/string"
import { KubeConfig, V1ConfigMap } from "@kubernetes/client-node"
import { KubernetesResource, KubernetesPod } from "../../../../../src/plugins/kubernetes/types"
import { expect } from "chai"
import { waitForResources } from "../../../../../src/plugins/kubernetes/status/status"
import { PluginContext } from "../../../../../src/plugin-context"
import { KUBECTL_DEFAULT_TIMEOUT } from "../../../../../src/plugins/kubernetes/kubectl"
import { createServer } from "http"
import { getRootLogger } from "../../../../../src/logger/logger"

describe("KubeApi", () => {
  context("helpers", () => {
    let garden: Garden
    let ctx: PluginContext
    let provider: Provider<KubernetesConfig>
    let api: KubeApi
    let namespace: string

    const containerName = "main"

    before(async () => {
      const root = getDataDir("test-projects", "container")
      garden = await makeTestGarden(root)
      provider = (await garden.resolveProvider(garden.log, "local-kubernetes")) as Provider<KubernetesConfig>
      ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
      api = await KubeApi.factory(garden.log, ctx, provider)
      namespace = await getAppNamespace(ctx as KubernetesPluginContext, garden.log, provider)
    })

    after(async () => {
      garden.close()
    })

    function makePod(command: string[], image = "busybox"): KubernetesPod {
      return {
        apiVersion: "v1",
        kind: "Pod",
        metadata: {
          name: "api-test-" + randomString(8),
          namespace,
        },
        spec: {
          containers: [
            {
              name: containerName,
              image,
              command,
            },
          ],
        },
      }
    }

    describe("replace", () => {
      it("should replace an existing resource in the cluster", async () => {
        const name = randomString()

        const configMap: KubernetesResource<V1ConfigMap> = {
          apiVersion: "v1",
          kind: "ConfigMap",
          metadata: {
            name,
            namespace,
          },
          data: {
            something: "whatever",
          },
        }

        await api.core.createNamespacedConfigMap(namespace, configMap)

        try {
          configMap.data!.other = "thing"
          await api.replace({ log: garden.log, resource: configMap })

          const updated = await api.core.readNamespacedConfigMap(name, namespace)
          expect(updated.data?.other).to.equal("thing")
        } finally {
          await api.deleteBySpec({ namespace, manifest: configMap, log: garden.log })
        }
      })
    })

    describe("execInPod", () => {
      let pod: KubernetesPod
      let podName: string

      beforeEach(async () => {
        pod = makePod(["/bin/sh", "-c", "sleep 600"])
        podName = pod.metadata.name

        await api.createPod(namespace, pod)
        await waitForResources({
          namespace,
          ctx,
          provider,
          actionName: "exec-test",
          resources: [pod],
          log: garden.log,
          timeoutSec: KUBECTL_DEFAULT_TIMEOUT,
        })
      })

      afterEach(async () => {
        if (podName) {
          await api.core.deleteNamespacedPod(podName, namespace)
        }
      })

      it("should exec a command in a Pod and return the output", async () => {
        const res = await api.execInPod({
          log: garden.log,
          namespace,
          podName,
          containerName,
          command: ["/bin/sh", "-c", "echo some output"],
          tty: false,
          buffer: true,
        })
        expect(res.stdout).to.equal("some output\n")
        expect(res.stderr).to.equal("")
        expect(res.exitCode).to.equal(0)
        expect(res.timedOut).to.be.false
      })

      it("should correctly return an error exit code", async () => {
        const res = await api.execInPod({
          log: garden.log,
          namespace,
          podName,
          containerName,
          command: ["/bin/sh", "-c", "exit 2"],
          tty: false,
          buffer: true,
        })
        expect(res.stdout).to.equal("")
        expect(res.stderr).to.equal("")
        expect(res.exitCode).to.equal(2)
        expect(res.timedOut).to.be.false
      })

      it("should optionally time out", async () => {
        const res = await api.execInPod({
          log: garden.log,
          namespace,
          podName,
          containerName: "main",
          command: ["/bin/sh", "-c", "echo foo && sleep 100"],
          tty: false,
          timeoutSec: 2,
          buffer: true,
        })
        expect(res.stdout).to.equal("foo\n")
        expect(res.stderr).to.equal("")
        expect(res.exitCode).to.be.undefined
        expect(res.timedOut).to.be.true
      })
    })

    describe("listResources", () => {
      it("should list all resources of specified kind", async () => {
        const name = randomString()

        const configMap: KubernetesResource<V1ConfigMap> = {
          apiVersion: "v1",
          kind: "ConfigMap",
          metadata: {
            name,
            namespace,
          },
          data: {
            something: "whatever",
          },
        }

        await api.core.createNamespacedConfigMap(namespace, configMap)

        try {
          const list = await api.listResources({
            log: garden.log,
            apiVersion: "v1",
            kind: "ConfigMap",
            namespace,
          })
          expect(list.kind).to.equal("ConfigMapList")
          expect(list.items.find((r) => r.metadata.name === name)).to.exist
        } finally {
          await api.deleteBySpec({ namespace, manifest: configMap, log: garden.log })
        }
      })

      it("should list resources with a label selector", async () => {
        const nameA = randomString()
        const nameB = randomString()
        const serviceName = randomString()

        const labels = {
          [gardenAnnotationKey("service")]: serviceName,
        }

        const configMapA: KubernetesResource<V1ConfigMap> = {
          apiVersion: "v1",
          kind: "ConfigMap",
          metadata: {
            name: nameA,
            namespace,
            labels,
          },
          data: {
            something: "whatever",
          },
        }
        const configMapB: KubernetesResource<V1ConfigMap> = {
          apiVersion: "v1",
          kind: "ConfigMap",
          metadata: {
            name: nameB,
            namespace,
            // No labels on this one
          },
          data: {
            something: "whatever",
          },
        }

        await api.core.createNamespacedConfigMap(namespace, configMapA)
        await api.core.createNamespacedConfigMap(namespace, configMapB)

        try {
          const list = await api.listResources({
            log: garden.log,
            apiVersion: "v1",
            kind: "ConfigMap",
            namespace,
            labelSelector: labels,
          })
          expect(list.kind).to.equal("ConfigMapList")
          expect(list.items.length).to.equal(1)
          expect(list.items.find((r) => r.metadata.name === nameA)).to.exist
        } finally {
          await api.deleteBySpec({ namespace, manifest: configMapA, log: garden.log })
          await api.deleteBySpec({ namespace, manifest: configMapB, log: garden.log })
        }
      })
    })
  })

  describe("request", () => {
    const hostname = "127.0.0.1"
    const port = 3021
    let api: KubeApi
    const log = getRootLogger().createLog()
    before(async () => {
      class TestKubeConfig extends KubeConfig {
        override getCurrentCluster() {
          return {
            name: "test-cluster",
            server: `http://${hostname}:${port}/`,
            skipTLSVerify: true,
          }
        }
      }
      const config = new TestKubeConfig()
      api = new KubeApi(log, "test-context", config)
    })

    let wasRetried: boolean
    let reqCount: number
    let statusCodeHandler: () => number
    afterEach(() => {
      reqCount = 0
      wasRetried = false
      statusCodeHandler = () => {
        throw "implement in test case"
      }
    })
    const server = createServer((req, res) => {
      let bodyRaw = ""
      reqCount++
      wasRetried = reqCount > 1
      req.on("data", (data) => {
        bodyRaw += data
      })
      req.on("end", () => {
        const body = JSON.parse(bodyRaw || "{}") as Body

        res.statusCode = statusCodeHandler()
        res.setHeader("Content-Type", "application/json")
        res.end(JSON.stringify(body))
      })
    })

    server.listen(port, hostname)

    after(() => {
      server.close()
    })

    it("should do a basic request without failure", async () => {
      statusCodeHandler = () => 200
      const res = await api.request({
        log,
        path: "",
        opts: { body: { bodyContent: "foo" } },
        retryOpts: { maxRetries: 0, minTimeoutMs: 0 },
      })
      expect(res.body).to.eql({ bodyContent: "foo" })
      expect(res.statusCode).to.eql(200)
    })

    it("should fail on a bad status code", async () => {
      statusCodeHandler = () => 500
      await expectError(
        () =>
          api.request({
            log,
            path: "",
            retryOpts: { maxRetries: 0, minTimeoutMs: 0 },
          }),
        (err) => {
          expect(err instanceof KubernetesError)
        }
      )
    })

    it("should retry on certain statuses", async () => {
      statusCodeHandler = () => (reqCount === 2 ? 200 : 500)
      const res = await api.request({
        log,
        path: "",
        retryOpts: { maxRetries: 1, minTimeoutMs: 0 },
      })
      expect(wasRetried).to.eql(true)
      expect(res.statusCode).to.eql(200)
    })

    it("should not retry on certain statuses", async () => {
      statusCodeHandler = () => 403
      try {
        await api.request({
          log,
          path: "",
          retryOpts: { maxRetries: 1, minTimeoutMs: 0 },
        })
      } catch {}
      expect(wasRetried).to.eql(false)
    })

    it("should retry on certain err messages", async () => {
      statusCodeHandler = () => 400
      try {
        await api.request({
          log,
          path: "",
          opts: { body: { msg: "ECONNRESET" } },
          retryOpts: { maxRetries: 2, minTimeoutMs: 0 },
        })
      } catch {}
      expect(wasRetried).to.eql(true)
    })

    it("should not retry on unrelated error messages", async () => {
      statusCodeHandler = () => 400
      try {
        await api.request({
          log,
          path: "",
          opts: { body: { msg: "unrelated error" } },
          retryOpts: { maxRetries: 1, minTimeoutMs: 0 },
        })
      } catch {}
      expect(wasRetried).to.eql(false)
    })

    it("should respect maxRetries param", async () => {
      statusCodeHandler = () => (reqCount === 3 ? 200 : 500)
      await api.request({
        log,
        path: "",
        retryOpts: { maxRetries: 2, minTimeoutMs: 0 },
      })
      expect(reqCount).to.eql(3)
    })

    it("should not do unneeded retries", async () => {
      statusCodeHandler = () => (reqCount === 3 ? 200 : 500)
      await api.request({
        log,
        path: "",
        retryOpts: { maxRetries: 1000, minTimeoutMs: 0 },
      })
      expect(reqCount).to.eql(3)
    })
  })
})
