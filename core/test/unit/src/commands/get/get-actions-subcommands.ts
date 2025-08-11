/*
 * Copyright (C) 2018-2025 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { makeTestGarden, withDefaultGlobalOpts, getDataDir } from "../../../../helpers.js"
import { GetRunsCommand } from "../../../../../src/commands/get/get-runs.js"
import { expect } from "chai"
import {
  getActionsToDetailedOutput,
  getActionsToDetailedWithStateOutput,
  getActionsToSimpleOutput,
  getActionsToSimpleWithStateOutput,
} from "./get-actions.js"
import { actionKinds } from "../../../../../src/actions/types.js"
import { GetBuildsCommand } from "../../../../../src/commands/get/get-builds.js"
import { GetTestsCommand } from "../../../../../src/commands/get/get-tests.js"
import { GetDeploysCommand } from "../../../../../src/commands/get/get-deploys.js"
import type { ActionKind } from "../../../../../src/plugin/action-types.js"
import { sortBy } from "lodash-es"

const getCommandInstance = (
  kind: ActionKind
): GetRunsCommand | GetBuildsCommand | GetTestsCommand | GetDeploysCommand => {
  switch (kind) {
    case "Build":
      return new GetBuildsCommand()
    case "Deploy":
      return new GetDeploysCommand()
    case "Run":
      return new GetRunsCommand()
    case "Test":
      return new GetTestsCommand()
    default:
      return kind satisfies never
  }
}

const testActionNames = {
  Build: ["module-a", "module-b"],
  Run: ["task-a"],
  Deploy: ["service-a"],
  Test: ["module-a-integration"],
}

describe("GetActionsSubCommands", () => {
  const projectRoot = getDataDir("test-project-a")

  actionKinds.forEach((kind) => {
    const command = getCommandInstance(kind)

    describe(`Get${kind}sCommand`, () => {
      it("should run without errors when called without arguments", async () => {
        const garden = await makeTestGarden(projectRoot)
        const log = garden.log

        await command.action({
          garden,
          log,
          args: { names: undefined },
          opts: withDefaultGlobalOpts({ "detail": false, "sort": "name", "include-state": false }),
        })
      })

      it(`should run without errors when called with a list of ${kind} action names`, async () => {
        const garden = await makeTestGarden(projectRoot)
        const log = garden.log

        await command.action({
          garden,
          log,
          args: { names: testActionNames[kind] },
          opts: withDefaultGlobalOpts({ "detail": false, "sort": "name", "include-state": false }),
        })
      })

      it(`should return all ${kind} actions in a project`, async () => {
        const garden = await makeTestGarden(projectRoot)
        const log = garden.log

        const { result } = await command.action({
          garden,
          log,
          args: { names: undefined },
          opts: withDefaultGlobalOpts({ "detail": false, "sort": "name", "include-state": false }),
        })

        const graph = await garden.getConfigGraph({ log, emit: false })
        const expected = sortBy(graph.getActionsByKind(kind).map(getActionsToSimpleOutput), "name")
        expect(command.outputsSchema().validate(result).error).to.be.undefined
        expect(result?.actions).to.eql(expected)
      })

      it(`should return all ${kind} actions in a project with state when --include-state is set`, async () => {
        const garden = await makeTestGarden(projectRoot)
        const log = garden.log

        const { result } = await command.action({
          garden,
          log,
          args: { names: undefined },
          opts: withDefaultGlobalOpts({ "detail": false, "sort": "name", "include-state": true, "kind": "" }),
        })
        const graph = await garden.getResolvedConfigGraph({ log, emit: false })
        const router = await garden.getActionRouter()
        const expected = sortBy(
          await Promise.all(
            graph.getActionsByKind(kind).map(async (a) => getActionsToSimpleWithStateOutput(a, router, graph, log))
          ),
          "name"
        )
        expect(command.outputsSchema().validate(result).error).to.be.undefined
        expect(result).to.eql({ actions: expected })
      })

      it(`should return specific ${kind} actions in a project with state when --include-state is set`, async () => {
        const garden = await makeTestGarden(projectRoot)
        const log = garden.log

        const args = { names: testActionNames[kind] }

        const { result } = await command.action({
          garden,
          log,
          args,
          opts: withDefaultGlobalOpts({ "detail": false, "sort": "name", "include-state": true, "kind": "" }),
        })
        const graph = await garden.getResolvedConfigGraph({ log, emit: false })
        const router = await garden.getActionRouter()
        const expected = sortBy(
          await Promise.all(
            graph
              .getActionsByKind(kind, { names: args.names })
              .map(async (a) => getActionsToSimpleWithStateOutput(a, router, graph, log))
          ),
          "name"
        )
        expect(command.outputsSchema().validate(result).error).to.be.undefined
        expect(result).to.eql({ actions: expected })
      })

      it(`should return all ${kind} actions in a project with additional fields and state when --include-state and --detail are set`, async () => {
        const garden = await makeTestGarden(projectRoot)
        const log = garden.log

        const { result } = await command.action({
          garden,
          log,
          args: { names: undefined },
          opts: withDefaultGlobalOpts({ "detail": true, "sort": "name", "include-state": true, "kind": "" }),
        })
        const graph = await garden.getResolvedConfigGraph({ log, emit: false })
        const router = await garden.getActionRouter()
        const expected = sortBy(
          await Promise.all(
            graph
              .getActionsByKind(kind)
              .map(async (a) => getActionsToDetailedWithStateOutput({ a, garden, router, graph, log }))
          ),
          "name"
        )
        expect(command.outputsSchema().validate(result).error).to.be.undefined
        expect(result).to.eql({ actions: expected })
      })

      it(`should return all ${kind} actions in a project with additional info when --detail is set`, async () => {
        const garden = await makeTestGarden(projectRoot)
        const log = garden.log

        const { result } = await command.action({
          garden,
          log,
          args: { names: undefined },
          opts: withDefaultGlobalOpts({ "detail": true, "sort": "name", "include-state": false, "kind": "" }),
        })
        const graph = await garden.getResolvedConfigGraph({ log, emit: false })
        const expected = sortBy(
          graph.getActionsByKind(kind).map((a) => getActionsToDetailedOutput({ a, garden, graph, log })),
          "name"
        )
        expect(command.outputsSchema().validate(result).error).to.be.undefined
        expect(result).to.eql({ actions: expected })
      })

      it(`should return all ${kind} actions in a project sorted by type when --sort=type is set`, async () => {
        const garden = await makeTestGarden(projectRoot)
        const log = garden.log

        const { result } = await command.action({
          garden,
          log,
          args: { names: undefined },
          opts: withDefaultGlobalOpts({ "detail": false, "sort": "type", "include-state": false, "kind": "" }),
        })
        const graph = await garden.getResolvedConfigGraph({ log, emit: false })
        const expected = sortBy(graph.getActionsByKind(kind).map(getActionsToSimpleOutput), ["type", "name"])
        expect(command.outputsSchema().validate(result).error).to.be.undefined
        expect(result).to.eql({ actions: expected })
      })
    })
  })
})
