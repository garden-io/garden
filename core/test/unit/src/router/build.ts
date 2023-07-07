/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { ResolvedBuildAction } from "../../../../src/actions/build"
import { ConfigGraph } from "../../../../src/graph/config-graph"
import { ActionLog } from "../../../../src/logger/log-entry"
import { ActionRouter } from "../../../../src/router/router"
import { GardenModule } from "../../../../src/types/module"
import { TestGarden } from "../../../helpers"
import { getRouterTestData } from "./_helpers"

describe("build actions", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let log: ActionLog
  let actionRouter: ActionRouter
  let resolvedBuildAction: ResolvedBuildAction
  let module: GardenModule

  before(async () => {
    const data = await getRouterTestData()
    garden = data.garden
    graph = data.graph
    log = data.log
    actionRouter = data.actionRouter
    resolvedBuildAction = data.resolvedBuildAction
    module = data.module
  })

  after(async () => {
    garden.close()
  })

  describe("build.getStatus", () => {
    it("should correctly call the corresponding plugin handler", async () => {
      const { result } = await actionRouter.build.getStatus({ log, action: resolvedBuildAction, graph })
      expect(result.outputs.foo).to.eql("bar")
    })
  })

  describe("build", () => {
    it("should correctly call the corresponding plugin handler", async () => {
      const { result } = await actionRouter.build.build({ log, action: resolvedBuildAction, graph })
      expect(result).to.eql({
        detail: {},
        outputs: {
          foo: "bar",
          isTestPluginABuildActionBuildHandlerReturn: true,
        },
        state: "ready",
      })
    })
  })
})
