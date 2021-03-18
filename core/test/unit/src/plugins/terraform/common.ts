/*
 * Copyright (C) 2018-2021 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { getDataDir, makeTestGarden } from "../../../../helpers"
import { join } from "path"
import { Garden } from "../../../../../src/garden"
import { pathExists, remove } from "fs-extra"
import { PluginContext } from "../../../../../src/plugin-context"
import { TerraformProvider } from "../../../../../src/plugins/terraform/terraform"
import { LogEntry } from "../../../../../src/logger/log-entry"
import { getWorkspaces, setWorkspace } from "../../../../../src/plugins/terraform/common"
import { expect } from "chai"
import { terraform } from "../../../../../src/plugins/terraform/cli"

describe("Terraform common", () => {
  const testRoot = getDataDir("test-projects", "terraform-provider")
  const root = join(testRoot, "tf")
  const terraformDirPath = join(root, ".terraform")
  const stateDirPath = join(root, "terraform.tfstate.d")
  const testFilePath = join(root, "test.log")

  let garden: Garden
  let log: LogEntry
  let ctx: PluginContext
  let provider: TerraformProvider

  async function reset() {
    if (await pathExists(terraformDirPath)) {
      await remove(terraformDirPath)
    }
    if (await pathExists(testFilePath)) {
      await remove(testFilePath)
    }
    if (await pathExists(stateDirPath)) {
      await remove(stateDirPath)
    }
  }

  before(async () => {
    garden = await makeTestGarden(testRoot, { environmentName: "prod", forceRefresh: true })
    log = garden.log
    provider = (await garden.resolveProvider(log, "terraform")) as TerraformProvider
    ctx = await garden.getPluginContext(provider)
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
      await terraform(ctx, provider).exec({ args: ["workspace", "new", "foo"], cwd: root, log })
      await terraform(ctx, provider).exec({ args: ["workspace", "new", "bar"], cwd: root, log })

      const { workspaces, selected } = await getWorkspaces({ ctx, provider, log, root })
      expect(selected).to.equal("bar")
      expect(workspaces).to.eql(["default", "bar", "foo"])
    })
  })

  describe("setWorkspace", () => {
    it("does nothing if no workspace is set", async () => {
      await terraform(ctx, provider).exec({ args: ["workspace", "new", "foo"], cwd: root, log })

      await setWorkspace({ ctx, provider, log, root, workspace: null })

      const { workspaces, selected } = await getWorkspaces({ ctx, provider, log, root })
      expect(selected).to.equal("foo")
      expect(workspaces).to.eql(["default", "foo"])
    })

    it("does nothing if already on requested workspace", async () => {
      await setWorkspace({ ctx, provider, log, root, workspace: "default" })

      const { workspaces, selected } = await getWorkspaces({ ctx, provider, log, root })
      expect(selected).to.equal("default")
      expect(workspaces).to.eql(["default"])
    })

    it("selects the given workspace if it already exists", async () => {
      await terraform(ctx, provider).exec({ args: ["workspace", "new", "foo"], cwd: root, log })
      await terraform(ctx, provider).exec({ args: ["workspace", "select", "default"], cwd: root, log })

      await setWorkspace({ ctx, provider, log, root, workspace: "foo" })

      const { workspaces, selected } = await getWorkspaces({ ctx, provider, log, root })
      expect(selected).to.equal("foo")
      expect(workspaces).to.eql(["default", "foo"])
    })

    it("creates a new workspace if it doesn't already exist", async () => {
      await setWorkspace({ ctx, provider, log, root, workspace: "foo" })

      const { workspaces, selected } = await getWorkspaces({ ctx, provider, log, root })
      expect(selected).to.equal("foo")
      expect(workspaces).to.eql(["default", "foo"])
    })
  })
})
