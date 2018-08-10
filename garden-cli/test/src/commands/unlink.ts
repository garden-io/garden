import { expect } from "chai"
import { join } from "path"
import * as td from "testdouble"

import { LinkModuleCommand } from "../../../src/commands/link/module"
import { UnlinkModuleCommand } from "../../../src/commands/unlink/module"
import {
  makeTestContext,
  getDataDir,
  stubExtSources,
  cleanProject,
} from "../../helpers"
import { PluginContext } from "../../../src/plugin-context"
import { LinkSourceCommand } from "../../../src/commands/link/source"
import { UnlinkSourceCommand } from "../../../src/commands/unlink/source"

describe("UnlinkCommand", () => {
  describe("UnlinkModuleCommand", () => {
    const projectRoot = getDataDir("test-project-ext-module-sources")
    const linkCmd = new LinkModuleCommand()
    const unlinkCmd = new UnlinkModuleCommand()
    let ctx: PluginContext

    beforeEach(async () => {
      ctx = await makeTestContext(projectRoot)
      stubExtSources(ctx)

      await linkCmd.action(ctx, {
        module: "module-a",
        path: join(projectRoot, "mock-local-path", "module-a"),
      })
      await linkCmd.action(ctx, {
        module: "module-b",
        path: join(projectRoot, "mock-local-path", "module-b"),
      })
      await linkCmd.action(ctx, {
        module: "module-c",
        path: join(projectRoot, "mock-local-path", "module-c"),
      })
    })

    afterEach(async () => {
      td.reset()
      await cleanProject(projectRoot)
    })

    it("should unlink the provided modules", async () => {
      await unlinkCmd.action(ctx, { module: ["module-a", "module-b"] }, { all: false })
      const { linkedModuleSources } = await ctx.localConfigStore.get()
      expect(linkedModuleSources).to.eql([
        { name: "module-c", path: join(projectRoot, "mock-local-path", "module-c") },
      ])
    })

    it("should unlink all modules", async () => {
      await unlinkCmd.action(ctx, { module: undefined }, { all: true })
      const { linkedModuleSources } = await ctx.localConfigStore.get()
      expect(linkedModuleSources).to.eql([])
    })
  })

  describe("UnlinkSourceCommand", () => {
    const projectRoot = getDataDir("test-project-ext-project-sources")
    const linkCmd = new LinkSourceCommand()
    const unlinkCmd = new UnlinkSourceCommand()
    let ctx: PluginContext

    beforeEach(async () => {
      ctx = await makeTestContext(projectRoot)
      stubExtSources(ctx)

      await linkCmd.action(ctx, {
        source: "source-a",
        path: join(projectRoot, "mock-local-path", "source-a"),
      })
      await linkCmd.action(ctx, {
        source: "source-b",
        path: join(projectRoot, "mock-local-path", "source-b"),
      })
      await linkCmd.action(ctx, {
        source: "source-c",
        path: join(projectRoot, "mock-local-path", "source-c"),
      })
    })

    afterEach(async () => {
      td.reset()
      await cleanProject(projectRoot)
    })

    it("should unlink the provided sources", async () => {
      await unlinkCmd.action(ctx, { source: ["source-a", "source-b"] }, { all: false })
      const { linkedProjectSources } = await ctx.localConfigStore.get()
      expect(linkedProjectSources).to.eql([
        { name: "source-c", path: join(projectRoot, "mock-local-path", "source-c") },
      ])
    })

    it("should unlink all sources", async () => {
      await unlinkCmd.action(ctx, { source: undefined }, { all: true })
      const { linkedProjectSources } = await ctx.localConfigStore.get()
      expect(linkedProjectSources).to.eql([])
    })
  })
})
