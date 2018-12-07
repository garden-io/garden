import { expect } from "chai"
import { combineStates, serviceStates } from "../../../src/types/service"

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
