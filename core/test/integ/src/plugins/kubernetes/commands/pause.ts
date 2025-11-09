/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"

import type { TestGarden } from "../../../../../helpers.js"
import { getDataDir, makeTestGarden, withDefaultGlobalOpts } from "../../../../../helpers.js"
import { helmDeploy } from "../../../../../../src/plugins/kubernetes/helm/deployment.js"
import type { KubernetesPluginContext, KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config.js"
import { getReleaseStatus } from "../../../../../../src/plugins/kubernetes/helm/status.js"
import { getReleaseName } from "../../../../../../src/plugins/kubernetes/helm/common.js"
import type { ConfigGraph } from "../../../../../../src/graph/config-graph.js"
import type { HelmDeployAction } from "../../../../../../src/plugins/kubernetes/helm/config.js"
import { createActionLog } from "../../../../../../src/logger/log-entry.js"
import { pauseCommand } from "../../../../../../src/plugins/kubernetes/commands/pause.js"
import { DeployCommand } from "../../../../../../src/commands/deploy.js"
import { defaultDeployOpts } from "../../../../../unit/src/commands/deploy.js"
import { GetStatusCommand } from "../../../../../../src/commands/get/get-status.js"
import { getHelmTestGarden, buildHelmModules } from "../helm/common.js"

const deployCommand = new DeployCommand()
const statusCommand = new GetStatusCommand()

describe("kubernetesPauseCommand", () => {
  let garden: TestGarden
  let provider: KubernetesProvider
  let ctx: KubernetesPluginContext
  let graph: ConfigGraph

  const init = async () => {
    provider = <KubernetesProvider>await garden.resolveProvider({ log: garden.log, name: "local-kubernetes" })
    ctx = <KubernetesPluginContext>(
      await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
    )
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
  }

  after(async () => {
    if (garden) {
      garden.close()
    }
  })

  describe("container", () => {
    before(async () => {
      garden = await makeTestGarden(getDataDir("test-projects", "container"), { noCache: true })
      await init()
    })

    it("pauses a container Deploy", async () => {
      await garden.runCommand({
        command: deployCommand,
        args: { names: ["simple-service"] },
        opts: defaultDeployOpts,
        throwOnError: true,
      })

      await pauseCommand.handler({
        ctx,
        log: garden.log,
        args: [],
        garden,
        graph,
      })

      const { result } = await garden.runCommand({
        command: statusCommand,
        args: ["simple-service"],
        opts: withDefaultGlobalOpts({}),
        throwOnError: true,
        validateOutputs: false,
      })

      const deployStatus = result.actions.Deploy["simple-service"]
      expect(deployStatus.detail.state).to.equal("outdated")

      const deployment = deployStatus.detail.detail.remoteResources.find((r) => r.kind === "Deployment")
      expect(deployment).to.exist
      expect(deployment!.spec.replicas).to.equal(0)
    })
  })

  describe("kubernetes", () => {
    before(async () => {
      garden = await makeTestGarden(getDataDir("test-projects", "kubernetes-type"), { noCache: true })
      await init()
    })

    it("pauses a kubernetes Deploy", async () => {
      await garden.runCommand({
        command: deployCommand,
        args: { names: ["deploy-action"] },
        opts: defaultDeployOpts,
        throwOnError: true,
      })

      await pauseCommand.handler({
        ctx,
        log: garden.log,
        args: [],
        garden,
        graph,
      })

      const { result } = await garden.runCommand({
        command: statusCommand,
        args: ["deploy-action"],
        opts: withDefaultGlobalOpts({}),
        throwOnError: true,
        validateOutputs: false,
      })

      const deployStatus = result.actions.Deploy["deploy-action"]
      expect(deployStatus.detail.state).to.equal("outdated")

      const deployment = deployStatus.detail.detail.remoteResources.find((r) => r.kind === "Deployment")
      expect(deployment).to.exist
      expect(deployment!.spec.replicas).to.equal(0)
    })

    it("filters deploys by name with additional arguments", async () => {
      await garden.runCommand({
        command: deployCommand,
        args: { names: ["action-simple", "deploy-action"] },
        opts: defaultDeployOpts,
        throwOnError: true,
      })

      await pauseCommand.handler({
        ctx,
        log: garden.log,
        args: ["deploy-action"],
        garden,
        graph,
      })

      const { result } = await garden.runCommand({
        command: statusCommand,
        args: ["action-simple", "deploy-action"],
        opts: withDefaultGlobalOpts({}),
        throwOnError: true,
        validateOutputs: false,
      })

      const statusA = result.actions.Deploy["action-simple"]
      expect(statusA.detail.state).to.equal("ready")
      const deploymentA = statusA.detail.detail.remoteResources.find((r) => r.kind === "Deployment")
      expect(deploymentA).to.exist
      expect(deploymentA!.spec.replicas).to.equal(1)

      const statusB = result.actions.Deploy["deploy-action"]
      expect(statusB.detail.state).to.equal("outdated")
      const deploymentB = statusB.detail.detail.remoteResources.find((r) => r.kind === "Deployment")
      expect(deploymentB).to.exist
      expect(deploymentB!.spec.replicas).to.equal(0)
    })
  })

  describe("helm", () => {
    before(async () => {
      garden = await getHelmTestGarden({ noCache: true })
      await init()
      await buildHelmModules(garden, graph)
    })

    after(async () => {
      // sometimes the release is already purged
      try {
        const actions = await garden.getActionRouter()
        await actions.deleteDeploys({ graph, log: garden.log })
        if (garden) {
          garden.close()
        }
      } catch {}
    })

    it("pauses a helm Deploy", async () => {
      const action = await garden.resolveAction<HelmDeployAction>({
        action: graph.getDeploy("api"),
        log: garden.log,
        graph,
      })
      const actionLog = createActionLog({
        log: garden.log,
        action,
      })

      await helmDeploy({
        ctx,
        log: actionLog,
        action,
        force: false,
      })

      const releaseName = getReleaseName(action)
      const releaseStatus = await getReleaseStatus({
        ctx,
        action,
        releaseName,
        log: garden.log,
      })

      expect(releaseStatus.state).to.equal("ready")

      await pauseCommand.handler({
        ctx,
        log: garden.log,
        args: ["api"],
        garden,
        graph,
      })

      const releaseStatusAfterScaleDown = await getReleaseStatus({
        ctx,
        action,
        releaseName,
        log: garden.log,
      })
      expect(releaseStatusAfterScaleDown.state).to.equal("outdated")

      const { result } = await garden.runCommand({
        command: statusCommand,
        args: ["api"],
        opts: withDefaultGlobalOpts({}),
        throwOnError: true,
      })

      const deployStatus = result.actions.Deploy["api"]
      expect(deployStatus.detail.state).to.equal("outdated")

      const deployment = deployStatus.detail.detail.remoteResources.find((r) => r.kind === "Deployment")
      expect(deployment).to.exist
      expect(deployment!.spec.replicas).to.equal(0)
    })
  })
})
