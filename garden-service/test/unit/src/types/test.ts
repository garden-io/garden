import { expect } from "chai"
import { makeTestGardenA } from "../../../helpers"
import { TestConfig } from "../../../../src/config/test"
import { testFromConfig } from "../../../../src/types/test"

describe("testFromConfig", () => {
  it("should propagate the disabled flag from the config", async () => {
    const config: TestConfig = {
      name: "test",
      dependencies: [],
      disabled: true,
      spec: {},
      timeout: null,
    }

    const garden = await makeTestGardenA()
    const graph = await garden.getConfigGraph(garden.log)
    const module = await graph.getModule("module-a")
    const test = testFromConfig(module, config)

    expect(test.disabled).to.be.true
  })

  it("should set disabled=true if the module is disabled", async () => {
    const config: TestConfig = {
      name: "test",
      dependencies: [],
      disabled: false,
      spec: {},
      timeout: null,
    }

    const garden = await makeTestGardenA()
    const graph = await garden.getConfigGraph(garden.log)
    const module = await graph.getModule("module-a")
    module.disabled = true
    const test = testFromConfig(module, config)

    expect(test.disabled).to.be.true
  })
})
