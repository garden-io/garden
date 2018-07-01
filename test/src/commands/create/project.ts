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
  it("should scaffold a valid project in the current directory by repeatedly prompting for modules", async () => {
    replaceRepeatAddModule()
    const ctx = await makeTestContext(projectRoot)
    const { result } = await cmd.action(ctx, { projectName: "" }, { new: false, "module-dirs": "" })
    const modules = result.moduleConfigs.map(m => pick(m, ["name", "type"]))
    const project = pick(result.projectConfig, ["name", "path"])
    expect({ modules, project }).to.eql({
      modules: [
        { type: "container", name: "module-a" },
        { type: "container", name: "module-b" },
      ],
      project: {
        name: "test-project-create-command",
        path: ctx.projectRoot,
      },
    })
  })
  // garden create project my-project
  it("should optionally set a custom project name", async () => {
    replaceRepeatAddModule()
    const ctx = await makeTestContext(projectRoot)
    const { result } = await cmd.action(ctx, { projectName: "my-project" }, { new: false, "module-dirs": "" })
    const projectName = result.projectConfig.name
    expect(projectName).to.equal("my-project")
  })
  // garden create project new-project --new
  it("should optionally create a project in a new directory", async () => {
    replaceRepeatAddModule()
    const ctx = await makeTestContext(projectRoot)
    const { result } = await cmd.action(ctx, { projectName: "new-project" }, { new: true, "module-dirs": "" })

    expect(result.projectConfig.path).to.equal(join(ctx.projectRoot, "new-project"))
  })
  // garden create project --module-dirs=.
  it("should optionally create module configs for modules in current directory", async () => {
    replaceAddConfigForModule()
    const ctx = await makeTestContext(projectRoot)
    const { result } = await cmd.action(ctx, { projectName: "" }, { new: false, "module-dirs": "." })
    const modules = result.moduleConfigs.map(m => m.name)
    expect(modules).to.eql(["module-a", "module-b"])
  })
  // garden create project --module-dirs=module-a,module-b
  it("should optionally create module configs for modules in specific directories", async () => {
    replaceAddConfigForModule()
    const ctx = await makeTestContext(projectRoot)
    const { result } = await cmd.action(ctx, { projectName: "" }, { new: false, "module-dirs": "module-a,module-b" })
    const modules = result.moduleConfigs.map(m => m.name)
    expect(modules).to.eql(["child-module-a", "child-module-b", "child-module-c", "child-module-d"])
  })
  // garden create project ___
  it("should throw if project name is invalid", async () => {
    replaceRepeatAddModule()
    const ctx = await makeTestContext(projectRoot)
    await expectError(
      async () => await cmd.action(ctx, { projectName: "___" }, { new: false, "module-dirs": "" }),
      "configuration",
    )
  })
  // garden create project --module-dirs=banana
  it("should throw if module parent directory does not exist", async () => {
    replaceRepeatAddModule()
    const ctx = await makeTestContext(projectRoot)
    await expectError(
      async () => await cmd.action(ctx, { projectName: "" }, { new: false, "module-dirs": "banana" }),
      "parameter",
    )
  })
  // garden create project --new
  it("should throw if new option provided but project name is missing", async () => {
    replaceRepeatAddModule()
    const ctx = await makeTestContext(projectRoot)
    await expectError(
      async () => await cmd.action(ctx, { projectName: "" }, { new: true, "module-dirs": "" }),
      "parameter",
    )
  })
  // garden create project module-a --new
  it("should throw if new option provided but directory with project name already exists", async () => {
    replaceRepeatAddModule()
    const ctx = await makeTestContext(projectRoot)
    await expectError(
      async () => await cmd.action(ctx, { projectName: "module-a" }, { new: true, "module-dirs": "" }),
      "parameter",
    )
  })
})
