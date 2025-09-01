/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Garden } from "../../../../../src/garden.js"
import type { Provider } from "../../../../../src/config/provider.js"
import type { KubernetesConfig, KubernetesPluginContext } from "../../../../../src/plugins/kubernetes/config.js"
import { KubeApi, KubernetesError } from "../../../../../src/plugins/kubernetes/api.js"
import { expectError, getDataDir, makeTestGarden } from "../../../../helpers.js"
import { getAppNamespace } from "../../../../../src/plugins/kubernetes/namespace.js"
import { randomString } from "../../../../../src/util/string.js"
import { gardenAnnotationKey } from "../../../../../src/util/annotations.js"
import type { V1ConfigMap } from "@kubernetes/client-node"
import { KubeConfig } from "@kubernetes/client-node"
import type { KubernetesResource, KubernetesPod } from "../../../../../src/plugins/kubernetes/types.js"
import { expect } from "chai"
import { waitForResources } from "../../../../../src/plugins/kubernetes/status/status.js"
import type { PluginContext } from "../../../../../src/plugin-context.js"
import { KUBECTL_DEFAULT_TIMEOUT } from "../../../../../src/plugins/kubernetes/kubectl.js"
import { createServer } from "http"
import { getRootLogger } from "../../../../../src/logger/logger.js"
import type { IncomingMessage, Server, ServerResponse } from "node:http"
import type { Body } from "node-fetch"

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
      provider = (await garden.resolveProvider({
        log: garden.log,
        name: "local-kubernetes",
      })) as Provider<KubernetesConfig>
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

        await api.core.createNamespacedConfigMap({ namespace, body: configMap })

        try {
          configMap.data!.other = "thing"
          await api.replace({ log: garden.log, resource: configMap })

          const updated = await api.core.readNamespacedConfigMap({ name, namespace })
          expect(updated.data?.other).to.equal("thing")
        } finally {
          await api.deleteBySpec({ namespace, manifest: configMap, log: garden.log })
        }
      })
    })

    describe("execInPod", () => {
      it("should exec a command in a Pod and return the output", async () => {
        const pod = makePod(["/bin/sh", "-c", "sleep 600"])
        const podName = pod.metadata.name

        await api.createPod(namespace, pod)
        await waitForResources({
          namespace,
          ctx,
          provider,
          logContext: "exec-test",
          waitForJobs: true,
          resources: [pod],
          log: garden.log,
          timeoutSec: KUBECTL_DEFAULT_TIMEOUT,
        })

        try {
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
        } finally {
          await api.core.deleteNamespacedPod({ name: podName, namespace })
        }
      })

      it("should correctly return an error exit code", async () => {
        const pod = makePod(["/bin/sh", "-c", "sleep 600"])
        const podName = pod.metadata.name

        await api.createPod(namespace, pod)
        await waitForResources({
          namespace,
          ctx,
          provider,
          waitForJobs: true,
          logContext: "exec-test",
          resources: [pod],
          log: garden.log,
          timeoutSec: KUBECTL_DEFAULT_TIMEOUT,
        })

        try {
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
        } finally {
          await api.core.deleteNamespacedPod({ name: podName, namespace })
        }
      })

      it("should optionally time out", async () => {
        const pod = makePod(["/bin/sh", "-c", "sleep 600"])
        const podName = pod.metadata.name

        await api.createPod(namespace, pod)
        await waitForResources({
          namespace,
          ctx,
          provider,
          waitForJobs: true,
          logContext: "exec-test",
          resources: [pod],
          log: garden.log,
          timeoutSec: KUBECTL_DEFAULT_TIMEOUT,
        })

        try {
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
        } finally {
          await api.core.deleteNamespacedPod({ name: podName, namespace })
        }
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

        await api.core.createNamespacedConfigMap({ namespace, body: configMap })

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

        await api.core.createNamespacedConfigMap({ namespace, body: configMapA })
        await api.core.createNamespacedConfigMap({ namespace, body: configMapB })

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
    let server: Server<typeof IncomingMessage, typeof ServerResponse>
    let wasRetried: boolean
    let reqCount: number
    let requestUrl: string | undefined
    let statusCodeHandler: () => number

    before(async () => {
      class TestKubeConfig extends KubeConfig {
        override getCurrentCluster() {
          return {
            name: "test-cluster",
            server: `http://${hostname}:${port}/clusters/test`,
            skipTLSVerify: true,
          }
        }
      }
      const config = new TestKubeConfig()
      api = new KubeApi(log, "test-context", config)

      server = createServer((req, res) => {
        requestUrl = req.url
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
    })

    beforeEach(() => {
      reqCount = 0
      wasRetried = false
      requestUrl = ""
      statusCodeHandler = () => {
        throw "implement in test case"
      }
    })

    after(() => {
      server.close()
    })

    it("should correctly merge the paths together when absolute paths are used", async () => {
      statusCodeHandler = () => 200
      await api.request({
        log,
        path: "version",
        opts: { method: "GET" },
      })

      expect(requestUrl).to.eql(`/clusters/test/version`)
    })

    it("should correctly merge the paths together when relative paths are used", async () => {
      statusCodeHandler = () => 200
      await api.request({
        log,
        path: "/version",
        opts: { method: "GET" },
      })

      expect(requestUrl).to.eql(`/clusters/test/version`)
    })

    it("should do a basic request without failure", async () => {
      statusCodeHandler = () => 200
      const res = await api.request({
        log,
        path: "",
        opts: { method: "POST", body: { bodyContent: "foo" } },
        retryOpts: { maxRetries: 0, minTimeoutMs: 0 },
      })
      expect(await res.json()).to.eql({ bodyContent: "foo" })
      expect(res.status).to.eql(200)
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
          expect(err).to.be.instanceOf(KubernetesError)
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
      expect(res.status).to.eql(200)
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
          opts: { method: "POST", body: { message: "ECONNRESET" } },
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
          opts: { method: "POST", body: { message: "unrelated error" } },
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
