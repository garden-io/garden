import { expect } from "chai"
import {
  expectError,
  makeTestContext,
} from "../../../helpers"
import { pick } from "lodash"
import { join } from "path"
import * as td from "testdouble"

import { CreateModuleCommand } from "../../../../src/commands/create/module"
import {
  prompts,
  ModuleTypeMap,
} from "../../../../src/commands/create/prompts"
import { remove } from "fs-extra"

const projectRoot = join(__dirname, "../../..", "data", "test-project-create-command")

const replaceAddConfigForModule = (returnVal?: ModuleTypeMap) => {
  if (!returnVal) {
    returnVal = {
      type: "container",
    }
    td.replace(prompts, "addConfigForModule", async () => returnVal)
  }
}

afterEach(async () => {
  await remove(join(projectRoot, "new-module"))
  td.reset()
})

describe("CreateModuleCommand", () => {
  const cmd = new CreateModuleCommand()
  // garden create module
  it("should add a valid module config to the current directory", async () => {
    replaceAddConfigForModule()
    const ctx = await makeTestContext(projectRoot)
    const { result } = await cmd.action(ctx, { moduleName: "" }, { new: false, type: "" })
    expect(pick(result.module, ["name", "type", "path"])).to.eql({
      name: "test-project-create-command",
      type: "container",
      path: ctx.projectRoot,
    })
  })
  // garden create module my-module
  it("should optionally set a custom module name", async () => {
    replaceAddConfigForModule()
    const ctx = await makeTestContext(projectRoot)
    const { result } = await cmd.action(ctx, { moduleName: "my-module" }, { new: false, type: "" })
    expect(result.module!.name).to.equal("my-module")
  })
  // garden create module --type=function
  it("should optionally create a module of a specific type (without prompt)", async () => {
    const ctx = await makeTestContext(projectRoot)
    const { result } = await cmd.action(ctx, { moduleName: "" }, { new: false, type: "function" })
    expect(result.module!.type).to.equal("function")
  })
  // garden create module --new
  it("should optionally create a module in a new directory", async () => {
    replaceAddConfigForModule()
    const ctx = await makeTestContext(projectRoot)
    const { result } = await cmd.action(ctx, { moduleName: "new-module" }, { new: true, type: "" })
    expect(result.module!.path).to.equal(join(ctx.projectRoot, "new-module"))
  })
  // garden create module ___
  it("should throw if module name is invalid", async () => {
    replaceAddConfigForModule()
    const ctx = await makeTestContext(projectRoot)
    await expectError(
      async () => await cmd.action(ctx, { moduleName: "___" }, { new: false, type: "" }),
      "configuration",
    )
  })
  // garden create module --new
  it("should throw if new option provided but module name is missing", async () => {
    replaceAddConfigForModule()
    const ctx = await makeTestContext(projectRoot)
    await expectError(
      async () => await cmd.action(ctx, { moduleName: "" }, { new: true, type: "" }),
      "parameter",
    )
  })
  // garden create module module-a --new
  it("should throw if new option provided but directory with module name already exists", async () => {
    replaceAddConfigForModule()
    const ctx = await makeTestContext(projectRoot)
    await expectError(
      async () => await cmd.action(ctx, { moduleName: "module-a" }, { new: true, type: "" }),
      "parameter",
    )
  })
  // garden create module --type=banana
  it("should throw if invalid type provided", async () => {
    replaceAddConfigForModule()
    const ctx = await makeTestContext(projectRoot)
    await expectError(
      async () => await cmd.action(ctx, { moduleName: "" }, { new: false, type: "banana" }),
      "parameter",
    )
  })
})
