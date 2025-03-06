/*
 * Copyright (C) 2018-2024 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import { getActionState, getRelativeActionConfigPath } from "../../../../../src/actions/helpers.js"
import { GetActionsCommand } from "../../../../../src/commands/get/get-actions.js"
import type { TestGarden } from "../../../../helpers.js"
import { getDataDir, makeTestGarden, withDefaultGlobalOpts } from "../../../../helpers.js"
import type { Action } from "../../../../../src/actions/types.js"
import type { ActionRouter } from "../../../../../src/router/router.js"
import type { ResolvedConfigGraph } from "../../../../../src/graph/config-graph.js"
import type { Log } from "../../../../../src/logger/log-entry.js"
import { sortBy } from "lodash-es"
import { gardenEnv } from "../../../../../src/constants.js"

export const getActionsToSimpleOutput = (d) => {
  return { name: d.name, kind: d.kind, type: d.type }
}

export const getActionsToSimpleWithStateOutput = async (
  a: Action,
  router: ActionRouter,
  graph: ResolvedConfigGraph,
  log: Log
) => {
  {
    return {
      name: a.name,
      kind: a.kind,
      type: a.type,
      state: await getActionState(a, router, graph, log),
    }
  }
}

export const getActionsToDetailedOutput = (a: Action, garden: TestGarden, graph: ResolvedConfigGraph) => {
  return {
    name: a.name,
    kind: a.kind,
    type: a.type,
    path: getRelativeActionConfigPath(garden.projectRoot, a),
    dependencies: a
      .getDependencies()
      .map((d) => d.key())
      .sort(),
    dependents: graph
      .getDependants({ kind: a.kind, name: a.name, recursive: false })
      .map((d) => d.key())
      .sort(),
    disabled: a.isDisabled(),
    version: a.getFullVersion(),
    allowPublish: a.getConfig().allowPublish ?? undefined,
    publishId: a.getConfig().spec.publishId ?? undefined,
    moduleName: a.moduleName() ?? undefined,
  }
}

export const getActionsToDetailedWithStateOutput = async (
  a: Action,
  garden: TestGarden,
  router: ActionRouter,
  graph: ResolvedConfigGraph,
  log: Log
) => {
  {
    return {
      name: a.name,
      kind: a.kind,
      type: a.type,
      path: getRelativeActionConfigPath(garden.projectRoot, a),
      state: await getActionState(a, router, graph, log),
      dependencies: a
        .getDependencies()
        .map((d) => d.key())
        .sort(),
      dependents: graph
        .getDependants({ kind: a.kind, name: a.name, recursive: false })
        .map((d) => d.key())
        .sort(),
      disabled: a.isDisabled(),
      version: a.getFullVersion(),
      allowPublish: a.getConfig().allowPublish ?? undefined,
      publishId: a.getConfig().spec.publishId ?? undefined,
      moduleName: a.moduleName() ?? undefined,
    }
  }
}

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

    const graph = await garden.getResolvedConfigGraph({ log, emit: false })
    const expected = sortBy(graph.getActions().map(getActionsToSimpleOutput), "name")

    expect(command.outputsSchema().validate(result).error).to.be.undefined
    expect(result?.actions).to.eql(expected)
  })

  it("should return specific actions by reference in a project", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetActionsCommand()

    const { result } = await command.action({
      garden,
      log,
      args: { names: ["run.task-a", "build.module-b"] },
      opts: withDefaultGlobalOpts({ "detail": false, "sort": "name", "include-state": false, "kind": "" }),
    })

    const expected = [
      {
        kind: "Build",
        name: "module-b",
        type: "test",
      },
      {
        kind: "Run",
        name: "task-a",
        type: "test",
      },
    ]

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
    const graph = await garden.getResolvedConfigGraph({ log, emit: false })
    const expected = sortBy(
      graph.getActions().map((a) => getActionsToDetailedOutput(a, garden, graph)),
      "name"
    )
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
    const expected = sortBy(
      await Promise.all(graph.getActions().map(async (a) => getActionsToSimpleWithStateOutput(a, router, graph, log))),
      "name"
    )
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
    const expected = sortBy(
      await Promise.all(
        graph
          .getActions({ refs: args.names })
          .map(async (a) => getActionsToSimpleWithStateOutput(a, router, graph, log))
      ),
      "name"
    )
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
    const expected = sortBy(
      await Promise.all(
        graph.getActions().map(async (a) => getActionsToDetailedWithStateOutput(a, garden, router, graph, log))
      ),
      "name"
    )
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
    const expected = sortBy(graph.getDeploys().map(getActionsToSimpleOutput), "name")
    expect(command.outputsSchema().validate(result).error).to.be.undefined
    expect(result).to.eql({ actions: expected })
  })

  it("should return all actions sorted by kind and name when --sort=kind is set", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetActionsCommand()

    const { result } = await command.action({
      garden,
      log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "detail": false, "sort": "kind", "include-state": false, "kind": "" }),
    })
    const graph = await garden.getResolvedConfigGraph({ log, emit: false })
    const expected = sortBy(graph.getActions().map(getActionsToSimpleOutput), ["kind", "name"])
    expect(command.outputsSchema().validate(result).error).to.be.undefined
    expect(result).to.eql({ actions: expected })
  })

  it("should return all actions sorted by type and name when --sort=type is set", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetActionsCommand()

    const { result } = await command.action({
      garden,
      log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "detail": false, "sort": "type", "include-state": false, "kind": "" }),
    })
    const graph = await garden.getResolvedConfigGraph({ log, emit: false })
    const expected = sortBy(graph.getActions().map(getActionsToSimpleOutput), ["type", "name"])
    expect(command.outputsSchema().validate(result).error).to.be.undefined
    expect(result).to.eql({ actions: expected })
  })

  context("GARDEN_ENABLE_PARTIAL_RESOLUTION=true", () => {
    const originalValue = gardenEnv.GARDEN_ENABLE_PARTIAL_RESOLUTION

    before(() => {
      gardenEnv.GARDEN_ENABLE_PARTIAL_RESOLUTION = true
    })

    after(() => {
      gardenEnv.GARDEN_ENABLE_PARTIAL_RESOLUTION = originalValue
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

      const graph = await garden.getResolvedConfigGraph({ log, emit: false })
      const expected = sortBy(graph.getActions().map(getActionsToSimpleOutput), "name")

      expect(command.outputsSchema().validate(result).error).to.be.undefined
      expect(result?.actions).to.eql(expected)
    })

    it("should return specific actions by reference in a project", async () => {
      const garden = await makeTestGarden(projectRoot)
      const log = garden.log
      const command = new GetActionsCommand()

      const { result } = await command.action({
        garden,
        log,
        args: { names: ["run.task-a", "build.module-b"] },
        opts: withDefaultGlobalOpts({ "detail": false, "sort": "name", "include-state": false, "kind": "" }),
      })

      const expected = [
        {
          kind: "Build",
          name: "module-b",
          type: "test",
        },
        {
          kind: "Run",
          name: "task-a",
          type: "test",
        },
      ]

      expect(command.outputsSchema().validate(result).error).to.be.undefined
      expect(result?.actions).to.eql(expected)
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
      const expected = sortBy(graph.getDeploys().map(getActionsToSimpleOutput), "name")
      expect(command.outputsSchema().validate(result).error).to.be.undefined
      expect(result).to.eql({ actions: expected })
    })
  })
})
