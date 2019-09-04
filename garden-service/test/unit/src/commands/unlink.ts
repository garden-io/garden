import { expect } from "chai"
import { join } from "path"

import { LinkModuleCommand } from "../../../../src/commands/link/module"
import { UnlinkModuleCommand } from "../../../../src/commands/unlink/module"
import {
  getDataDir,
  withDefaultGlobalOpts,
  makeExtProjectSourcesGarden,
  makeExtModuleSourcesGarden,
  resetLocalConfig,
} from "../../../helpers"
import { LinkSourceCommand } from "../../../../src/commands/link/source"
import { UnlinkSourceCommand } from "../../../../src/commands/unlink/source"
import { Garden } from "../../../../src/garden"
import { LogEntry } from "../../../../src/logger/log-entry"

describe("UnlinkCommand", () => {
  let garden: Garden
  let log: LogEntry

  describe("UnlinkModuleCommand", () => {
    const linkCmd = new LinkModuleCommand()
    const unlinkCmd = new UnlinkModuleCommand()
    const linkedModulePathA = join(getDataDir("test-project-local-module-sources"), "module-a")
    const linkedModulePathB = join(getDataDir("test-project-local-module-sources"), "module-b")
    const linkedModulePathC = join(getDataDir("test-project-local-module-sources"), "module-c")

    before(async () => {
      garden = await makeExtModuleSourcesGarden()
      log = garden.log
    })

    beforeEach(async () => {
      await linkCmd.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: {
          module: "module-a",
          path: linkedModulePathA,
        },
        opts: withDefaultGlobalOpts({}),
      })
      await linkCmd.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: {
          module: "module-b",
          path: linkedModulePathB,
        },
        opts: withDefaultGlobalOpts({}),
      })
      await linkCmd.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
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
        headerLog: log,
        footerLog: log,
        args: { modules: ["module-a", "module-b"] },
        opts: withDefaultGlobalOpts({ all: false }),
      })
      const { linkedModuleSources } = await garden.configStore.get()
      expect(linkedModuleSources).to.eql([{ name: "module-c", path: linkedModulePathC }])
    })

    it("should unlink all modules", async () => {
      await unlinkCmd.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: { modules: undefined },
        opts: withDefaultGlobalOpts({ all: true }),
      })
      const { linkedModuleSources } = await garden.configStore.get()
      expect(linkedModuleSources).to.eql([])
    })
  })

  describe("UnlinkSourceCommand", () => {
    const linkCmd = new LinkSourceCommand()
    const unlinkCmd = new UnlinkSourceCommand()
    const linkedSourcePathA = join(getDataDir("test-project-local-project-sources"), "source-a")
    const linkedSourcePathB = join(getDataDir("test-project-local-project-sources"), "source-b")
    const linkedSourcePathC = join(getDataDir("test-project-local-project-sources"), "source-c")

    before(async () => {
      garden = await makeExtProjectSourcesGarden()
      log = garden.log
    })

    beforeEach(async () => {
      await linkCmd.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: {
          source: "source-a",
          path: linkedSourcePathA,
        },
        opts: withDefaultGlobalOpts({}),
      })
      await linkCmd.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: {
          source: "source-b",
          path: linkedSourcePathB,
        },
        opts: withDefaultGlobalOpts({}),
      })
      await linkCmd.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
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
        headerLog: log,
        footerLog: log,
        args: { sources: ["source-a", "source-b"] },
        opts: withDefaultGlobalOpts({ all: false }),
      })
      const { linkedProjectSources } = await garden.configStore.get()
      expect(linkedProjectSources).to.eql([{ name: "source-c", path: linkedSourcePathC }])
    })

    it("should unlink all sources", async () => {
      await unlinkCmd.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: { sources: undefined },
        opts: withDefaultGlobalOpts({ all: true }),
      })
      const { linkedProjectSources } = await garden.configStore.get()
      expect(linkedProjectSources).to.eql([])
    })
  })
})
