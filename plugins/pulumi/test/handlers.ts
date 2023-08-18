/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Log, PluginContext } from "@garden-io/sdk/types"
import { makeTestGarden, TestGarden } from "@garden-io/sdk/testing"
import execa from "execa"
import { pathExists } from "fs-extra"
import { join, resolve } from "path"
import { deployPulumi, getPulumiDeployStatus } from "../handlers"
import { PulumiProvider } from "../provider"
import { gardenPlugin as pulumiPlugin } from ".."
import { expect } from "chai"
import { getStackVersionTag } from "../helpers"
import { getPulumiCommands } from "../commands"
import { ResolvedConfigGraph } from "@garden-io/core/build/src/graph/config-graph"

const projectRoot = resolve(__dirname, "test-project-k8s")

const nsModuleRoot = join(projectRoot, "k8s-namespace")
const deploymentModuleRoot = join(projectRoot, "k8s-deployment")

// Here, pulumi needs node modules to be installed (to use the TS SDK in the pulumi program).
const ensureNodeModules = async () => {
  await Promise.all(
    [nsModuleRoot, deploymentModuleRoot].map(async (moduleRoot) => {
      if (await pathExists(join(moduleRoot, "node_modules"))) {
        return
      }
      await execa.command("yarn", { cwd: moduleRoot })
    })
  )
}

// TODO: Write + finish unit and integ tests

// Note: By default, this test suite assumes that PULUMI_ACCESS_TOKEN is present in the environment (which is the case
// in CI). To run this test suite with your own pulumi org, replace the `orgName` variable in
// `test-project-k8s/project.garden.yml` with your own org's name and make sure you've logged in via `pulumi login`.
describe("pulumi plugin handlers", () => {
  let garden: TestGarden
  let graph: ResolvedConfigGraph
  let ctx: PluginContext
  let log: Log
  let provider: PulumiProvider

  before(async () => {
    await ensureNodeModules()
    const plugin = pulumiPlugin()
    garden = await makeTestGarden(projectRoot, { plugins: [plugin] })
    log = garden.log
    provider = (await garden.resolveProvider(log, "pulumi")) as PulumiProvider
    ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
    graph = await garden.getResolvedConfigGraph({ log, emit: false })
  })

  after(async () => {
    const destroyCmd = getPulumiCommands().find((cmd) => cmd.name === "destroy")!
    // // We don't want to wait for the stacks to be deleted (since it takes a while)
    void destroyCmd.handler({ garden, ctx, args: [], graph, log })
  })

  describe("deployPulumiService", () => {
    it("deploys a pulumi stack and tags it with the service version", async () => {
      const action = graph.getDeploy("k8s-namespace")
      const actionLog = action.createLog(log)
      const status = await deployPulumi!({
        ctx,
        log: actionLog,
        action,
        force: false,
      })
      const versionTag = await getStackVersionTag({ log: actionLog, ctx, provider, action })
      expect(status.state).to.eql("ready")

      // The service outputs should include all pulumi stack outputs for the deployed stack.
      expect(status.outputs?.namespace).to.eql("pulumi-test")

      // The deployed stack should have been tagged with the service version
      expect(versionTag).to.eql(action.versionString())
    })
  })

  describe("getPulumiServiceStatus", () => {
    it("should return an 'outdated' state when the stack hasn't been deployed before", async () => {
      const action = graph.getDeploy("k8s-deployment")
      const status = await getPulumiDeployStatus!({
        ctx,
        log: action.createLog(log),
        action,
      })
      expect(status.state).to.eql("not-ready")
      expect(status.detail?.state).to.eql("outdated")
    })

    it("should return a 'ready' state when the stack has already been deployed", async () => {
      // We've previously deployed this service in the tests for deployPulumiService above.
      const action = graph.getDeploy("k8s-namespace")
      const status = await getPulumiDeployStatus!({
        ctx,
        log: action.createLog(log),
        action,
      })
      expect(status.state).to.eql("ready")
    })
  })
})
