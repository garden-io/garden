import { expect } from "chai"
import { combineStates, serviceStates, serviceFromConfig } from "../../../../src/types/service"
import { ServiceConfig } from "../../../../src/config/service"
import { makeTestGardenA } from "../../../helpers"

describe("combineStates", () => {
  it("should return ready if all states are ready", () => {
    const result = combineStates(["ready", "ready"])
    expect(result).to.equal("ready")
  })

  it("should return the common state if all states are the same", () => {
    for (const state of serviceStates) {
      const result = combineStates([state, state, state])
      expect(result).to.equal(state)
    }
  })

  it("should return unhealthy if any state is unhealthy", () => {
    const result = combineStates(["ready", "deploying", "unhealthy"])
    expect(result).to.equal("unhealthy")
  })

  it("should return deploying if no state is unhealthy and any state is deploying", () => {
    const result = combineStates(["ready", "missing", "deploying"])
    expect(result).to.equal("deploying")
  })

  it("should return outdated none of the above applies", () => {
    const result = combineStates(["ready", "missing", "unknown"])
    expect(result).to.equal("outdated")
  })
})

describe("serviceFromConfig", () => {
  it("should propagate the disabled flag from the config", async () => {
    const config: ServiceConfig = {
      name: "test",
      dependencies: [],
      disabled: true,
      hotReloadable: false,
      spec: {},
    }

    const garden = await makeTestGardenA()
    const graph = await garden.getConfigGraph(garden.log)
    const module = await graph.getModule("module-a")
    const service = await serviceFromConfig(graph, module, config)

    expect(service.disabled).to.be.true
  })

  it("should set disabled=true if the module is disabled", async () => {
    const config: ServiceConfig = {
      name: "test",
      dependencies: [],
      disabled: false,
      hotReloadable: false,
      spec: {},
    }

    const garden = await makeTestGardenA()
    const graph = await garden.getConfigGraph(garden.log)
    const module = await graph.getModule("module-a")
    module.disabled = true
    const service = await serviceFromConfig(graph, module, config)

    expect(service.disabled).to.be.true
  })
})
