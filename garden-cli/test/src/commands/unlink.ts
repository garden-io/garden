import { expect } from "chai"
import { join } from "path"

import { LinkModuleCommand } from "../../../src/commands/link/module"
import { UnlinkModuleCommand } from "../../../src/commands/unlink/module"
import {
  getDataDir,
  stubExtSources,
  cleanProject,
  makeTestGarden,
} from "../../helpers"
import { LinkSourceCommand } from "../../../src/commands/link/source"
import { UnlinkSourceCommand } from "../../../src/commands/unlink/source"
import { Garden } from "../../../src/garden"

describe("UnlinkCommand", () => {
  let garden: Garden

  describe("UnlinkModuleCommand", () => {
    const projectRoot = getDataDir("test-project-ext-module-sources")
    const linkCmd = new LinkModuleCommand()
    const unlinkCmd = new UnlinkModuleCommand()

    beforeEach(async () => {
      garden = await makeTestGarden(projectRoot)
      stubExtSources(garden)

      await linkCmd.action({
        garden,
        args: {
          module: "module-a",
          path: join(projectRoot, "mock-local-path", "module-a"),
        },
        opts: {},
      })
      await linkCmd.action({
        garden,
        args: {
          module: "module-b",
          path: join(projectRoot, "mock-local-path", "module-b"),
        },
        opts: {},
      })
      await linkCmd.action({
        garden,
        args: {
          module: "module-c",
          path: join(projectRoot, "mock-local-path", "module-c"),
        },
        opts: {},
      })
    })

    afterEach(async () => {
      await cleanProject(projectRoot)
    })

    it("should unlink the provided modules", async () => {
      await unlinkCmd.action({
        garden,
        args: { module: ["module-a", "module-b"] },
        opts: { all: false },
      })
      const { linkedModuleSources } = await garden.localConfigStore.get()
      expect(linkedModuleSources).to.eql([
        { name: "module-c", path: join(projectRoot, "mock-local-path", "module-c") },
      ])
    })

    it("should unlink all modules", async () => {
      await unlinkCmd.action({
        garden,
        args: { module: undefined },
        opts: { all: true },
      })
      const { linkedModuleSources } = await garden.localConfigStore.get()
      expect(linkedModuleSources).to.eql([])
    })
  })

  describe("UnlinkSourceCommand", () => {
    const projectRoot = getDataDir("test-project-ext-project-sources")
    const linkCmd = new LinkSourceCommand()
    const unlinkCmd = new UnlinkSourceCommand()

    beforeEach(async () => {
      garden = await makeTestGarden(projectRoot)
      stubExtSources(garden)

      await linkCmd.action({
        garden,
        args: {
          source: "source-a",
          path: join(projectRoot, "mock-local-path", "source-a"),
        },
        opts: {},
      })
      await linkCmd.action({
        garden,
        args: {
          source: "source-b",
          path: join(projectRoot, "mock-local-path", "source-b"),
        },
        opts: {},
      })
      await linkCmd.action({
        garden,
        args: {
          source: "source-c",
          path: join(projectRoot, "mock-local-path", "source-c"),
        },
        opts: {},
      })
    })

    afterEach(async () => {
      await cleanProject(projectRoot)
    })

    it("should unlink the provided sources", async () => {
      await unlinkCmd.action({
        garden,
        args: { source: ["source-a", "source-b"] },
        opts: { all: false },
      })
      const { linkedProjectSources } = await garden.localConfigStore.get()
      expect(linkedProjectSources).to.eql([
        { name: "source-c", path: join(projectRoot, "mock-local-path", "source-c") },
      ])
    })

    it("should unlink all sources", async () => {
      await unlinkCmd.action({
        garden,
        args: { source: undefined },
        opts: { all: true },
      })
      const { linkedProjectSources } = await garden.localConfigStore.get()
      expect(linkedProjectSources).to.eql([])
    })
  })
})
