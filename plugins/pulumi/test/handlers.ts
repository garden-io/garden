/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { ConfigGraph, LogEntry, PluginContext } from "@garden-io/sdk/types"
import { makeTestGarden, TestGarden } from "@garden-io/sdk/testing"
import execa from "execa"
import { pathExists } from "fs-extra"
import { join, resolve } from "path"
import { deployPulumiService, getPulumiServiceStatus } from "../handlers"
import { PulumiProvider } from "../config"
import { gardenPlugin as pulumiPlugin } from ".."
import { emptyRuntimeContext } from "@garden-io/core/build/src/runtime-context"
import { expect } from "chai"
import { getStackVersionTag } from "../helpers"
import { getPulumiCommands } from "../commands"

const projectRoot = resolve(__dirname, "test-project-k8s")

const nsModuleRoot = join(projectRoot, "k8s-namespace")
const deploymentModuleRoot = join(projectRoot, "k8s-deployment")

// Here, pulumi needs node modules to be installed (to use the TS SDK in the pulumi program).
const ensureNodeModules = async () => {
  await Bluebird.map([nsModuleRoot, deploymentModuleRoot], async (moduleRoot) => {
    if (await pathExists(join(moduleRoot, "node_modules"))) {
      return
    }
    await execa.command("yarn", { cwd: moduleRoot })
  })
}

// TODO: Write + finish unit and integ tests

// Note: By default, this test suite assumes that PULUMI_ACCESS_TOKEN is present in the environment (which is the case
// in CI). To run this test suite with your own pulumi org, replace the `orgName` variable in
// `test-project-k8s/project.garden.yml` with your own org's name and make sure you've logged in via `pulumi login`.
describe.skip("pulumi plugin handlers", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let log: LogEntry
  let ctx: PluginContext
  let provider: PulumiProvider

  before(async () => {
    await ensureNodeModules()
    const plugin = pulumiPlugin()
    garden = await makeTestGarden(projectRoot, { plugins: [plugin] })
    log = garden.log
    provider = (await garden.resolveProvider(log, "pulumi")) as PulumiProvider
    ctx = await garden.getPluginContext(provider)
    graph = await garden.getConfigGraph({ log, emit: false })
  })

  after(async () => {
    const destroyCmd = getPulumiCommands().find((cmd) => cmd.name === "destroy")!
    // // We don't want to wait for the stacks to be deleted (since it takes a while)
    destroyCmd.handler({ garden, ctx, args: [], modules: [], log })
  })

  describe("deployPulumiService", () => {
    it("deploys a pulumi stack and tags it with the service version", async () => {
      const module = graph.getModule("k8s-namespace")
      const service = graph.getService("k8s-namespace")
      const status = await deployPulumiService({
        ctx,
        log,
        module,
        service,
        force: false,
        devMode: false,
        hotReload: false,
        localMode: false,
        runtimeContext: emptyRuntimeContext,
      })
      const versionTag = await getStackVersionTag({ log, ctx, provider, module })
      expect(status.state).to.eql("ready")

      // The service outputs should include all pulumi stack outputs for the deployed stack.
      expect(status.outputs?.namespace).to.eql("pulumi-test")

      // The deployed stack should have been tagged with the service version
      expect(versionTag).to.eql(service.version)
    })
  })

  describe("getPulumiServiceStatus", () => {
    it("should return an 'outdated' state when the stack hasn't been deployed before", async () => {
      const module = graph.getModule("k8s-deployment")
      const service = graph.getService("k8s-deployment")
      const status = await getPulumiServiceStatus({
        ctx,
        log,
        module,
        service,
        devMode: false,
        hotReload: false,
        localMode: false,
        runtimeContext: emptyRuntimeContext,
      })
      expect(status.state).to.eql("outdated")
    })

    it("should return a 'ready' state when the stack has already been deployed", async () => {
      // We've previously deployed this service in the tests for deployPulumiService above.
      const module = graph.getModule("k8s-namespace")
      const service = graph.getService("k8s-namespace")
      const status = await getPulumiServiceStatus({
        ctx,
        log,
        module,
        service,
        devMode: false,
        hotReload: false,
        localMode: false,
        runtimeContext: emptyRuntimeContext,
      })
      expect(status.state).to.eql("ready")
    })
  })
})
