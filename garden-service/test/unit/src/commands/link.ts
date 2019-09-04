/*
 * Copyright (C) 2018 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { join } from "path"

import { LinkModuleCommand } from "../../../../src/commands/link/module"
import {
  getDataDir,
  expectError,
  withDefaultGlobalOpts,
  makeExtProjectSourcesGarden,
  makeExtModuleSourcesGarden,
  resetLocalConfig,
} from "../../../helpers"
import { LinkSourceCommand } from "../../../../src/commands/link/source"
import { Garden } from "../../../../src/garden"
import { LogEntry } from "../../../../src/logger/log-entry"

describe("LinkCommand", () => {
  let garden: Garden
  let log: LogEntry

  describe("LinkModuleCommand", () => {
    const cmd = new LinkModuleCommand()
    const localModulePath = join(getDataDir("test-project-local-module-sources"), "module-a")

    beforeEach(async () => {
      garden = await makeExtModuleSourcesGarden()
      log = garden.log
    })

    afterEach(async () => {
      await resetLocalConfig(garden.gardenDirPath)
    })

    it("should link external modules", async () => {
      await cmd.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: {
          module: "module-a",
          path: localModulePath,
        },
        opts: withDefaultGlobalOpts({}),
      })

      const { linkedModuleSources } = await garden.configStore.get()

      expect(linkedModuleSources).to.eql([{ name: "module-a", path: localModulePath }])
    })

    it("should handle relative paths", async () => {
      await cmd.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: {
          module: "module-a",
          path: join("..", "test-project-local-module-sources", "module-a"),
        },
        opts: withDefaultGlobalOpts({}),
      })

      const { linkedModuleSources } = await garden.configStore.get()

      expect(linkedModuleSources).to.eql([{ name: "module-a", path: localModulePath }])
    })

    it("should throw if module to link does not have an external source", async () => {
      await expectError(
        async () =>
          cmd.action({
            garden,
            log,
            headerLog: log,
            footerLog: log,
            args: {
              module: "banana",
              path: "",
            },
            opts: withDefaultGlobalOpts({}),
          }),
        "parameter"
      )
    })
  })

  describe("LinkSourceCommand", () => {
    const cmd = new LinkSourceCommand()
    const localSourcePath = join(getDataDir("test-project-local-project-sources"), "source-a")

    beforeEach(async () => {
      garden = await makeExtProjectSourcesGarden()
      log = garden.log
    })

    afterEach(async () => {
      await resetLocalConfig(garden.gardenDirPath)
    })

    it("should link external sources", async () => {
      await cmd.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: {
          source: "source-a",
          path: localSourcePath,
        },
        opts: withDefaultGlobalOpts({}),
      })

      const { linkedProjectSources } = await garden.configStore.get()

      expect(linkedProjectSources).to.eql([{ name: "source-a", path: localSourcePath }])
    })

    it("should handle relative paths", async () => {
      await cmd.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: {
          source: "source-a",
          path: join("..", "test-project-local-project-sources", `source-a`),
        },
        opts: withDefaultGlobalOpts({}),
      })

      const { linkedProjectSources } = await garden.configStore.get()

      expect(linkedProjectSources).to.eql([{ name: "source-a", path: localSourcePath }])
    })
  })
})
