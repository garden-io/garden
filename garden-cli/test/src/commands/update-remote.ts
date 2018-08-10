/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { join } from "path"
import { mkdirp, pathExists } from "fs-extra"
import * as td from "testdouble"

import { makeTestContext, getDataDir, expectError, stubExtSources, stubGitCli } from "../../helpers"
import { PluginContext } from "../../../src/plugin-context"
import { UpdateRemoteSourcesCommand } from "../../../src/commands/update-remote/sources"
import { UpdateRemoteModulesCommand } from "../../../src/commands/update-remote/modules"

describe("UpdateRemoteCommand", () => {
  describe("UpdateRemoteSourcesCommand", () => {
    let ctx: PluginContext

    beforeEach(async () => {
      ctx = await makeTestContext(projectRoot)
      stubGitCli()
    })

    afterEach(async () => {
      td.reset()
    })

    const projectRoot = getDataDir("test-project-ext-project-sources")
    const cmd = new UpdateRemoteSourcesCommand()

    it("should update all project sources", async () => {
      const { result } = await cmd.action(ctx, { source: undefined })
      expect(result!.map(s => s.name).sort()).to.eql(["source-a", "source-b", "source-c"])
    })

    it("should update the specified project sources", async () => {
      const { result } = await cmd.action(ctx, { source: ["source-a"] })
      expect(result!.map(s => s.name).sort()).to.eql(["source-a"])
    })

    it("should remove stale remote project sources", async () => {
      const stalePath = join(projectRoot, ".garden", "sources", "project", "stale-source")
      await mkdirp(stalePath)
      await cmd.action(ctx, { source: undefined })
      expect(await pathExists(stalePath)).to.be.false
    })

    it("should throw if project source is not found", async () => {
      await expectError(
        async () => (
          await cmd.action(ctx, { source: ["banana"] })
        ),
        "parameter",
      )
    })
  })

  describe("UpdateRemoteModulesCommand", () => {
    let ctx: PluginContext

    beforeEach(async () => {
      ctx = await makeTestContext(projectRoot)
      stubExtSources(ctx)
    })

    afterEach(async () => {
      td.reset()
    })

    const projectRoot = getDataDir("test-project-ext-module-sources")
    const cmd = new UpdateRemoteModulesCommand()

    it("should update all modules sources", async () => {
      const { result } = await cmd.action(ctx, { module: undefined })
      expect(result!.map(s => s.name).sort()).to.eql(["module-a", "module-b", "module-c"])
    })

    it("should update the specified module sources", async () => {
      const { result } = await cmd.action(ctx, { module: ["module-a"] })
      expect(result!.map(s => s.name).sort()).to.eql(["module-a"])
    })

    it("should remove stale remote module sources", async () => {
      const stalePath = join(projectRoot, ".garden", "sources", "module", "stale-source")
      await mkdirp(stalePath)
      await cmd.action(ctx, { module: undefined })
      expect(await pathExists(stalePath)).to.be.false
    })

    it("should throw if project source is not found", async () => {
      await expectError(
        async () => (
          await cmd.action(ctx, { module: ["banana"] })
        ),
        "parameter",
      )
    })
  })
})
