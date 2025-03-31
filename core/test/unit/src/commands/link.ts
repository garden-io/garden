/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { join, resolve } from "path"

import { LinkModuleCommand } from "../../../../src/commands/link/module.js"
import {
  getDataDir,
  expectError,
  withDefaultGlobalOpts,
  makeExtProjectSourcesGarden,
  makeExtModuleSourcesGarden,
  resetLocalConfig,
  makeExtActionSourcesGarden,
} from "../../../helpers.js"
import { LinkSourceCommand } from "../../../../src/commands/link/source.js"
import type { Garden } from "../../../../src/garden.js"
import type { Log } from "../../../../src/logger/log-entry.js"
import fsExtra from "fs-extra"
const { copy } = fsExtra
import { LinkActionCommand } from "../../../../src/commands/link/action.js"

describe("LinkCommand", () => {
  let garden: Garden
  let log: Log

  describe("LinkActionCommand", () => {
    const cmd = new LinkActionCommand()

    beforeEach(async () => {
      garden = await makeExtActionSourcesGarden()
      log = garden.log
    })

    afterEach(async () => {
      await resetLocalConfig(garden.gardenDirPath)
    })

    it("should link external actions", async () => {
      const localActionPath = join(getDataDir("test-projects", "local-action-sources"), "build.a")

      await cmd.action({
        garden,
        log,
        args: {
          action: "build.a",
          path: localActionPath,
        },
        opts: withDefaultGlobalOpts({}),
      })

      const linkedActionSources = await garden.localConfigStore.get("linkedActionSources")

      expect(linkedActionSources).to.eql({
        "build.a": {
          name: "build.a",
          path: localActionPath,
        },
      })
    })

    it("should handle relative paths", async () => {
      const localActionPath = resolve(garden.projectRoot, "..", "test-projects", "local-action-sources", "build.a")

      await cmd.action({
        garden,
        log,
        args: {
          action: "build.a",
          path: join("..", "test-projects", "local-action-sources", "build.a"),
        },
        opts: withDefaultGlobalOpts({}),
      })

      const linkedActionSources = await garden.localConfigStore.get("linkedActionSources")

      expect(linkedActionSources).to.eql({
        "build.a": {
          name: "build.a",
          path: localActionPath,
        },
      })
    })

    it("should throw if action to link does not have an external source", async () => {
      await expectError(
        async () =>
          cmd.action({
            garden,
            log,
            args: {
              action: "build.c",
              path: "",
            },
            opts: withDefaultGlobalOpts({}),
          }),
        "parameter"
      )
    })

    it("should return linked action sources", async () => {
      const path = resolve("..", "test-projects", "local-action-sources", "build.a")

      const { result } = await cmd.action({
        garden,
        log,
        args: {
          action: "build.a",
          path,
        },
        opts: withDefaultGlobalOpts({}),
      })

      expect(cmd.outputsSchema().validate(result).error).to.be.undefined

      expect(result).to.eql({
        sources: [
          {
            name: "build.a",
            path,
          },
        ],
      })
    })
  })

  describe("LinkModuleCommand", () => {
    const cmd = new LinkModuleCommand()

    beforeEach(async () => {
      garden = await makeExtModuleSourcesGarden()
      log = garden.log
    })

    afterEach(async () => {
      await resetLocalConfig(garden.gardenDirPath)
    })

    it("should link external modules", async () => {
      const localModulePath = join(getDataDir("test-projects", "local-module-sources"), "module-a")

      await cmd.action({
        garden,
        log,
        args: {
          module: "module-a",
          path: localModulePath,
        },
        opts: withDefaultGlobalOpts({}),
      })

      const linkedModuleSources = await garden.localConfigStore.get("linkedModuleSources")

      expect(linkedModuleSources).to.eql({
        "module-a": {
          name: "module-a",
          path: localModulePath,
        },
      })
    })

    it("should handle relative paths", async () => {
      const localModulePath = resolve(garden.projectRoot, "..", "test-projects", "local-module-sources", "module-a")

      await cmd.action({
        garden,
        log,
        args: {
          module: "module-a",
          path: join("..", "test-projects", "local-module-sources", "module-a"),
        },
        opts: withDefaultGlobalOpts({}),
      })

      const linkedModuleSources = await garden.localConfigStore.get("linkedModuleSources")

      expect(linkedModuleSources).to.eql({
        "module-a": {
          name: "module-a",
          path: localModulePath,
        },
      })
    })

    it("should throw if module to link does not have an external source", async () => {
      await expectError(
        async () =>
          cmd.action({
            garden,
            log,
            args: {
              module: "banana",
              path: "",
            },
            opts: withDefaultGlobalOpts({}),
          }),
        "parameter"
      )
    })

    it("should return linked module sources", async () => {
      const path = resolve("..", "test-projects", "local-module-sources", "module-a")

      const { result } = await cmd.action({
        garden,
        log,
        args: {
          module: "module-a",
          path,
        },
        opts: withDefaultGlobalOpts({}),
      })

      expect(cmd.outputsSchema().validate(result).error).to.be.undefined

      expect(result).to.eql({
        sources: [
          {
            name: "module-a",
            path,
          },
        ],
      })
    })
  })

  describe("LinkSourceCommand", () => {
    const cmd = new LinkSourceCommand()
    let localSourcePath: string

    before(async () => {
      garden = await makeExtProjectSourcesGarden()
      localSourcePath = resolve(garden.projectRoot, "..", "test-projects", "local-project-sources")
      await copy(getDataDir("test-projects", "local-project-sources"), localSourcePath)
      log = garden.log
    })

    afterEach(async () => {
      await resetLocalConfig(garden.gardenDirPath)
    })

    it("should link external sources", async () => {
      await cmd.action({
        garden,
        log,
        args: {
          source: "source-a",
          path: localSourcePath,
        },
        opts: withDefaultGlobalOpts({}),
      })

      const linkedProjectSources = await garden.localConfigStore.get("linkedProjectSources")

      expect(linkedProjectSources).to.eql({
        "source-a": {
          name: "source-a",
          path: localSourcePath,
        },
      })
    })

    it("should handle relative paths", async () => {
      await cmd.action({
        garden,
        log,
        args: {
          source: "source-a",
          path: join("..", "test-projects", "local-project-sources"),
        },
        opts: withDefaultGlobalOpts({}),
      })

      const linkedProjectSources = await garden.localConfigStore.get("linkedProjectSources")

      expect(linkedProjectSources).to.eql({
        "source-a": {
          name: "source-a",
          path: localSourcePath,
        },
      })
    })

    it("should return linked sources", async () => {
      const path = localSourcePath

      const { result } = await cmd.action({
        garden,
        log,
        args: {
          source: "source-a",
          path,
        },
        opts: withDefaultGlobalOpts({}),
      })

      expect(cmd.outputsSchema().validate(result).error).to.be.undefined

      expect(result).to.eql({
        sources: [
          {
            name: "source-a",
            path,
          },
        ],
      })
    })
  })
})
