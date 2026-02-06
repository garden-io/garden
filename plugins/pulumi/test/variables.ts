/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import type { Log, PluginContext } from "@garden-io/sdk/build/src/types.js"
import type { TestGarden } from "@garden-io/sdk/build/src/testing.js"
import { makeTestGarden } from "@garden-io/sdk/build/src/testing.js"
import { dirname, join, resolve } from "node:path"
import { deployPulumi } from "../src/handlers.js"
import type { PulumiProvider } from "../src/provider.js"
import { gardenPlugin as pulumiPlugin } from "../src/index.js"
import { expect } from "chai"
import { getPulumiCommands } from "../src/commands.js"
import type { ResolvedConfigGraph } from "@garden-io/core/build/src/graph/config-graph.js"
import { fileURLToPath } from "node:url"
import { ensureNodeModules } from "./test-helpers.js"
import { loadYamlFile } from "@garden-io/core/build/src/util/serialization.js"

const moduleDirName = dirname(fileURLToPath(import.meta.url))

// Careful here!
// We have some packages in the test directory but when this here runs we're a subfolder of '/build'
// so to actually find the files we need to traverse back to the source folder.
// TODO: Find a better way to do this.
const projectRoot = resolve(moduleDirName, "../../test/", "test-project-k8s")

const nsActionRoot = join(projectRoot, "k8s-namespace")
const nsNewActionRoot = join(projectRoot, "k8s-namespace-new")
const nsNewModuleRoot = join(projectRoot, "k8s-namespace-new-module")
const deploymentActionRoot = join(projectRoot, "k8s-deployment")

// Note: By default, this test suite assumes that PULUMI_ACCESS_TOKEN is present in the environment (which is the case
// in CI). To run this test suite with your own pulumi org, replace the `orgName` variable in
// `test-project-k8s/project.garden.yml` with your own org's name and make sure you've logged in via `pulumi login`.
describe("pulumi action variables and varfiles", () => {
  let garden: TestGarden
  let graph: ResolvedConfigGraph
  let ctx: PluginContext
  let log: Log
  let provider: PulumiProvider

  before(async () => {
    await ensureNodeModules([nsActionRoot, deploymentActionRoot, nsNewActionRoot, nsNewModuleRoot])
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

  describe("varfiles and variables merge correctly", () => {
    it("uses a varfile with the old schema and merges varfiles and action variables correctly", async () => {
      const action = graph.getDeploy("k8s-namespace")
      const actionLog = action.createLog(log)
      await deployPulumi!({
        ctx,
        log: actionLog,
        action,
        force: false,
      })
      const configFile = await loadYamlFile(join(nsActionRoot, "Pulumi.k8s-namespace-local.yaml"))
      expect(configFile.backend).to.eql({
        url: "https://api.pulumi.com",
      })
      expect(configFile.config).to.deep.include({
        "pulumi-k8s-test:orgName": "gordon-garden-bot",
        "pulumi-k8s-test:appName": "api-pulumi-variables-override",
        "pulumi-k8s-test:isMinikube": "true",
      })
    })

    for (const configType of ["action", "module"]) {
      context(`using ${configType} configs`, () => {
        it("uses a varfile with the new schema and merges varfiles and action variables correctly", async () => {
          const actionName = configType === "action" ? "k8s-namespace-new" : "k8s-namespace-new-module"
          const configRoot = configType === "action" ? nsNewActionRoot : nsNewModuleRoot
          const stackName = configType === "action" ? "k8s-namespace-new-local" : "k8s-namespace-new-module-local"
          const action = graph.getDeploy(actionName)
          const actionLog = action.createLog(log)
          await deployPulumi!({
            ctx,
            log: actionLog,
            action,
            force: false,
          })
          const configFile = await loadYamlFile(join(configRoot, `Pulumi.${stackName}.yaml`))
          expect(configFile.backend).to.eql({
            url: "https://api.pulumi.com",
          })
          expect(configFile.test).to.eql("foo")
          expect(configFile.config).to.deep.include({
            "pulumi-k8s-test:orgName": "gordon-garden-bot",
            "pulumi-k8s-test:appName": "app-name-from-pulumi-varfile",
            "pulumi-k8s-test:isMinikube": "true",
          })
        })
      })
    }
  })
})
