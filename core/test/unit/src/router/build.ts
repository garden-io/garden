/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import type { ResolvedBuildAction } from "../../../../src/actions/build.js"
import type { ConfigGraph } from "../../../../src/graph/config-graph.js"
import type { ActionLog } from "../../../../src/logger/log-entry.js"
import type { ActionRouter } from "../../../../src/router/router.js"
import type { TestGarden } from "../../../helpers.js"
import { getRouterTestData } from "./_helpers.js"
import { ACTION_RUNTIME_LOCAL } from "../../../../src/plugin/base.js"

describe("build actions", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let log: ActionLog
  let actionRouter: ActionRouter
  let resolvedBuildAction: ResolvedBuildAction

  before(async () => {
    const data = await getRouterTestData()
    garden = data.garden
    graph = data.graph
    log = data.log
    actionRouter = data.actionRouter
    resolvedBuildAction = data.resolvedBuildAction
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
        detail: {
          runtime: ACTION_RUNTIME_LOCAL,
        },
        outputs: {
          foo: "bar",
          isTestPluginABuildActionBuildHandlerReturn: true,
        },
        state: "ready",
      })
    })
  })
})
