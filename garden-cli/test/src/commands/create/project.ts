import { expect } from "chai"
import { expectError, makeTestGarden } from "../../../helpers"
import { pick } from "lodash"
import { remove } from "fs-extra"
import { join } from "path"
import * as td from "testdouble"

import { CreateProjectCommand } from "../../../../src/commands/create/project"
import {
  prompts,
  ModuleTypeAndName,
  ModuleTypeMap,
} from "../../../../src/commands/create/prompts"

const replaceRepeatAddModule = (returnVal?: ModuleTypeAndName[]) => {
  if (!returnVal) {
    returnVal = [
      {
        type: "container",
        name: "module-a",
      },
      {
        type: "container",
        name: "module-b",
      },
    ]
  }
  td.replace(prompts, "repeatAddModule", async () => returnVal)
}

const replaceAddConfigForModule = (returnVal?: ModuleTypeMap) => {
  if (!returnVal) {
    returnVal = {
      type: "container",
    }
    td.replace(prompts, "addConfigForModule", async () => returnVal)
  }
}

describe("CreateProjectCommand", () => {

  const projectRoot = join(__dirname, "../../..", "data", "test-project-create-command")
  const cmd = new CreateProjectCommand()

  afterEach(async () => {
    await remove(join(projectRoot, "new-project"))
    td.reset()
  })

  // garden create project
  it("should create a project in the current directory", async () => {
    replaceRepeatAddModule()
    const garden = await makeTestGarden(projectRoot)
    const ctx = garden.getPluginContext()
    const { result } = await cmd.action({
      garden,
      ctx,
      args: { "project-dir": "" },
      opts: { name: "", "module-dirs": undefined },
    })
    const modules = result.moduleConfigs.map(m => pick(m, ["name", "type", "path"]))
    const project = pick(result.projectConfig, ["name", "path"])

    expect({ modules, project }).to.eql({
      modules: [
        { type: "container", name: "module-a", path: join(ctx.projectRoot, "module-a") },
        { type: "container", name: "module-b", path: join(ctx.projectRoot, "module-b") },
      ],
      project: {
        name: "test-project-create-command",
        path: ctx.projectRoot,
      },
    })
  })
  // garden create project new-project
  it("should create a project in directory new-project", async () => {
    replaceRepeatAddModule()
    const garden = await makeTestGarden(projectRoot)
    const ctx = garden.getPluginContext()
    const { result } = await cmd.action({
      garden,
      ctx,
      args: { "project-dir": "new-project" },
      opts: { name: "", "module-dirs": undefined },
    })
    expect(pick(result.projectConfig, ["name", "path"])).to.eql({
      name: "new-project",
      path: join(ctx.projectRoot, "new-project"),
    })
  })
  // garden create project --name=my-project
  it("should optionally create a project named my-project", async () => {
    replaceRepeatAddModule()
    const garden = await makeTestGarden(projectRoot)
    const ctx = garden.getPluginContext()
    const { result } = await cmd.action({
      garden,
      ctx,
      args: { "project-dir": "" },
      opts: { name: "my-project", "module-dirs": undefined },
    })
    expect(pick(result.projectConfig, ["name", "path"])).to.eql({
      name: "my-project",
      path: join(ctx.projectRoot),
    })
  })
  // garden create project --module-dirs=.
  it("should optionally create module configs for modules in current directory", async () => {
    replaceAddConfigForModule()
    const garden = await makeTestGarden(projectRoot)
    const ctx = garden.getPluginContext()
    const { result } = await cmd.action({
      garden,
      ctx,
      args: { "project-dir": "" },
      opts: { name: "", "module-dirs": ["."] },
    })
    expect(result.moduleConfigs.map(m => pick(m, ["name", "type", "path"]))).to.eql([
      { type: "container", name: "module-a", path: join(ctx.projectRoot, "module-a") },
      { type: "container", name: "module-b", path: join(ctx.projectRoot, "module-b") },
    ])
  })
  // garden create project --module-dirs=module-a,module-b
  it("should optionally create module configs for modules in specified directories", async () => {
    replaceAddConfigForModule()
    const garden = await makeTestGarden(projectRoot)
    const ctx = garden.getPluginContext()
    const { result } = await cmd.action({
      garden,
      ctx,
      args: { "project-dir": "" },
      opts: { name: "", "module-dirs": ["module-a", "module-b"] },
    })
    expect(result.moduleConfigs.map(m => pick(m, ["name", "type", "path"]))).to.eql([
      { type: "container", name: "child-module-a", path: join(ctx.projectRoot, "module-a", "child-module-a") },
      { type: "container", name: "child-module-b", path: join(ctx.projectRoot, "module-b", "child-module-b") },
    ])
  })
  // garden create project ___
  it("should throw if project name is invalid when inherited from current directory", async () => {
    replaceRepeatAddModule()
    const garden = await makeTestGarden(projectRoot)
    const ctx = garden.getPluginContext()
    await expectError(
      async () => await cmd.action({
        garden,
        ctx,
        args: { "project-dir": "___" },
        opts: { name: "", "module-dirs": undefined },
      }),
      "configuration",
    )
  })
  // garden create project --name=____
  it("should throw if project name is invalid when explicitly specified", async () => {
    replaceRepeatAddModule()
    const garden = await makeTestGarden(projectRoot)
    const ctx = garden.getPluginContext()
    await expectError(
      async () => await cmd.action({
        garden,
        ctx,
        args: { "project-dir": "" },
        opts: { name: "___", "module-dirs": undefined },
      }),
      "configuration",
    )
  })
})
