/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dirname, join, resolve } from "path"
import { fileURLToPath } from "node:url"
import fsExtra from "fs-extra"
import type { ResolvedConfigGraph } from "@garden-io/core/build/src/graph/config-graph.js"
import type { PluginContext } from "@garden-io/core/build/src/plugin-context.js"
import { makeTestGarden, type TestGarden } from "@garden-io/sdk/build/src/testing.js"
import type { Log } from "@garden-io/sdk/build/src/types.js"
import type { PulumiProvider } from "../src/provider.js"
import { gardenPlugin as pulumiPlugin } from "../src/index.js"
import { ensureNodeModules } from "./test-helpers.js"
import { getPulumiCommands } from "../src/commands.js"
import { expect } from "chai"

const moduleDirName = dirname(fileURLToPath(import.meta.url))

// Careful here!
// We have some packages in the test directory but when this here runs we're a subfolder of '/build'
// so to actually find the files we need to traverse back to the source folder.
// TODO: Find a better way to do this.
const projectRoot = resolve(moduleDirName, "../../test/", "test-project-local-script")

const deployARoot = join(projectRoot, "deploy-a")
const deployBRoot = join(projectRoot, "deploy-b")

// Looking for log entries indicating that these exec actions had run proved to be flaky, so we're using the
// more robust method of touching a file in the source dir to indicate that the action was run.
const buildAFile = join(deployARoot, "build-a.txt")
const runAFile = join(deployARoot, "run-a.txt")

const buildBFile = join(deployBRoot, "build-b.txt")
const runBFile = join(deployBRoot, "run-b.txt")

async function clearGeneratedFiles() {
  await Promise.all(
    [buildAFile, runAFile, buildBFile, runBFile].map(async (path) => {
      try {
        await fsExtra.remove(path)
      } catch (err) {
        // This file may not exist, we're just cleaning up in case of repeated test runs.
      }
    })
  )
}

describe("pulumi plugin commands", () => {
  let garden: TestGarden
  let graph: ResolvedConfigGraph
  let ctx: PluginContext
  let log: Log
  let provider: PulumiProvider

  before(async () => {
    await ensureNodeModules([deployARoot, deployBRoot])
    const plugin = pulumiPlugin()
    garden = await makeTestGarden(projectRoot, { plugins: [plugin] })
    log = garden.log
    provider = (await garden.resolveProvider({ log, name: "pulumi" })) as PulumiProvider
    ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
    graph = await garden.getResolvedConfigGraph({ log, emit: false })
    await clearGeneratedFiles()
  })

  after(async () => {
    await clearGeneratedFiles()
  })

  // Note: Since the stacks in this test project don't have any side-effects, we don't need an after-cleanup step here.

  describe("preview command", () => {
    it("executes Build dependencies, but not Run dependencies", async () => {
      const previewCmd = getPulumiCommands().find((cmd) => cmd.name === "preview")!
      await previewCmd.handler({ garden, ctx, args: [], graph, log })
      expect(await fsExtra.pathExists(buildAFile), "build-a.txt should exist").to.eql(true)
      expect(await fsExtra.pathExists(buildBFile), "build-b.txt should exist").to.eql(true)
      expect(await fsExtra.pathExists(runAFile), "run-a.txt should not exist").to.eql(false)
      expect(await fsExtra.pathExists(runBFile), "run-b.txt should not exist").to.eql(false)
    })
  })
})
