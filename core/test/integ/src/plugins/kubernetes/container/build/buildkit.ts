/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { getContainerTestGarden } from "../container"
import {
  ClusterBuildkitCacheConfig,
  KubernetesPluginContext,
  KubernetesProvider,
} from "../../../../../../../src/plugins/kubernetes/config"
import { Garden } from "../../../../../../../src"
import { PluginContext } from "../../../../../../../src/plugin-context"
import {
  buildkitBuildHandler,
  ensureBuildkit,
} from "../../../../../../../src/plugins/kubernetes/container/build/buildkit"
import { KubeApi } from "../../../../../../../src/plugins/kubernetes/api"
import { getNamespaceStatus } from "../../../../../../../src/plugins/kubernetes/namespace"
import { expect } from "chai"
import { cloneDeep } from "lodash"
import { buildDockerAuthConfig } from "../../../../../../../src/plugins/kubernetes/init"
import { buildkitDeploymentName, dockerAuthSecretKey } from "../../../../../../../src/plugins/kubernetes/constants"
import { grouped } from "../../../../../../helpers"
import { createActionLog } from "../../../../../../../src/logger/log-entry"
import { resolveAction } from "../../../../../../../src/graph/actions"
import { NamespaceStatus } from "../../../../../../../src/types/namespace"

describe("ensureBuildkit", () => {
  let garden: Garden
  let cleanup: (() => void) | undefined
  let provider: KubernetesProvider
  let ctx: PluginContext
  let api: KubeApi
  let namespace: string

  const defaultConfig: ClusterBuildkitCacheConfig[] = [
    {
      type: "registry",
      mode: "auto",
      tag: "_buildcache",
      export: true,
    },
  ]

  before(async () => {
    ;({ garden, cleanup } = await getContainerTestGarden("cluster-buildkit"))
  })

  after(async () => {
    if (cleanup) {
      cleanup()
    }
  })

  beforeEach(async () => {
    provider = <KubernetesProvider>await garden.resolveProvider(garden.log, "local-kubernetes")
    ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
    api = await KubeApi.factory(garden.log, ctx, provider)
    namespace = (
      await getNamespaceStatus({
        log: garden.log,
        ctx: ctx as KubernetesPluginContext,
        provider,
      })
    ).namespaceName
  })

  grouped("cluster-buildkit", "remote-only").context("cluster-buildkit mode", () => {
    it("deploys buildkit if it isn't already in the namespace", async () => {
      try {
        await api.apps.deleteNamespacedDeployment(buildkitDeploymentName, namespace)
      } catch {}

      const { updated } = await ensureBuildkit({
        ctx,
        provider,
        log: garden.log,
        api,
        namespace,
      })

      // Make sure deployment is there
      const deployment = await api.apps.readNamespacedDeployment(buildkitDeploymentName, namespace)

      expect(updated).to.be.true
      expect(deployment.spec.template.spec?.tolerations).to.eql([
        {
          key: "garden-build",
          operator: "Equal",
          value: "true",
          effect: "NoSchedule",
          tolerationSeconds: undefined,
        },
      ])
    })

    it.skip("builds a Docker image and emits a namespace status event", async () => {
      const log = garden.log
      const graph = await garden.getConfigGraph({ log, emit: false })
      const action = graph.getBuild("simple-service")
      const actionLog = createActionLog({ log, actionName: action.name, actionKind: action.kind })
      const resolved = await resolveAction({ garden, graph, action, log })

      // Here, we're not going through a router, so we listen for the `namespaceStatus` event directly.
      let namespaceStatus: NamespaceStatus | null = null
      ctx.events.once("namespaceStatus", (status) => (namespaceStatus = status))
      await buildkitBuildHandler({
        ctx,
        log: actionLog,
        action: resolved,
      })
      expect(namespaceStatus).to.exist
      expect(namespaceStatus!.namespaceName).to.eql("container-test-default")
    })

    it("deploys buildkit with the configured nodeSelector", async () => {
      try {
        await api.apps.deleteNamespacedDeployment(buildkitDeploymentName, namespace)
      } catch {}

      const nodeSelector = { "kubernetes.io/os": "linux" }

      provider.config.clusterBuildkit = { nodeSelector, cache: defaultConfig }

      await ensureBuildkit({
        ctx,
        provider,
        log: garden.log,
        api,
        namespace,
      })

      const deployment = await api.apps.readNamespacedDeployment(buildkitDeploymentName, namespace)

      expect(deployment.spec.template.spec?.nodeSelector).to.eql(nodeSelector)
    })

    it("creates a docker auth secret from configured imagePullSecrets", async () => {
      const { authSecret } = await ensureBuildkit({
        ctx,
        provider,
        log: garden.log,
        api,
        namespace,
      })
      await api.core.readNamespacedSecret(authSecret.metadata.name, namespace)
    })

    it("creates an empty docker auth secret if there are no imagePullSecrets", async () => {
      const _provider = cloneDeep(provider)
      _provider.config.imagePullSecrets = []

      const { authSecret } = await ensureBuildkit({
        ctx,
        provider: _provider,
        log: garden.log,
        api,
        namespace,
      })

      const secret = await api.core.readNamespacedSecret(authSecret.metadata.name, namespace)
      const expectedConfig = await buildDockerAuthConfig([], api)

      const decoded = JSON.parse(Buffer.from(secret.data![dockerAuthSecretKey], "base64").toString())
      expect(decoded).to.eql(expectedConfig)
    })

    it("returns false if buildkit is already deployed", async () => {
      await ensureBuildkit({
        ctx,
        provider,
        log: garden.log,
        api,
        namespace,
      })
      const { updated } = await ensureBuildkit({
        ctx,
        provider,
        log: garden.log,
        api,
        namespace,
      })
      expect(updated).to.be.false
    })

    it("returns false if buildkit is already deployed with annotations", async () => {
      provider.config.clusterBuildkit = {
        cache: [],
        annotations: {
          testAnnotation: "is-there",
        },
      }
      await ensureBuildkit({
        ctx,
        provider,
        log: garden.log,
        api,
        namespace,
      })
      const { updated } = await ensureBuildkit({
        ctx,
        provider,
        log: garden.log,
        api,
        namespace,
      })
      expect(updated).to.be.false
    })
  })

  grouped("cluster-buildkit-rootless", "remote-only").context("cluster-buildkit-rootless mode", () => {
    it("deploys in rootless mode", async () => {
      try {
        await api.apps.deleteNamespacedDeployment(buildkitDeploymentName, namespace)
      } catch {}

      provider.config.clusterBuildkit = { rootless: true, cache: defaultConfig }

      await ensureBuildkit({
        ctx,
        provider,
        log: garden.log,
        api,
        namespace,
      })

      const deployment = await api.apps.readNamespacedDeployment(buildkitDeploymentName, namespace)

      expect(deployment.spec.template.spec?.containers[0].securityContext?.runAsUser).to.equal(1000)
    })

    it("deploys again if switching from normal to rootless mode", async () => {
      await ensureBuildkit({
        ctx,
        provider,
        log: garden.log,
        api,
        namespace,
      })

      provider.config.clusterBuildkit = { rootless: true, cache: defaultConfig }

      const { updated } = await ensureBuildkit({
        ctx,
        provider,
        log: garden.log,
        api,
        namespace,
      })
      expect(updated).to.be.true
    })
  })
})
