import { expect } from "chai"
import {
  expectError,
  makeTestContext,
} from "../../../helpers"
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

const projectRoot = join(__dirname, "../../..", "data", "test-project-create-command")

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

afterEach(async () => {
  await remove(join(projectRoot, "new-project"))
  td.reset()
})

describe("CreateProjectCommand", () => {
  const cmd = new CreateProjectCommand()

  // garden create project
  it("should create a project in the current directory", async () => {
    replaceRepeatAddModule()
    const ctx = await makeTestContext(projectRoot)
    const { result } = await cmd.action(ctx, { "project-dir": "" }, { name: "", "module-dirs": "" })
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
    const ctx = await makeTestContext(projectRoot)
    const { result } = await cmd.action(ctx, { "project-dir": "new-project" }, { name: "", "module-dirs": "" })
    expect(pick(result.projectConfig, ["name", "path"])).to.eql({
      name: "new-project",
      path: join(ctx.projectRoot, "new-project"),
    })
  })
  // garden create project --name=my-project
  it("should optionally create a project named my-project", async () => {
    replaceRepeatAddModule()
    const ctx = await makeTestContext(projectRoot)
    const { result } = await cmd.action(ctx, { "project-dir": "" }, { name: "my-project", "module-dirs": "" })
    expect(pick(result.projectConfig, ["name", "path"])).to.eql({
      name: "my-project",
      path: join(ctx.projectRoot),
    })
  })
  // garden create project --module-dirs=.
  it("should optionally create module configs for modules in current directory", async () => {
    replaceAddConfigForModule()
    const ctx = await makeTestContext(projectRoot)
    const { result } = await cmd.action(ctx, { "project-dir": "" }, { name: "", "module-dirs": "." })
    expect(result.moduleConfigs.map(m => pick(m, ["name", "type", "path"]))).to.eql([
      { type: "container", name: "module-a", path: join(ctx.projectRoot, "module-a") },
      { type: "container", name: "module-b", path: join(ctx.projectRoot, "module-b") },
    ])
  })
  // garden create project --module-dirs=module-a,module-b
  it("should optionally create module configs for modules in specified directories", async () => {
    replaceAddConfigForModule()
    const ctx = await makeTestContext(projectRoot)
    const { result } = await cmd.action(ctx, { "project-dir": "" }, { name: "", "module-dirs": "module-a,module-b" })
    expect(result.moduleConfigs.map(m => pick(m, ["name", "type", "path"]))).to.eql([
      { type: "container", name: "child-module-a", path: join(ctx.projectRoot, "module-a", "child-module-a") },
      { type: "container", name: "child-module-b", path: join(ctx.projectRoot, "module-b", "child-module-b") },
    ])
  })
  // garden create project ___
  it("should throw if project name is invalid when inherited from current directory", async () => {
    replaceRepeatAddModule()
    const ctx = await makeTestContext(projectRoot)
    await expectError(
      async () => await cmd.action(ctx, { "project-dir": "___" }, { name: "", "module-dirs": "" }),
      "configuration",
    )
  })
  // garden create project --name=____
  it("should throw if project name is invalid when explicitly specified", async () => {
    replaceRepeatAddModule()
    const ctx = await makeTestContext(projectRoot)
    await expectError(
      async () => await cmd.action(ctx, { "project-dir": "" }, { name: "___", "module-dirs": "" }),
      "configuration",
    )
  })
  // garden create project --module-dirs=banana
  it("should throw if module parent directory does not exist", async () => {
    replaceRepeatAddModule()
    const ctx = await makeTestContext(projectRoot)
    await expectError(
      async () => await cmd.action(ctx, { "project-dir": "" }, { name: "", "module-dirs": "banana" }),
      "parameter",
    )
  })
})
