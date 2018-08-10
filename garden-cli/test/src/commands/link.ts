import { expect } from "chai"
import { join } from "path"
import * as td from "testdouble"

import { LinkModuleCommand } from "../../../src/commands/link/module"
import {
  makeTestContext,
  getDataDir,
  expectError,
  cleanProject,
  stubExtSources,
} from "../../helpers"
import { PluginContext } from "../../../src/plugin-context"
import { LinkSourceCommand } from "../../../src/commands/link/source"

describe("LinkCommand", () => {
  let ctx: PluginContext

  describe("LinkModuleCommand", () => {
    const cmd = new LinkModuleCommand()
    const projectRoot = getDataDir("test-project-ext-module-sources")

    beforeEach(async () => {
      ctx = await makeTestContext(projectRoot)
      stubExtSources(ctx)
    })

    afterEach(async () => {
      td.reset()
      await cleanProject(projectRoot)
    })

    it("should link external modules", async () => {
      await cmd.action(ctx, {
        module: "module-a",
        path: join(projectRoot, "mock-local-path", "module-a"),
      })

      const { linkedModuleSources } = await ctx.localConfigStore.get()

      expect(linkedModuleSources).to.eql([
        { name: "module-a", path: join(projectRoot, "mock-local-path", "module-a") },
      ])
    })

    it("should handle relative paths", async () => {
      await cmd.action(ctx, {
        module: "module-a",
        path: join("mock-local-path", "module-a"),
      })

      const { linkedModuleSources } = await ctx.localConfigStore.get()

      expect(linkedModuleSources).to.eql([
        { name: "module-a", path: join(projectRoot, "mock-local-path", "module-a") },
      ])
    })

    it("should throw if module to link does not have an external source", async () => {
      await expectError(
        async () => (
          await cmd.action(ctx, { module: "banana", path: "" })
        ),
        "parameter",
      )
    })
  })

  describe("LinkSourceCommand", () => {
    const cmd = new LinkSourceCommand()
    const projectRoot = getDataDir("test-project-ext-project-sources")

    beforeEach(async () => {
      ctx = await makeTestContext(projectRoot)
      stubExtSources(ctx)
    })

    afterEach(async () => {
      td.reset()
      await cleanProject(projectRoot)
    })

    it("should link external sources", async () => {
      await cmd.action(ctx, {
        source: "source-a",
        path: join(projectRoot, "mock-local-path", "source-a"),
      })

      const { linkedProjectSources } = await ctx.localConfigStore.get()

      expect(linkedProjectSources).to.eql([
        { name: "source-a", path: join(projectRoot, "mock-local-path", "source-a") },
      ])
    })

    it("should handle relative paths", async () => {
      await cmd.action(ctx, {
        source: "source-a",
        path: join("mock-local-path", "source-a"),
      })

      const { linkedProjectSources } = await ctx.localConfigStore.get()

      expect(linkedProjectSources).to.eql([
        { name: "source-a", path: join(projectRoot, "mock-local-path", "source-a") },
      ])
    })
  })
})
