/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import type { Log } from "../../../../../src/logger/log-entry.js"
import type { KubernetesPluginContext, KubernetesProvider } from "../../../../../src/plugins/kubernetes/config.js"
import { traefikIngressControllerReady } from "../../../../../src/plugins/kubernetes/traefik/ingress-controller.js"
import { HELM_TRAEFIK_RELEASE_NAME } from "../../../../../src/plugins/kubernetes/traefik/traefik-helm.js"
import { uninstallGardenServices } from "../../../../../src/plugins/kubernetes/commands/uninstall-garden-services.js"
import { migrateIngressController } from "../../../../../src/plugins/kubernetes/commands/migrate-ingress-controller.js"
import { prepareEnvironment } from "../../../../../src/plugins/kubernetes/init.js"
import type { PrepareEnvironmentParams } from "../../../../../src/plugin/handlers/Provider/prepareEnvironment.js"
import type { Garden } from "../../../../../src/garden.js"
import { getEmptyGardenWithLocalK8sProvider } from "../../../helpers.js"
import type { ConfigGraph } from "../../../../../src/graph/config-graph.js"
import { KubeApi } from "../../../../../src/plugins/kubernetes/api.js"
import { helm } from "../../../../../src/plugins/kubernetes/helm/helm-cli.js"
import { getAppNamespace } from "../../../../../src/plugins/kubernetes/namespace.js"
import { kubectl } from "../../../../../src/plugins/kubernetes/kubectl.js"
import { sleep } from "../../../../../src/util/util.js"

describe("Traefik ingress controller", function () {
  // eslint-disable-next-line no-invalid-this
  this.timeout(600_000) // 10 min — Helm --wait can take up to 5 min on slow CI image pulls

  let garden: Garden
  let graph: ConfigGraph
  let ctx: KubernetesPluginContext
  let provider: KubernetesProvider
  let log: Log

  before(async () => {
    garden = await getEmptyGardenWithLocalK8sProvider()
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    await init()

    // Ensure no stale nginx controller from a previous test suite holds hostPorts 80/443.
    // The nginx ingress-controller tests run alphabetically before this suite and may leave
    // nginx pods in Terminating state that still bind hostPorts on kind/microk8s.
    ctx.provider.config.setupIngressController = "nginx"
    await uninstallGardenServices.handler({ garden, ctx, log: garden.log, args: [], graph })
    await waitForNoPodsInNamespace(ctx, garden.log, ctx.provider.config.gardenSystemNamespace)
  })

  after(() => {
    garden && garden.close()
  })

  beforeEach(async () => {
    await init()
  })

  afterEach(async () => {
    await cleanup()
  })

  const cleanup = async () => {
    ctx.provider.config.setupIngressController = "traefik"
    await uninstallGardenServices.handler({
      garden,
      ctx,
      log: garden.log,
      args: [],
      graph,
    })
  }

  const init = async () => {
    provider = <KubernetesProvider>await garden.resolveProvider({ log: garden.log, name: "local-kubernetes" })
    ctx = <KubernetesPluginContext>(
      await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
    )
    log = garden.log
  }

  it("should install Traefik during environment preparation when setupIngressController is 'traefik'", async () => {
    const params: PrepareEnvironmentParams = {
      ctx,
      log: garden.log,
      force: false,
    }
    ctx.provider.config.setupIngressController = "traefik"
    await prepareEnvironment(params)
    const isReady = await traefikIngressControllerReady(ctx, log)
    expect(isReady).to.eql(true)
  })

  it("should not install Traefik during environment preparation when setupIngressController is 'null'", async () => {
    const params: PrepareEnvironmentParams = {
      ctx,
      log: garden.log,
      force: false,
    }
    ctx.provider.config.setupIngressController = "null"
    await prepareEnvironment(params)

    const isReady = await traefikIngressControllerReady(ctx, log)
    expect(isReady).to.eql(false)
  })

  it("should remove Traefik when using uninstall-garden-services command", async () => {
    const params: PrepareEnvironmentParams = {
      ctx,
      log: garden.log,
      force: false,
    }
    ctx.provider.config.setupIngressController = "traefik"
    await prepareEnvironment(params)

    const isReadyAfterInstall = await traefikIngressControllerReady(ctx, log)
    expect(isReadyAfterInstall).to.eql(true)

    await cleanup()

    const isReadyAfterUninstall = await traefikIngressControllerReady(ctx, log)
    expect(isReadyAfterUninstall).to.eql(false)
  })

  it("should create a Traefik IngressClass that is the default class", async () => {
    const params: PrepareEnvironmentParams = {
      ctx,
      log: garden.log,
      force: false,
    }
    ctx.provider.config.setupIngressController = "traefik"
    await prepareEnvironment(params)

    const api = await KubeApi.factory(log, ctx, provider)
    const ingressClasses = await api.listResources({
      log,
      apiVersion: "networking.k8s.io/v1",
      kind: "IngressClass",
      namespace: "all",
    })

    const traefikClass = ingressClasses.items.find((ic: any) => ic.metadata?.name === "traefik")
    expect(traefikClass).to.not.be.undefined
    expect(traefikClass?.metadata?.annotations?.["ingressclass.kubernetes.io/is-default-class"]).to.eql("true")
  })

  it("should skip installation if Traefik is already ready", async () => {
    ctx.provider.config.setupIngressController = "traefik"

    // First install
    await prepareEnvironment({ ctx, log: garden.log, force: false })
    const isReady = await traefikIngressControllerReady(ctx, log)
    expect(isReady).to.eql(true)

    // Get the Helm revision after first install
    const namespace = provider.config.gardenSystemNamespace
    const statusBefore = JSON.parse(
      await helm({
        ctx,
        log,
        namespace,
        args: ["status", HELM_TRAEFIK_RELEASE_NAME, "--output", "json"],
        emitLogEvents: false,
      })
    )
    const revisionBefore = statusBefore.version

    // Second prepareEnvironment should skip (no upgrade)
    await prepareEnvironment({ ctx, log: garden.log, force: false })

    const statusAfter = JSON.parse(
      await helm({
        ctx,
        log,
        namespace,
        args: ["status", HELM_TRAEFIK_RELEASE_NAME, "--output", "json"],
        emitLogEvents: false,
      })
    )
    const revisionAfter = statusAfter.version

    // Helm revision should not have changed since Traefik was already ready
    expect(revisionAfter).to.eql(revisionBefore)
  })

  it("should install Traefik and uninstall nginx via the migrate-ingress-controller command", async () => {
    // First, install nginx
    ctx.provider.config.setupIngressController = "nginx"
    await prepareEnvironment({ ctx, log: garden.log, force: false })

    // Now run migration
    ctx.provider.config.setupIngressController = "traefik"
    await migrateIngressController.handler({
      garden,
      ctx,
      log: garden.log,
      args: [],
      graph,
    })

    const isReady = await traefikIngressControllerReady(ctx, log)
    expect(isReady).to.eql(true)
  })

  // End-to-end test: verify that Traefik actually routes HTTP traffic to a backend pod
  // through a standard Kubernetes Ingress resource.
  it("should route traffic through an Ingress to a backend pod", async () => {
    ctx.provider.config.setupIngressController = "traefik"
    await prepareEnvironment({ ctx, log: garden.log, force: false })

    const api = await KubeApi.factory(log, ctx, provider)
    const namespace = await getAppNamespace(ctx, log, provider)
    const systemNamespace = provider.config.gardenSystemNamespace
    const testHost = "traefik-integ-test.local"

    // Create a minimal busybox pod that serves "traefik-ok" over HTTP
    const pod = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name: "traefik-test-backend",
        namespace,
        labels: { app: "traefik-test-backend" },
      },
      spec: {
        containers: [
          {
            name: "httpd",
            image: "busybox:1.36",
            command: ["sh", "-c", "echo traefik-ok > /tmp/index.html && httpd -f -p 80 -h /tmp"],
            ports: [{ containerPort: 80 }],
          },
        ],
      },
    }

    const service = {
      apiVersion: "v1",
      kind: "Service",
      metadata: {
        name: "traefik-test-backend",
        namespace,
      },
      spec: {
        selector: { app: "traefik-test-backend" },
        ports: [{ port: 80, targetPort: 80, protocol: "TCP" }],
        type: "ClusterIP",
      },
    }

    const ingress = {
      apiVersion: "networking.k8s.io/v1",
      kind: "Ingress",
      metadata: {
        name: "traefik-test-ingress",
        namespace,
      },
      spec: {
        ingressClassName: "traefik",
        rules: [
          {
            host: testHost,
            http: {
              paths: [
                {
                  path: "/",
                  pathType: "Prefix",
                  backend: {
                    service: {
                      name: "traefik-test-backend",
                      port: { number: 80 },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    }

    try {
      // Create test resources
      await api.core.createNamespacedPod({ namespace, body: pod as any })
      await api.core.createNamespacedService({ namespace, body: service as any })
      await api.networking.createNamespacedIngress({ namespace, body: ingress as any })

      // Wait for the pod to be Running (poll up to 60s)
      const deadline = Date.now() + 60_000
      while (Date.now() < deadline) {
        const podStatus = await api.core.readNamespacedPod({ name: "traefik-test-backend", namespace })
        if (podStatus.status?.phase === "Running") {
          break
        }
        await sleep(1000)
      }

      // Give Traefik a moment to pick up the new Ingress resource
      await sleep(3000)

      // Use a one-shot pod to wget through Traefik's cluster-internal service.
      // This verifies that Traefik reads the Ingress, matches the Host header, and routes to the backend.
      const result = await kubectl(ctx, provider).exec({
        log,
        namespace,
        args: [
          "run",
          "traefik-test-client",
          "--rm",
          "-i",
          "--restart=Never",
          "--image=busybox:1.36",
          "--",
          "wget",
          "-qO-",
          "-T",
          "10",
          `--header=Host: ${testHost}`,
          `http://${HELM_TRAEFIK_RELEASE_NAME}.${systemNamespace}.svc.cluster.local/`,
        ],
      })

      expect(result.stdout).to.contain("traefik-ok")
    } finally {
      // Clean up test resources (ignore errors if they don't exist)
      await api.deleteBySpec({ namespace, manifest: ingress as any, log }).catch(() => {})
      await api.deleteBySpec({ namespace, manifest: service as any, log }).catch(() => {})
      await api.deleteBySpec({ namespace, manifest: pod as any, log }).catch(() => {})
    }
  })
})

/**
 * Wait until no pods remain in the given namespace (including Terminating pods).
 * This is needed to ensure hostPorts are released before installing a new ingress controller.
 */
async function waitForNoPodsInNamespace(ctx: KubernetesPluginContext, log: Log, namespace: string) {
  const api = await KubeApi.factory(log, ctx, ctx.provider)
  const startTime = Date.now()
  const timeoutMs = 60_000

  while (Date.now() - startTime < timeoutMs) {
    const pods = await api.core.listNamespacedPod({ namespace })
    if (pods.items.length === 0) {
      return
    }
    log.debug(`Waiting for ${pods.items.length} pod(s) in ${namespace} to terminate...`)
    await sleep(2000)
  }
}
