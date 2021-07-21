/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Garden } from "../../../../../src/garden"
import { Provider } from "../../../../../src/config/provider"
import { KubernetesConfig } from "../../../../../src/plugins/kubernetes/config"
import { KubeApi } from "../../../../../src/plugins/kubernetes/api"
import { getDataDir, makeTestGarden } from "../../../../helpers"
import { getAppNamespace } from "../../../../../src/plugins/kubernetes/namespace"
import { randomString, dedent, gardenAnnotationKey } from "../../../../../src/util/string"
import { V1ConfigMap } from "@kubernetes/client-node"
import { KubernetesResource, KubernetesPod } from "../../../../../src/plugins/kubernetes/types"
import { expect } from "chai"
import { waitForResources } from "../../../../../src/plugins/kubernetes/status/status"
import { PluginContext } from "../../../../../src/plugin-context"
import { StringCollector } from "../../../../../src/util/util"
import { KUBECTL_DEFAULT_TIMEOUT } from "../../../../../src/plugins/kubernetes/kubectl"

describe("KubeApi", () => {
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
    ctx = await garden.getPluginContext(provider)
    api = await KubeApi.factory(garden.log, ctx, provider)
    namespace = await getAppNamespace(ctx, garden.log, provider)
  })

  after(async () => {
    await garden.close()
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
    it("should exec a command in a Pod and return the output", async () => {
      const pod = makePod(["/bin/sh", "-c", "sleep 600"])
      const podName = pod.metadata.name

      await api.createPod(namespace, pod)
      await waitForResources({
        namespace,
        ctx,
        provider,
        serviceName: "exec-test",
        resources: [pod],
        log: garden.log,
        timeoutSec: KUBECTL_DEFAULT_TIMEOUT,
      })

      try {
        const res = await api.execInPod({
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
        await api.core.deleteNamespacedPod(podName, namespace)
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
        serviceName: "exec-test",
        resources: [pod],
        log: garden.log,
        timeoutSec: KUBECTL_DEFAULT_TIMEOUT,
      })

      try {
        const res = await api.execInPod({
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
        await api.core.deleteNamespacedPod(podName, namespace)
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
        serviceName: "exec-test",
        resources: [pod],
        log: garden.log,
        timeoutSec: KUBECTL_DEFAULT_TIMEOUT,
      })

      try {
        const res = await api.execInPod({
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
        await api.core.deleteNamespacedPod(podName, namespace)
      }
    })
  })

  describe("attachToPod", () => {
    it("should attach to a running Pod and stream the output", async () => {
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
      const podName = pod.metadata.name

      await api.createPod(namespace, pod)
      await waitForResources({
        namespace,
        ctx,
        provider,
        serviceName: "exec-test",
        resources: [pod],
        log: garden.log,
        timeoutSec: KUBECTL_DEFAULT_TIMEOUT,
      })

      const stdout = new StringCollector()

      try {
        const ws = await api.attachToPod({
          namespace,
          podName,
          containerName,
          stdout,
          tty: false,
        })

        await new Promise<void>((resolve, reject) => {
          ws.onerror = ({ error }) => {
            reject(error)
          }

          ws.onclose = () => {
            resolve()
          }
        })

        const output = stdout.getString()
        expect(output).to.include("Log line")
      } finally {
        await api.core.deleteNamespacedPod(podName, namespace)
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
