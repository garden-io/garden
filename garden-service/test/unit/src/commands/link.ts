import { expect } from "chai"
import { join } from "path"

import { LinkModuleCommand } from "../../../../src/commands/link/module"
import {
  getDataDir,
  expectError,
  cleanProject,
  stubExtSources,
  makeTestGarden,
  withDefaultGlobalOpts,
} from "../../../helpers"
import { LinkSourceCommand } from "../../../../src/commands/link/source"
import { Garden } from "../../../../src/garden"
import { LogEntry } from "../../../../src/logger/log-entry"

describe("LinkCommand", () => {
  let garden: Garden
  let log: LogEntry

  describe("LinkModuleCommand", () => {
    const cmd = new LinkModuleCommand()
    const projectRoot = getDataDir("test-project-ext-module-sources")

    beforeEach(async () => {
      garden = await makeTestGarden(projectRoot)
      log = garden.log
      stubExtSources(garden)
    })

    afterEach(async () => {
      await cleanProject(garden.gardenDirPath)
    })

    it("should link external modules", async () => {
      await cmd.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: {
          module: "module-a",
          path: join(projectRoot, "mock-local-path", "module-a"),
        },
        opts: withDefaultGlobalOpts({}),
      })

      const { linkedModuleSources } = await garden.configStore.get()

      expect(linkedModuleSources).to.eql([
        { name: "module-a", path: join(projectRoot, "mock-local-path", "module-a") },
      ])
    })

    it("should handle relative paths", async () => {
      await cmd.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: {
          module: "module-a",
          path: join("mock-local-path", "module-a"),
        },
        opts: withDefaultGlobalOpts({}),
      })

      const { linkedModuleSources } = await garden.configStore.get()

      expect(linkedModuleSources).to.eql([
        { name: "module-a", path: join(projectRoot, "mock-local-path", "module-a") },
      ])
    })

    it("should throw if module to link does not have an external source", async () => {
      await expectError(
        async () => cmd.action({
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
        "parameter",
      )
    })
  })

  describe("LinkSourceCommand", () => {
    const cmd = new LinkSourceCommand()
    const projectRoot = getDataDir("test-project-ext-project-sources")

    beforeEach(async () => {
      garden = await makeTestGarden(projectRoot)
      log = garden.log
      stubExtSources(garden)
    })

    afterEach(async () => {
      await cleanProject(garden.gardenDirPath)
    })

    it("should link external sources", async () => {
      await cmd.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: {
          source: "source-a",
          path: join(projectRoot, "mock-local-path", "source-a"),
        },
        opts: withDefaultGlobalOpts({}),
      })

      const { linkedProjectSources } = await garden.configStore.get()

      expect(linkedProjectSources).to.eql([
        { name: "source-a", path: join(projectRoot, "mock-local-path", "source-a") },
      ])
    })

    it("should handle relative paths", async () => {
      await cmd.action({
        garden,
        log,
        headerLog: log,
        footerLog: log,
        args: {
          source: "source-a",
          path: join("mock-local-path", "source-a"),
        },
        opts: withDefaultGlobalOpts({}),
      })

      const { linkedProjectSources } = await garden.configStore.get()

      expect(linkedProjectSources).to.eql([
        { name: "source-a", path: join(projectRoot, "mock-local-path", "source-a") },
      ])
    })
  })
})
