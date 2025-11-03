/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { KubeConfig, type V1Namespace } from "@kubernetes/client-node"
import { checkAndCleanupNamespace } from "../../../../../../src/plugins/kubernetes/commands/aec-agent.js"
import { getRootLogger } from "../../../../../../src/logger/logger.js"
import { KubeApi } from "../../../../../../src/plugins/kubernetes/api.js"
import { expect } from "chai"
import type { AecAgentInfo } from "../../../../../../src/config/aec.js"
import { EventBus } from "../../../../../../src/events/events.js"

describe("checkAndCleanupNamespace", () => {
  const log = getRootLogger().createLog()

  const kubeConfig = new KubeConfig()
  kubeConfig.addContext({
    name: "dummy",
    cluster: "dummy",
    user: "dummy",
  })
  kubeConfig.addCluster({
    name: "dummy",
    server: "https://example.com",
    skipTLSVerify: true,
  })
  kubeConfig.addUser({
    name: "dummy",
    token: "dummy",
  })
  kubeConfig.setCurrentContext("dummy")

  const api = new KubeApi(log, "dummy", kubeConfig)

  const aecAgentInfo: AecAgentInfo = {
    agentDescription: "dummy",
    environmentType: "dummy",
    pluginName: "dummy",
  }
  const projectId = "dummy"

  const events = new EventBus()

  it("returns an error if the AEC status annotation is invalid", async () => {
    const namespace: V1Namespace = {
      metadata: {
        name: "dummy",
        annotations: {
          "garden.io/aec-status": "foo",
          "garden.io/aec-config": JSON.stringify({
            triggers: [
              {
                action: "pause",
                timeAfterLastUpdate: { unit: "days", value: 1 },
              },
            ],
          }),
          "garden.io/last-deployed": new Date("2025-01-01").toISOString(),
        },
      },
    }

    const result = await checkAndCleanupNamespace({
      log,
      api,
      namespace,
      lastLoopStart: new Date(),
      currentTime: new Date(),
      dryRun: true,
      aecAgentInfo,
      events,
      projectId,
      environmentType: "dummy",
      environmentName: "dummy",
    })

    expect(result.error).to.be.true
    expect(result.status).to.contain("Invalid AEC status annotation")
  })

  it("returns an error if the AEC config is not valid JSON", async () => {
    const namespace: V1Namespace = {
      metadata: {
        name: "dummy",
        annotations: {
          "garden.io/aec-config": "['{",
        },
      },
    }

    const result = await checkAndCleanupNamespace({
      log,
      api,
      namespace,
      lastLoopStart: new Date(),
      currentTime: new Date(),
      dryRun: true,
      aecAgentInfo,
      events,
      projectId,
      environmentType: "dummy",
      environmentName: "dummy",
    })

    expect(result.error).to.be.true
    expect(result.status).to.contain("Invalid AEC config")
    expect(result.status).to.contain("Could not parse JSON")
  })

  it("returns an error if the AEC config is invalid", async () => {
    const namespace: V1Namespace = {
      metadata: {
        name: "dummy",
        annotations: {
          "garden.io/aec-config": "{}",
        },
      },
    }

    const result = await checkAndCleanupNamespace({
      log,
      api,
      namespace,
      lastLoopStart: new Date(),
      currentTime: new Date(),
      dryRun: true,
      aecAgentInfo,
      events,
      projectId,
      environmentType: "dummy",
      environmentName: "dummy",
    })

    expect(result.error).to.be.true
    expect(result.status).to.contain("Invalid AEC config")
  })

  it("returns an error if the last deployed annotation is invalid", async () => {
    const namespace: V1Namespace = {
      metadata: {
        name: "dummy",
        annotations: {
          "garden.io/aec-config": JSON.stringify({
            triggers: [
              {
                action: "pause",
                timeAfterLastUpdate: { unit: "days", value: 1 },
              },
            ],
          }),
          "garden.io/last-deployed": "foo",
        },
      },
    }

    const result = await checkAndCleanupNamespace({
      log,
      api,
      namespace,
      lastLoopStart: new Date(),
      currentTime: new Date(),
      dryRun: true,
      aecAgentInfo,
      events,
      projectId,
      environmentType: "dummy",
      environmentName: "dummy",
    })

    expect(result.error).to.be.true
    expect(result.status).to.contain("Invalid last-deployed annotation")
  })

  it("returns an error if AEC force triggered but AEC is not configured", async () => {
    const namespace: V1Namespace = {
      metadata: {
        name: "dummy",
        annotations: {
          "garden.io/aec-force": "true",
        },
      },
    }

    const result = await checkAndCleanupNamespace({
      log,
      api,
      namespace,
      lastLoopStart: new Date(),
      currentTime: new Date(),
      dryRun: true,
      aecAgentInfo,
      events,
      projectId,
      environmentType: "dummy",
      environmentName: "dummy",
    })

    expect(result.error).to.be.true
    expect(result.status).to.contain("AEC force triggered but AEC not configured")
  })

  it("returns an error if AEC enabled but no triggers configured", async () => {
    const namespace: V1Namespace = {
      metadata: {
        name: "dummy",
        annotations: {
          "garden.io/aec-config": JSON.stringify({
            triggers: [],
          }),
          "garden.io/last-deployed": new Date("2025-01-01").toISOString(),
        },
      },
    }

    const result = await checkAndCleanupNamespace({
      log,
      api,
      namespace,
      lastLoopStart: new Date(),
      currentTime: new Date(),
      dryRun: true,
      aecAgentInfo,
      events,
      projectId,
      environmentType: "dummy",
      environmentName: "dummy",
    })

    expect(result.error).to.be.true
    expect(result.status).to.contain("AEC enabled but no triggers configured")
  })

  it("returns with no action if AEC is not configured", async () => {
    const namespace: V1Namespace = {
      metadata: {
        name: "dummy",
        annotations: {},
      },
    }

    const result = await checkAndCleanupNamespace({
      log,
      api,
      namespace,
      lastLoopStart: new Date(),
      currentTime: new Date(),
      dryRun: true,
      aecAgentInfo,
      events,
      projectId,
      environmentType: "dummy",
      environmentName: "dummy",
    })

    expect(result.error).to.be.undefined
    expect(result.status).to.contain("AEC not configured")
  })

  it("returns with no action if AEC is disabled", async () => {
    const namespace: V1Namespace = {
      metadata: {
        name: "dummy",
        annotations: {
          "garden.io/aec-config": JSON.stringify({
            disabled: true,
            triggers: [],
          }),
        },
      },
    }

    const result = await checkAndCleanupNamespace({
      log,
      api,
      namespace,
      lastLoopStart: new Date(),
      currentTime: new Date(),
      dryRun: true,
      aecAgentInfo,
      events,
      projectId,
      environmentType: "dummy",
      environmentName: "dummy",
    })

    expect(result.error).to.be.undefined
    expect(result.status).to.contain("AEC configured but disabled")
  })

  it("returns with no action if no last-deployed annotation", async () => {
    const namespace: V1Namespace = {
      metadata: {
        name: "dummy",
        annotations: {
          "garden.io/aec-config": JSON.stringify({
            triggers: [
              {
                action: "pause",
                timeAfterLastUpdate: { unit: "days", value: 1 },
              },
            ],
          }),
        },
      },
    }

    const result = await checkAndCleanupNamespace({
      log,
      api,
      namespace,
      lastLoopStart: new Date(),
      currentTime: new Date(),
      dryRun: true,
      aecAgentInfo,
      events,
      projectId,
      environmentType: "dummy",
      environmentName: "dummy",
    })

    expect(result.error).to.be.undefined
    expect(result.status).to.contain("No last-deployed annotation")
  })

  it("returns with no action if cleanup already in progress", async () => {
    const namespace: V1Namespace = {
      metadata: {
        name: "dummy",
        annotations: {
          "garden.io/aec-config": JSON.stringify({
            triggers: [
              {
                action: "pause",
                timeAfterLastUpdate: { unit: "days", value: 1 },
              },
            ],
          }),
          "garden.io/aec-in-progress": new Date("2025-01-01").toISOString(),
          "garden.io/last-deployed": new Date("2025-01-01").toISOString(),
        },
      },
    }

    const result = await checkAndCleanupNamespace({
      log,
      api,
      namespace,
      lastLoopStart: new Date(),
      currentTime: new Date(),
      dryRun: true,
      aecAgentInfo,
      events,
      projectId,
      environmentType: "dummy",
      environmentName: "dummy",
    })

    expect(result.error).to.be.undefined
    expect(result.inProgress).to.be.true
  })

  it("pauses workloads if AEC is enabled and a pause trigger is matched", async () => {
    const namespace: V1Namespace = {
      metadata: {
        name: "dummy",
        annotations: {
          "garden.io/aec-config": JSON.stringify({
            triggers: [
              {
                action: "pause",
                timeAfterLastUpdate: { unit: "days", value: 1 },
              },
            ],
          }),
          "garden.io/last-deployed": new Date("2025-01-01").toISOString(),
        },
      },
    }

    const result = await checkAndCleanupNamespace({
      log,
      api,
      namespace,
      lastLoopStart: new Date(),
      currentTime: new Date(),
      dryRun: true,
      aecAgentInfo,
      events,
      projectId,
      environmentType: "dummy",
      environmentName: "dummy",
    })

    expect(result.error).to.be.undefined
    expect(result.aecStatus).to.equal("paused")
    expect(result.actionTriggered).to.equal("pause")
    expect(result.status).to.contain("Workloads paused")
  })

  it("deletes workloads if AEC is enabled and a delete trigger is matched", async () => {
    const namespace: V1Namespace = {
      metadata: {
        name: "dummy",
        annotations: {
          "garden.io/aec-config": JSON.stringify({
            triggers: [
              {
                action: "cleanup",
                timeAfterLastUpdate: { unit: "days", value: 1 },
              },
            ],
          }),
          "garden.io/last-deployed": new Date("2025-01-01").toISOString(),
        },
      },
    }

    const result = await checkAndCleanupNamespace({
      log,
      api,
      namespace,
      lastLoopStart: new Date(),
      currentTime: new Date(),
      dryRun: true,
      aecAgentInfo,
      events,
      projectId,
      environmentType: "dummy",
      environmentName: "dummy",
    })

    expect(result.error).to.be.undefined
    expect(result.aecStatus).to.equal("cleaned-up")
    expect(result.actionTriggered).to.equal("cleanup")
    expect(result.status).to.contain("Namespace deleted")
  })
})
