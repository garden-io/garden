import { expect } from "chai"
import {
  expectError,
  makeTestGarden,
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

describe("CreateModuleCommand", () => {
  afterEach(async () => {
    await remove(join(projectRoot, "new-module"))
  })

  const cmd = new CreateModuleCommand()
  // garden create module
  it("should add a module config to the current directory", async () => {
    replaceAddConfigForModule()
    const garden = await makeTestGarden(projectRoot)
    const { result } = await cmd.action({ garden, args: { "module-dir": "" }, opts: { name: "", type: "" } })
    expect(pick(result.module, ["name", "type", "path"])).to.eql({
      name: "test-project-create-command",
      type: "container",
      path: garden.projectRoot,
    })
  })
  // garden create module new-module
  it("should add a module config to new-module directory", async () => {
    replaceAddConfigForModule()
    const garden = await makeTestGarden(projectRoot)
    const { result } = await cmd.action({
      garden,
      args: { "module-dir": "new-module" },
      opts: { name: "", type: "" },
    })
    expect(pick(result.module, ["name", "type", "path"])).to.eql({
      name: "new-module",
      type: "container",
      path: join(garden.projectRoot, "new-module"),
    })
  })
  // garden create module --name=my-module
  it("should optionally name the module my-module", async () => {
    replaceAddConfigForModule()
    const garden = await makeTestGarden(projectRoot)
    const { result } = await cmd.action({
      garden,
      args: { "module-dir": "" },
      opts: { name: "my-module", type: "" },
    })
    expect(pick(result.module, ["name", "type", "path"])).to.eql({
      name: "my-module",
      type: "container",
      path: garden.projectRoot,
    })
  })
  // garden create module --type=google-cloud-function
  it("should optionally create a module of a specific type (without prompting)", async () => {
    const garden = await makeTestGarden(projectRoot)
    const { result } = await cmd.action({
      garden,
      args: { "module-dir": "" },
      opts: { name: "", type: "google-cloud-function" },
    })
    expect(pick(result.module, ["name", "type", "path"])).to.eql({
      name: "test-project-create-command",
      type: "google-cloud-function",
      path: garden.projectRoot,
    })
  })
  // garden create module ___
  it("should throw if module name is invalid when inherited from current directory", async () => {
    replaceAddConfigForModule()
    const garden = await makeTestGarden(projectRoot)
    await expectError(
      async () => await cmd.action({ garden, args: { "module-dir": "___" }, opts: { name: "", type: "" } }),
      "configuration",
    )
  })
  // garden create --name=___
  it("should throw if module name is invalid when explicitly specified", async () => {
    replaceAddConfigForModule()
    const garden = await makeTestGarden(projectRoot)
    await expectError(
      async () => await cmd.action({ garden, args: { "module-dir": "" }, opts: { name: "___", type: "" } }),
      "configuration",
    )
  })
  // garden create module --type=banana
  it("should throw if invalid type provided", async () => {
    replaceAddConfigForModule()
    const garden = await makeTestGarden(projectRoot)
    await expectError(
      async () => await cmd.action({ garden, args: { "module-dir": "" }, opts: { name: "", type: "banana" } }),
      "parameter",
    )
  })
})
