/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { combineStates, deployStates, serviceFromConfig } from "../../../../src/types/service.js"
import type { ServiceConfig } from "../../../../src/config/service.js"
import { makeTestGardenA } from "../../../helpers.js"

describe("combineStates", () => {
  it("should return ready if all states are ready", () => {
    const result = combineStates(["ready", "ready"])
    expect(result).to.equal("ready")
  })

  it("should return the common state if all states are the same", () => {
    for (const state of deployStates) {
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

      spec: {},
    }

    const garden = await makeTestGardenA()
    const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const module = graph.getModule("module-a")
    const service = serviceFromConfig(graph.moduleGraph, module, config)

    expect(service.disabled).to.be.true
  })

  it("should set disabled=true if the module is disabled", async () => {
    const config: ServiceConfig = {
      name: "test",
      dependencies: [],
      disabled: false,

      spec: {},
    }

    const garden = await makeTestGardenA()
    const graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    const module = graph.getModule("module-a")
    module.disabled = true
    const service = serviceFromConfig(graph.moduleGraph, module, config)

    expect(service.disabled).to.be.true
  })
})
