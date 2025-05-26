/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { dirname, join, resolve } from "node:path"
import fsExtra from "fs-extra"
const { pathExists, remove } = fsExtra
import { gardenPlugin } from "../src/index.js"
import type { TerraformProvider } from "../src/provider.js"
import type { TestGarden } from "@garden-io/sdk/build/src/testing.js"
import { makeTestGarden } from "@garden-io/sdk/build/src/testing.js"
import type { Log, PluginContext } from "@garden-io/sdk/build/src/types.js"
import { getWorkspaces, ensureWorkspace } from "../src/helpers.js"
import { expect } from "chai"
import { defaultTerraformVersion, terraform } from "../src/cli.js"
import { fileURLToPath } from "node:url"

const moduleDirName = dirname(fileURLToPath(import.meta.url))

for (const terraformVersion of ["0.13.3", defaultTerraformVersion]) {
  describe(`Terraform common with version ${terraformVersion}`, () => {
    const testRoot = resolve(moduleDirName, "../../test/", "test-project")

    let root: string
    let terraformDirPath: string
    let stateDirPath: string
    let testFilePath: string

    let garden: TestGarden
    let log: Log
    let ctx: PluginContext
    let provider: TerraformProvider

    async function reset() {
      if (terraformDirPath && (await pathExists(terraformDirPath))) {
        await remove(terraformDirPath)
      }
      if (testFilePath && (await pathExists(testFilePath))) {
        await remove(testFilePath)
      }
      if (stateDirPath && (await pathExists(stateDirPath))) {
        await remove(stateDirPath)
      }
    }

    before(async () => {
      garden = await makeTestGarden(testRoot, {
        plugins: [gardenPlugin()],
        environmentString: "prod",
        forceRefresh: true,
        variableOverrides: { "tf-version": terraformVersion },
      })
      log = garden.log
      provider = (await garden.resolveProvider({ log, name: "terraform" })) as TerraformProvider
      ctx = await garden.getPluginContext({ provider, events: undefined, templateContext: undefined })
      root = join(garden.projectRoot, "tf")
      terraformDirPath = join(root, ".terraform")
      stateDirPath = join(root, "terraform.tfstate.d")
      testFilePath = join(root, "test.log")
    })

    beforeEach(async () => {
      await reset()
    })

    after(async () => {
      await reset()
    })

    describe("getWorkspaces", () => {
      it("returns just the default workspace if none other exists", async () => {
        const { workspaces, selected } = await getWorkspaces({ ctx, provider, log, root })
        expect(selected).to.equal("default")
        expect(workspaces).to.eql(["default"])
      })

      it("returns all workspaces and which is selected", async () => {
        await terraform(ctx, provider).exec({ args: ["init"], cwd: root, log })
        await terraform(ctx, provider).exec({ args: ["workspace", "new", "foo"], cwd: root, log })
        await terraform(ctx, provider).exec({ args: ["workspace", "new", "bar"], cwd: root, log })

        const { workspaces, selected } = await getWorkspaces({ ctx, provider, log, root })
        expect(selected).to.equal("bar")
        expect(workspaces).to.eql(["default", "bar", "foo"])
      })
    })

    describe("setWorkspace", () => {
      it("does nothing if no workspace is set", async () => {
        await terraform(ctx, provider).exec({ args: ["init"], cwd: root, log })
        await terraform(ctx, provider).exec({ args: ["workspace", "new", "foo"], cwd: root, log })

        await ensureWorkspace({ ctx, provider, log, root, workspace: null })

        const { workspaces, selected } = await getWorkspaces({ ctx, provider, log, root })
        expect(selected).to.equal("foo")
        expect(workspaces).to.eql(["default", "foo"])
      })

      it("does nothing if already on requested workspace", async () => {
        await ensureWorkspace({ ctx, provider, log, root, workspace: "default" })

        const { workspaces, selected } = await getWorkspaces({ ctx, provider, log, root })
        expect(selected).to.equal("default")
        expect(workspaces).to.eql(["default"])
      })

      it("selects the given workspace if it already exists", async () => {
        await terraform(ctx, provider).exec({ args: ["init"], cwd: root, log })
        await terraform(ctx, provider).exec({ args: ["workspace", "new", "foo"], cwd: root, log })
        await terraform(ctx, provider).exec({ args: ["workspace", "select", "default"], cwd: root, log })

        await ensureWorkspace({ ctx, provider, log, root, workspace: "foo" })

        const { workspaces, selected } = await getWorkspaces({ ctx, provider, log, root })
        expect(selected).to.equal("foo")
        expect(workspaces).to.eql(["default", "foo"])
      })

      it("creates a new workspace if it doesn't already exist", async () => {
        await ensureWorkspace({ ctx, provider, log, root, workspace: "foo" })

        const { workspaces, selected } = await getWorkspaces({ ctx, provider, log, root })
        expect(selected).to.equal("foo")
        expect(workspaces).to.eql(["default", "foo"])
      })
    })
  })
}
