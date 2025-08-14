/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Log, PluginContext } from "@garden-io/sdk/build/src/types.js"
import type { TestGarden } from "@garden-io/sdk/build/src/testing.js"
import { makeTestGarden } from "@garden-io/sdk/build/src/testing.js"
import { dirname, join, resolve } from "node:path"
import { deployPulumi, getPulumiDeployStatus } from "../src/handlers.js"
import type { PulumiProvider } from "../src/provider.js"
import { gardenPlugin as pulumiPlugin } from "../src/index.js"
import { expect } from "chai"
import { getStackVersionTag } from "../src/helpers.js"
import { getPulumiCommands } from "../src/commands.js"
import type { ResolvedConfigGraph } from "@garden-io/core/build/src/graph/config-graph.js"
import { fileURLToPath } from "node:url"
import { ensureNodeModules } from "./test-helpers.js"

const moduleDirName = dirname(fileURLToPath(import.meta.url))

// Careful here!
// We have some packages in the test directory but when this here runs we're a subfolder of '/build'
// so to actually find the files we need to traverse back to the source folder.
// TODO: Find a better way to do this.
const projectRoot = resolve(moduleDirName, "../../test/", "test-project-k8s")

const nsActionRoot = join(projectRoot, "k8s-namespace")
const deploymentActionRoot = join(projectRoot, "k8s-deployment")

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
    await ensureNodeModules([nsActionRoot, deploymentActionRoot])
    const plugin = pulumiPlugin()
    garden = await makeTestGarden(projectRoot, { plugins: [plugin] })
    log = garden.log
    provider = (await garden.resolveProvider({ log, name: "pulumi" })) as PulumiProvider
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
      // We do not inspect namespace name here, as we use generated unique values to avoid concurrency issues
      expect(status.state).to.eql("ready")

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
