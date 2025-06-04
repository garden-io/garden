/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { join } from "path"

import { LinkModuleCommand } from "../../../../src/commands/link/module.js"
import { UnlinkModuleCommand } from "../../../../src/commands/unlink/module.js"
import {
  getDataDir,
  withDefaultGlobalOpts,
  makeExtProjectSourcesGarden,
  makeExtModuleSourcesGarden,
  resetLocalConfig,
  makeExtActionSourcesGarden,
} from "../../../helpers.js"
import { LinkSourceCommand } from "../../../../src/commands/link/source.js"
import { UnlinkSourceCommand } from "../../../../src/commands/unlink/source.js"
import type { Garden } from "../../../../src/garden.js"
import type { Log } from "../../../../src/logger/log-entry.js"
import { LinkActionCommand } from "../../../../src/commands/link/action.js"
import { UnlinkActionCommand } from "../../../../src/commands/unlink/action.js"

describe("UnlinkCommand", () => {
  let garden: Garden
  let log: Log

  describe("UnlinkActionCommand", () => {
    const linkCmd = new LinkActionCommand()
    const unlinkCmd = new UnlinkActionCommand()
    const localSourcesDir = getDataDir("test-projects", "local-action-sources")
    const linkedActionPathA = join(localSourcesDir, "build.a")
    const linkedActionPathB = join(localSourcesDir, "build.b")

    before(async () => {
      garden = await makeExtActionSourcesGarden()
      log = garden.log
    })

    beforeEach(async () => {
      await linkCmd.action({
        garden,
        log,
        args: {
          action: "build.a",
          path: linkedActionPathA,
        },
        opts: withDefaultGlobalOpts({}),
      })
      await linkCmd.action({
        garden,
        log,
        args: {
          action: "build.b",
          path: linkedActionPathB,
        },
        opts: withDefaultGlobalOpts({}),
      })
    })

    afterEach(async () => {
      await resetLocalConfig(garden.gardenDirPath)
    })

    it("should unlink the provided modules", async () => {
      await unlinkCmd.action({
        garden,
        log,
        args: { actions: ["build.b"] },
        opts: withDefaultGlobalOpts({ all: false }),
      })
      const linkedActionSources = await garden.localConfigStore.get("linkedActionSources")
      expect(linkedActionSources).to.eql({
        "build.a": {
          name: "build.a",
          path: linkedActionPathA,
        },
      })
    })

    it("should unlink all modules", async () => {
      await unlinkCmd.action({
        garden,
        log,
        args: { actions: undefined },
        opts: withDefaultGlobalOpts({ all: true }),
      })
      const linkedActionSources = await garden.localConfigStore.get("linkedActionSources")
      expect(linkedActionSources).to.eql({})
    })
  })

  describe("UnlinkModuleCommand", () => {
    const linkCmd = new LinkModuleCommand()
    const unlinkCmd = new UnlinkModuleCommand()
    const localSourcesDir = getDataDir("test-projects", "local-module-sources")
    const linkedModulePathA = join(localSourcesDir, "module-a")
    const linkedModulePathB = join(localSourcesDir, "module-b")
    const linkedModulePathC = join(localSourcesDir, "module-c")

    before(async () => {
      garden = await makeExtModuleSourcesGarden()
      log = garden.log
    })

    beforeEach(async () => {
      await linkCmd.action({
        garden,
        log,
        args: {
          module: "module-a",
          path: linkedModulePathA,
        },
        opts: withDefaultGlobalOpts({}),
      })
      await linkCmd.action({
        garden,
        log,
        args: {
          module: "module-b",
          path: linkedModulePathB,
        },
        opts: withDefaultGlobalOpts({}),
      })
      await linkCmd.action({
        garden,
        log,
        args: {
          module: "module-c",
          path: linkedModulePathC,
        },
        opts: withDefaultGlobalOpts({}),
      })
    })

    afterEach(async () => {
      await resetLocalConfig(garden.gardenDirPath)
    })

    it("should unlink the provided modules", async () => {
      await unlinkCmd.action({
        garden,
        log,
        args: { modules: ["module-a", "module-b"] },
        opts: withDefaultGlobalOpts({ all: false }),
      })
      const linkedModuleSources = await garden.localConfigStore.get("linkedModuleSources")
      expect(linkedModuleSources).to.eql({
        "module-c": {
          name: "module-c",
          path: linkedModulePathC,
        },
      })
    })

    it("should unlink all modules", async () => {
      await unlinkCmd.action({
        garden,
        log,
        args: { modules: undefined },
        opts: withDefaultGlobalOpts({ all: true }),
      })
      const linkedModuleSources = await garden.localConfigStore.get("linkedModuleSources")
      expect(linkedModuleSources).to.eql({})
    })
  })

  describe("UnlinkSourceCommand", () => {
    const linkCmd = new LinkSourceCommand()
    const unlinkCmd = new UnlinkSourceCommand()
    const localSourcesDir = getDataDir("test-projects", "local-project-sources")
    const linkedSourcePathA = join(localSourcesDir, "source-a")
    const linkedSourcePathB = join(localSourcesDir, "source-b")
    const linkedSourcePathC = join(localSourcesDir, "source-c")

    before(async () => {
      garden = await makeExtProjectSourcesGarden()
      log = garden.log
    })

    beforeEach(async () => {
      await linkCmd.action({
        garden,
        log,
        args: {
          source: "source-a",
          path: linkedSourcePathA,
        },
        opts: withDefaultGlobalOpts({}),
      })
      await linkCmd.action({
        garden,
        log,
        args: {
          source: "source-b",
          path: linkedSourcePathB,
        },
        opts: withDefaultGlobalOpts({}),
      })
      await linkCmd.action({
        garden,
        log,
        args: {
          source: "source-c",
          path: linkedSourcePathC,
        },
        opts: withDefaultGlobalOpts({}),
      })
    })

    afterEach(async () => {
      await resetLocalConfig(garden.gardenDirPath)
    })

    it("should unlink the provided sources", async () => {
      await unlinkCmd.action({
        garden,
        log,
        args: { sources: ["source-a", "source-b"] },
        opts: withDefaultGlobalOpts({ all: false }),
      })
      const linkedProjectSources = await garden.localConfigStore.get("linkedProjectSources")
      expect(linkedProjectSources).to.eql({
        "source-c": {
          name: "source-c",
          path: linkedSourcePathC,
        },
      })
    })

    it("should unlink all sources", async () => {
      await unlinkCmd.action({
        garden,
        log,
        args: { sources: undefined },
        opts: withDefaultGlobalOpts({ all: true }),
      })
      const linkedProjectSources = await garden.localConfigStore.get("linkedProjectSources")
      expect(linkedProjectSources).to.eql({})
    })
  })
})
