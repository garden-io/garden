/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { V1Deployment } from "@kubernetes/client-node"
import { type V1Namespace } from "@kubernetes/client-node"
import { aecAgentCommand } from "../../../../../../src/plugins/kubernetes/commands/aec-agent.js"
import { expect } from "chai"
import { getDataDir, makeTestGarden } from "../../../../../helpers.js"
import type { KubernetesConfig } from "../../../../../../src/plugins/kubernetes/config.js"
import { KubeApi } from "../../../../../../src/plugins/kubernetes/api.js"
import type { Provider } from "../../../../../../src/config/provider.js"
import type { Garden } from "../../../../../../src/garden.js"
import { gardenAnnotationKey } from "../../../../../../src/util/annotations.js"
import pRetry from "p-retry"
import { randomString } from "../../../../../../src/util/string.js"
import type { PluginContext } from "../../../../../../src/plugin-context.js"
import { GardenCloudApi } from "../../../../../../src/cloud/api/api.js"
import type { ApiTrpcClient } from "../../../../../../src/cloud/api/trpc.js"

describe("aec-agent command", () => {
  const testNamespaceName = "aec-agent-" + randomString(10)

  const dummyDeployment: V1Deployment = {
    metadata: {
      name: "dummy-deployment",
      namespace: testNamespaceName,
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: {
          app: "dummy-deployment",
        },
      },
      template: {
        metadata: {
          labels: {
            app: "dummy-deployment",
          },
        },
        spec: {
          containers: [
            {
              name: "dummy-container",
              image: "busybox",
              command: ["sleep", "infinity"],
            },
          ],
        },
      },
    },
  }

  class MockCloudApi extends GardenCloudApi {
    override async getOrganization() {
      return {
        name: "foo",
        id: "baz",
        createdAt: new Date(),
        updatedAt: new Date(),
        plan: "team" as const,
        activeUsersCount: 1,
        usedSeatsCount: 1,
      }
    }

    override async getCurrentAccount() {
      return {
        id: "foo",
        name: "foo",
        email: "foo@example.com",
        createdAt: new Date(),
        updatedAt: new Date(),
        avatarUrl: "https://example.com/avatar.png",
        organizations: [
          {
            name: "foo",
            id: "baz",
            createdAt: new Date(),
            updatedAt: new Date(),
            role: "admin" as const,
            featureFlags: [],
          },
        ],
      }
    }
  }

  // Setting TTL to 0 will cause the command to exit after the first loop
  const args = ["--interval", "2000", "--ttl", "0", "--description", "integ test agent", "--health-check-port", "0"]

  let garden: Garden
  let ctx: PluginContext
  let provider: Provider<KubernetesConfig>
  let api: KubeApi

  before(async () => {
    const root = getDataDir("test-projects", "container")
    garden = await makeTestGarden(root)
    provider = (await garden.resolveProvider({
      log: garden.log,
      name: "local-kubernetes",
    })) as Provider<KubernetesConfig>
    ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
    api = await KubeApi.factory(garden.log, ctx, provider)

    garden.cloudApi = new MockCloudApi({
      log: garden.log,
      domain: "https://grow.example.com",
      authToken: "bar",
      organizationId: "baz",
      globalConfigStore: garden.globalConfigStore,
      __trpcClientOverrideForTesting: {} as ApiTrpcClient,
    })
  })

  async function waitForNamespaceToBeGone() {
    await pRetry(
      async () => {
        const namespaces = await api.core.listNamespace()
        if (namespaces.items.find((n) => n.metadata?.name === testNamespaceName)) {
          throw new Error("Namespace not deleted yet")
        }
      },
      { maxTimeout: 10000, minTimeout: 500 }
    )
  }

  async function cleanup() {
    try {
      await api.core.deleteNamespace({
        name: testNamespaceName,
      })
    } catch (e) {
      // Ignore
    }
  }

  beforeEach(async () => {
    await cleanup()
  })

  after(async () => {
    await cleanup()
    garden.close()
  })

  it("pauses workloads if AEC is enabled and a pause trigger is matched", async () => {
    await waitForNamespaceToBeGone()

    const namespace: V1Namespace = {
      metadata: {
        name: testNamespaceName,
        annotations: {
          "garden.io/aec-config": JSON.stringify({
            triggers: [
              {
                action: "pause",
                afterLastUpdate: { unit: "days", value: 1 },
              },
            ],
          }),
          "garden.io/last-deployed": new Date("2025-01-01").toISOString(),
        },
      },
    }

    await api.core.createNamespace({
      body: namespace,
    })

    // Create a dummy deployment in the namespace
    await api.apps.createNamespacedDeployment({
      body: dummyDeployment,
      namespace: testNamespaceName,
    })

    await aecAgentCommand.handler({
      log: garden.log,
      ctx,
      garden,
      args,
      graph: await garden.getConfigGraph({ log: garden.log, emit: false }),
    })

    const deployment = await api.apps.readNamespacedDeployment({
      name: "dummy-deployment",
      namespace: testNamespaceName,
    })

    const updatedNamespace = await api.core.readNamespace({
      name: testNamespaceName,
    })

    expect(deployment.spec?.replicas).to.equal(0)
    expect(updatedNamespace.status?.phase).to.equal("Active")
    expect(updatedNamespace.metadata?.annotations?.[gardenAnnotationKey("aec-status")]).to.equal("paused")
  })

  it("deletes namespace if AEC is enabled and a delete trigger is matched", async () => {
    await waitForNamespaceToBeGone()

    const namespace: V1Namespace = {
      metadata: {
        name: testNamespaceName,
        annotations: {
          "garden.io/aec-config": JSON.stringify({
            triggers: [
              {
                action: "cleanup",
                afterLastUpdate: { unit: "days", value: 1 },
              },
            ],
          }),
          "garden.io/last-deployed": new Date("2025-01-01").toISOString(),
        },
      },
    }

    await api.core.createNamespace({
      body: namespace,
    })

    await aecAgentCommand.handler({
      log: garden.log,
      ctx,
      garden,
      args,
      graph: await garden.getConfigGraph({ log: garden.log, emit: false }),
    })

    await waitForNamespaceToBeGone()
  })
})
