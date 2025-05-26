/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import * as td from "testdouble"
import { expect } from "chai"
import { join } from "path"
import fsExtra from "fs-extra"
const { mkdirp, pathExists } = fsExtra

import {
  expectError,
  withDefaultGlobalOpts,
  makeExtProjectSourcesGarden,
  makeExtModuleSourcesGarden,
  makeExtActionSourcesGarden,
} from "../../../helpers.js"
import { UpdateRemoteSourcesCommand } from "../../../../src/commands/update-remote/sources.js"
import { UpdateRemoteModulesCommand } from "../../../../src/commands/update-remote/modules.js"
import type { Garden } from "../../../../src/garden.js"
import type { Log } from "../../../../src/logger/log-entry.js"
import { UpdateRemoteActionsCommand } from "../../../../src/commands/update-remote/actions.js"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withDefaultOpts(opts: any) {
  return withDefaultGlobalOpts({ parallel: false, ...opts })
}

describe("UpdateRemoteCommand", () => {
  describe("UpdateRemoteSourcesCommand", () => {
    let garden: Garden
    let log: Log
    const cmd = new UpdateRemoteSourcesCommand()

    before(async () => {
      garden = await makeExtProjectSourcesGarden()
      log = garden.log
    })

    beforeEach(async () => {
      td.replace(garden.vcs, "updateRemoteSource", async () => undefined)
    })

    it("should update all project sources", async () => {
      const { result } = await cmd.action({
        garden,
        log,
        args: { sources: undefined },
        opts: withDefaultOpts({}),
      })

      expect(cmd.outputsSchema().validate(result).error).to.be.undefined

      expect(result!.sources.map((s) => s.name).sort()).to.eql(["source-a", "source-b", "source-c"])
    })

    it("should update all project sources in parallel if supplied", async () => {
      const { result } = await cmd.action({
        garden,
        log,
        args: { sources: undefined },
        opts: withDefaultOpts({ parallel: true }),
      })

      expect(cmd.outputsSchema().validate(result).error).to.be.undefined

      expect(result!.sources.map((s) => s.name).sort()).to.eql(["source-a", "source-b", "source-c"])
    })

    it("should update the specified project sources", async () => {
      const { result } = await cmd.action({
        garden,
        log,
        args: { sources: ["source-a"] },
        opts: withDefaultOpts({}),
      })
      expect(result!.sources.map((s) => s.name).sort()).to.eql(["source-a"])
    })

    it("should update the specified project sources in parallel if supplied", async () => {
      const { result } = await cmd.action({
        garden,
        log,
        args: { sources: ["source-a"] },
        opts: withDefaultOpts({ parallel: true }),
      })
      expect(result!.sources.map((s) => s.name).sort()).to.eql(["source-a"])
    })

    it("should remove stale remote project sources", async () => {
      const stalePath = join(garden.gardenDirPath, "sources", "project", "stale-source")
      await mkdirp(stalePath)
      await cmd.action({
        garden,
        log,
        args: { sources: undefined },
        opts: withDefaultOpts({}),
      })
      expect(await pathExists(stalePath)).to.be.false
    })

    it("should throw if project source is not found", async () => {
      await expectError(
        async () =>
          await cmd.action({
            garden,
            log,
            args: { sources: ["banana"] },
            opts: withDefaultOpts({}),
          }),
        "parameter"
      )
    })
  })

  describe("UpdateRemoteActionsCommand", () => {
    let garden: Garden
    let log: Log
    const cmd = new UpdateRemoteActionsCommand()

    beforeEach(async () => {
      garden = await makeExtActionSourcesGarden()
      td.replace(garden.vcs, "updateRemoteSource", async () => undefined)
      log = garden.log
    })

    it("should update all actions sources", async () => {
      const { result } = await cmd.action({
        garden,
        log,
        args: { actions: undefined },
        opts: withDefaultOpts({}),
      })

      expect(cmd.outputsSchema().validate(result).error).to.be.undefined

      expect(result!.sources.map((s) => s.name).sort()).to.eql(["build.a", "build.b"])
    })

    it("should update all actions sources in parallel if supplied", async () => {
      const { result } = await cmd.action({
        garden,
        log,
        args: { actions: undefined },
        opts: withDefaultOpts({ parallel: true }),
      })

      expect(cmd.outputsSchema().validate(result).error).to.be.undefined

      expect(result!.sources.map((s) => s.name).sort()).to.eql(["build.a", "build.b"])
    })

    it("should update the specified action sources", async () => {
      const { result } = await cmd.action({
        garden,
        log,
        args: { actions: ["build.a"] },
        opts: withDefaultOpts({}),
      })
      expect(result!.sources.map((s) => s.name).sort()).to.eql(["build.a"])
    })

    it("should update the specified action sources in parallel if supplied", async () => {
      const { result } = await cmd.action({
        garden,
        log,
        args: { actions: ["build.a"] },
        opts: withDefaultOpts({ parallel: true }),
      })
      expect(result!.sources.map((s) => s.name).sort()).to.eql(["build.a"])
    })

    it("should remove stale remote action sources", async () => {
      const stalePath = join(garden.gardenDirPath, "sources", "action", "stale-source")
      await mkdirp(stalePath)
      await cmd.action({
        garden,
        log,
        args: { actions: undefined },
        opts: withDefaultOpts({}),
      })
      expect(await pathExists(stalePath)).to.be.false
    })

    it("should throw if action source is not found", async () => {
      await expectError(
        async () =>
          await cmd.action({
            garden,
            log,
            args: { actions: ["build.banana"] },
            opts: withDefaultOpts({}),
          }),
        "parameter"
      )
    })
  })

  describe("UpdateRemoteModulesCommand", () => {
    let garden: Garden
    let log: Log
    const cmd = new UpdateRemoteModulesCommand()

    beforeEach(async () => {
      garden = await makeExtModuleSourcesGarden()
      td.replace(garden.vcs, "updateRemoteSource", async () => undefined)
      log = garden.log
    })

    it("should update all modules sources", async () => {
      const { result } = await cmd.action({
        garden,
        log,
        args: { modules: undefined },
        opts: withDefaultOpts({}),
      })

      expect(cmd.outputsSchema().validate(result).error).to.be.undefined

      expect(result!.sources.map((s) => s.name).sort()).to.eql(["module-a", "module-b", "module-c"])
    })

    it("should update all modules sources in parallel if supplied", async () => {
      const { result } = await cmd.action({
        garden,
        log,
        args: { modules: undefined },
        opts: withDefaultOpts({ parallel: true }),
      })

      expect(cmd.outputsSchema().validate(result).error).to.be.undefined

      expect(result!.sources.map((s) => s.name).sort()).to.eql(["module-a", "module-b", "module-c"])
    })

    it("should update the specified module sources", async () => {
      const { result } = await cmd.action({
        garden,
        log,
        args: { modules: ["module-a"] },
        opts: withDefaultOpts({}),
      })
      expect(result!.sources.map((s) => s.name).sort()).to.eql(["module-a"])
    })

    it("should update the specified module sources in parallel if supplied", async () => {
      const { result } = await cmd.action({
        garden,
        log,
        args: { modules: ["module-a"] },
        opts: withDefaultOpts({ parallel: true }),
      })
      expect(result!.sources.map((s) => s.name).sort()).to.eql(["module-a"])
    })

    it("should remove stale remote module sources", async () => {
      const stalePath = join(garden.gardenDirPath, "sources", "module", "stale-source")
      await mkdirp(stalePath)
      await cmd.action({
        garden,
        log,
        args: { modules: undefined },
        opts: withDefaultOpts({}),
      })
      expect(await pathExists(stalePath)).to.be.false
    })

    it("should throw if module source is not found", async () => {
      await expectError(
        async () =>
          await cmd.action({
            garden,
            log,
            args: { modules: ["banana"] },
            opts: withDefaultOpts({}),
          }),
        "parameter"
      )
    })
  })
})
