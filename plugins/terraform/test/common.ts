/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { join } from "path"
import { pathExists, remove } from "fs-extra"
import { gardenPlugin, TerraformProvider } from ".."
import { makeTestGarden, TestGarden } from "@garden-io/sdk/testing"
import { LogEntry, PluginContext } from "@garden-io/sdk/types"
import { getWorkspaces, setWorkspace } from "../common"
import { expect } from "chai"
import { terraform } from "../cli"

describe("Terraform common", () => {
  const testRoot = join(__dirname, "test-project")

  let root: string
  let terraformDirPath: string
  let stateDirPath: string
  let testFilePath: string

  let garden: TestGarden
  let log: LogEntry
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
    garden = await makeTestGarden(testRoot, { plugins: [gardenPlugin()], environmentName: "prod", forceRefresh: true })
    log = garden.log
    provider = (await garden.resolveProvider(log, "terraform")) as TerraformProvider
    ctx = await garden.getPluginContext(provider)
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
