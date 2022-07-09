/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { getMatchingServiceNames } from "../../../../src/commands/helpers"
import { ConfigGraph } from "../../../../src/config-graph"
import { makeTestGardenA } from "../../../helpers"

describe("getDevModeServiceNames", () => {
  let graph: ConfigGraph

  before(async () => {
    const garden = await makeTestGardenA()
    graph = await garden.getConfigGraph({ log: garden.log, emit: false })
  })

  it("should return all services if --dev-mode=* is set", async () => {
    const result = getMatchingServiceNames(["*"], graph)
    expect(result).to.eql(graph.getServices().map((s) => s.name))
  })

  it("should return all services if --dev-mode is set with no value", async () => {
    const result = getMatchingServiceNames([], graph)
    expect(result).to.eql(graph.getServices().map((s) => s.name))
  })

  it("should return specific service if --dev-mode is set with a service name", async () => {
    const result = getMatchingServiceNames(["service-a"], graph)
    expect(result).to.eql(["service-a"])
  })
})
