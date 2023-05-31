/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { expect } from "chai"
import { getActionState, getRelativeActionConfigPath } from "../../../../../src/actions/helpers"
import { GetActionsCommand } from "../../../../../src/commands/get/get-actions"
import { getDataDir, makeTestGarden, withDefaultGlobalOpts } from "../../../../helpers"

describe("GetActionsCommand", () => {
  const projectRoot = getDataDir("test-project-b")

  it("should run without errors when called without arguments", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetActionsCommand()

    await command.action({
      garden,
      log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "detail": false, "sort": "kind", "include-state": false, "kind": "" }),
    })
  })

  it("should run without errors when called with a list of action names", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetActionsCommand()

    await command.action({
      garden,
      log,
      args: { names: ["task-a"] },
      opts: withDefaultGlobalOpts({ "detail": false, "sort": "name", "include-state": false, "kind": "" }),
    })
  })

  it("should return all actions in a project", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetActionsCommand()

    const { result } = await command.action({
      garden,
      log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "detail": false, "sort": "name", "include-state": false, "kind": "" }),
    })

    const graph = await garden.getConfigGraph({ log, emit: false })
    const expected = graph.getActions().map((d) => {
      return { name: d.name, kind: d.kind, type: d.type }
    })

    expect(command.outputsSchema().validate(result).error).to.be.undefined
    expect(result?.actions).to.eql(expected)
  })

  it("should return all actions in a project with additional info when --detail is set", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetActionsCommand()

    const { result } = await command.action({
      garden,
      log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "detail": true, "sort": "name", "include-state": false, "kind": "" }),
    })
    const graph = await garden.getConfigGraph({ log, emit: false })
    const expected = graph.getActions().map((a) => {
      return {
        name: a.name,
        kind: a.kind,
        type: a.type,
        path: getRelativeActionConfigPath(garden.projectRoot, a),
        dependencies: a.getDependencies().map((d) => d.key()),
        dependents: graph.getDependants({ kind: a.kind, name: a.name, recursive: false }).map((d) => d.key()),
        disabled: a.isDisabled(),
        moduleName: a.moduleName() ?? undefined,
      }
    })
    expect(command.outputsSchema().validate(result).error).to.be.undefined
    expect(result).to.eql({ actions: expected })
  })

  it("should return all actions in a project with state when --include-state is set", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetActionsCommand()

    const { result } = await command.action({
      garden,
      log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "detail": false, "sort": "name", "include-state": true, "kind": "" }),
    })
    const graph = await garden.getResolvedConfigGraph({ log, emit: false })
    const router = await garden.getActionRouter()
    const expected = await Bluebird.map(graph.getActions(), async (a) => {
      return {
        name: a.name,
        kind: a.kind,
        type: a.type,
        state: await getActionState(a, router, graph, log),
      }
    })
    expect(command.outputsSchema().validate(result).error).to.be.undefined
    expect(result).to.eql({ actions: expected })
  })

  it("should return specific actions in a project with state when --include-state is set", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetActionsCommand()

    const args = { names: ["task-a", "module-b"] }

    const { result } = await command.action({
      garden,
      log,
      args,
      opts: withDefaultGlobalOpts({ "detail": false, "sort": "name", "include-state": true, "kind": "" }),
    })
    const graph = await garden.getResolvedConfigGraph({ log, emit: false })
    const router = await garden.getActionRouter()
    const expected = await Bluebird.map(graph.getActions({ refs: args.names }), async (a) => {
      return {
        name: a.name,
        kind: a.kind,
        type: a.type,
        state: await getActionState(a, router, graph, log),
      }
    })
    expect(command.outputsSchema().validate(result).error).to.be.undefined
    expect(result).to.eql({ actions: expected })
  })

  it("should return all actions in a project with additional fields and state when --include-state and --detail are set", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetActionsCommand()

    const { result } = await command.action({
      garden,
      log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "detail": true, "sort": "name", "include-state": true, "kind": "" }),
    })
    const graph = await garden.getResolvedConfigGraph({ log, emit: false })
    const router = await garden.getActionRouter()
    const expected = await Bluebird.map(graph.getActions(), async (a) => {
      return {
        name: a.name,
        kind: a.kind,
        type: a.type,
        path: getRelativeActionConfigPath(garden.projectRoot, a),
        state: await getActionState(a, router, graph, log),
        dependencies: a.getDependencies().map((d) => d.key()),
        dependents: graph.getDependants({ kind: a.kind, name: a.name, recursive: false }).map((d) => d.key()),
        disabled: a.isDisabled(),
        moduleName: a.moduleName() ?? undefined,
      }
    })
    expect(command.outputsSchema().validate(result).error).to.be.undefined
    expect(result).to.eql({ actions: expected })
  })

  it("should return all actions of specific kind in a project when --kind is set", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetActionsCommand()

    const { result } = await command.action({
      garden,
      log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "detail": false, "sort": "name", "include-state": false, "kind": "deploy" }),
    })
    const graph = await garden.getResolvedConfigGraph({ log, emit: false })
    const router = await garden.getActionRouter()
    const expected = graph.getDeploys().map((d) => {
      return { name: d.name, kind: d.kind, type: d.type }
    })
    expect(command.outputsSchema().validate(result).error).to.be.undefined
    expect(result).to.eql({ actions: expected })
  })
})
