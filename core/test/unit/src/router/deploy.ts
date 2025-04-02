/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { Stream } from "ts-stream"
import type { ResolvedDeployAction } from "../../../../src/actions/deploy.js"
import type { ConfigGraph } from "../../../../src/graph/config-graph.js"
import type { ActionLog } from "../../../../src/logger/log-entry.js"
import type { ActionRouter } from "../../../../src/router/router.js"
import type { DeployLogEntry } from "../../../../src/types/service.js"
import type { TestGarden } from "../../../helpers.js"
import { expectError } from "../../../helpers.js"
import { getRouterTestData } from "./_helpers.js"

describe("deploy actions", () => {
  let garden: TestGarden
  let graph: ConfigGraph
  let log: ActionLog
  let actionRouter: ActionRouter
  let resolvedDeployAction: ResolvedDeployAction
  let returnWrongOutputsCfgKey: string

  before(async () => {
    const data = await getRouterTestData()
    garden = data.garden
    graph = data.graph
    log = data.log
    actionRouter = data.actionRouter
    resolvedDeployAction = data.resolvedDeployAction
    returnWrongOutputsCfgKey = data.returnWrongOutputsCfgKey
  })

  after(async () => {
    garden.close()
  })

  afterEach(() => {
    resolvedDeployAction._config[returnWrongOutputsCfgKey] = false
  })

  describe("deploy.getStatus", () => {
    it("should correctly call the corresponding plugin handler", async () => {
      const { result } = await actionRouter.deploy.getStatus({
        log,
        action: resolvedDeployAction,
        graph,
      })
      expect(result).to.eql({
        detail: {
          forwardablePorts: [],
          state: "ready",
          outputs: {},
          detail: {},
          mode: "default",
        },
        outputs: { base: "ok", foo: "ok" },
        state: "ready",
      })
    })

    it("should throw if the outputs don't match the service outputs schema of the plugin", async () => {
      resolvedDeployAction._config[returnWrongOutputsCfgKey] = true
      await expectError(
        () =>
          actionRouter.deploy.getStatus({
            log,
            action: resolvedDeployAction,
            graph,
          }),
        { contains: ["Error validating runtime action outputs from Deploy 'service-a'", "foo must be a string"] }
      )
    })
  })

  describe("deploy.deploy", () => {
    it("should correctly call the corresponding plugin handler", async () => {
      const { result } = await actionRouter.deploy.deploy({
        log,
        action: resolvedDeployAction,
        graph,
        force: true,
      })
      expect(result).to.eql({
        detail: { forwardablePorts: [], state: "ready", outputs: {}, detail: {}, mode: "default" },
        outputs: { base: "ok", foo: "ok" },
        state: "ready",
      })
    })

    it("should throw if the outputs don't match the service outputs schema of the plugin", async () => {
      resolvedDeployAction._config[returnWrongOutputsCfgKey] = true
      await expectError(
        () =>
          actionRouter.deploy.deploy({
            log,
            action: resolvedDeployAction,
            graph,
            force: true,
          }),
        { contains: ["Error validating runtime action outputs from Deploy 'service-a'", "foo must be a string"] }
      )
    })
  })

  describe("deploy.delete", () => {
    it("should correctly call the corresponding plugin handler", async () => {
      const { result } = await actionRouter.deploy.delete({ log, action: resolvedDeployAction, graph })
      expect(result).to.eql({
        state: "ready",
        detail: {
          forwardablePorts: [],
          outputs: {},
          detail: {},
          state: "ready",
          mode: "default",
        },
        outputs: {},
      })
    })
  })

  describe("deploy.exec", () => {
    it("should correctly call the corresponding plugin handler", async () => {
      const executedAction = await garden.executeAction({ action: resolvedDeployAction, log, graph })
      const { result } = await actionRouter.deploy.exec({
        log,
        action: executedAction,
        graph,
        command: ["foo"],
        interactive: false,
      })
      expect(result).to.eql({ code: 0, output: "bla bla" })
    })
  })

  describe("deploy.getLogs", () => {
    it("should correctly call the corresponding plugin handler", async () => {
      const stream = new Stream<DeployLogEntry>()
      const { result } = await actionRouter.deploy.getLogs({
        log,
        action: resolvedDeployAction,
        graph,
        stream,
        follow: false,
        tail: -1,
      })
      expect(result).to.eql({})
    })
  })
})
