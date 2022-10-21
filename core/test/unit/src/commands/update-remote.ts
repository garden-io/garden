/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import td from "testdouble"
import { expect } from "chai"
import { join } from "path"
import { mkdirp, pathExists } from "fs-extra"

import {
  expectError,
  withDefaultGlobalOpts,
  makeExtProjectSourcesGarden,
  makeExtModuleSourcesGarden,
} from "../../../helpers"
import { UpdateRemoteSourcesCommand } from "../../../../src/commands/update-remote/sources"
import { UpdateRemoteModulesCommand } from "../../../../src/commands/update-remote/modules"
import { Garden } from "../../../../src/garden"
import { LogEntry } from "../../../../src/logger/log-entry"

function withDefaultOpts(opts: any) {
  return withDefaultGlobalOpts({ parallel: false, ...opts })
}

describe("UpdateRemoteCommand", () => {
  describe("UpdateRemoteSourcesCommand", () => {
    let garden: Garden
    let log: LogEntry
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
        headerLog: log,
        footerLog: log,
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
        headerLog: log,
        footerLog: log,
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
        headerLog: log,
        footerLog: log,
        args: { sources: ["source-a"] },
        opts: withDefaultOpts({}),
      })
      expect(result!.sources.map((s) => s.name).sort()).to.eql(["source-a"])
    })

    it("should update the specified project sources in parallel if supplied", async () => {
      const { result } = await cmd.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
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
        headerLog: log,
        footerLog: log,
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
            headerLog: log,
            footerLog: log,
            args: { sources: ["banana"] },
            opts: withDefaultOpts({}),
          }),
        "parameter"
      )
    })
  })

  describe("UpdateRemoteModulesCommand", () => {
    let garden: Garden
    let log: LogEntry
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
        headerLog: log,
        footerLog: log,
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
        headerLog: log,
        footerLog: log,
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
        headerLog: log,
        footerLog: log,
        args: { modules: ["module-a"] },
        opts: withDefaultOpts({}),
      })
      expect(result!.sources.map((s) => s.name).sort()).to.eql(["module-a"])
    })

    it("should update the specified module sources in parallel if supplied", async () => {
      const { result } = await cmd.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
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
        headerLog: log,
        footerLog: log,
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
            headerLog: log,
            footerLog: log,
            args: { modules: ["banana"] },
            opts: withDefaultOpts({}),
          }),
        "parameter"
      )
    })
  })
})
